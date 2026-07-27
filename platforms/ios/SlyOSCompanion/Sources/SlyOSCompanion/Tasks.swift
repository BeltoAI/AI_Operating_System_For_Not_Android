import EventKit
import Foundation
import Observation
import UserNotifications

/// Things to do, and things to be reminded of — Android's checklist, done the way iPhone should.
///
/// Android keeps its own list because it has to. iOS does not: the system Reminders database is
/// right there, it already syncs to the owner's Mac, iPad and Watch, it already fires notifications
/// the OS guarantees, and it is already what they open when they think "my list". A private list
/// inside SlyOS would be a second, worse place for tasks to be forgotten in — visible nowhere else,
/// syncing nowhere, notifying only while the app happens to be alive.
///
/// So SlyOS writes into a list of its own inside their Reminders. Ask it to remember something and
/// it appears on their Watch. Tick it off in Apple's app and SlyOS knows.
@Observable
final class Tasks {

    static let shared = Tasks()

    /// Its own list, not the default one. Dropping SlyOS's items into whatever list they already
    /// live in would mix machine-made entries with their own, and make "forget all of this" mean
    /// deleting things they wrote themselves.
    private static let listTitle = "SlyOS"

    struct Item: Identifiable, Equatable {
        let id: String
        var text: String
        var done: Bool
        var due: Date?
        var notes: String

        var isOverdue: Bool {
            guard let due, !done else { return false }
            return due < .now
        }
    }

    private let store = EKEventStore()
    private(set) var items: [Item] = []
    private(set) var blocked: String?

    private init() {}

    // MARK: - Reading

    @MainActor
    func load() async {
        guard await access() else {
            blocked = "SlyOS needs access to Reminders to keep your list."
            return
        }
        blocked = nil

        let calendar = listCalendar()
        let predicate = store.predicateForReminders(in: calendar.map { [$0] })
        let found: [EKReminder] = await withCheckedContinuation { cont in
            store.fetchReminders(matching: predicate) { cont.resume(returning: $0 ?? []) }
        }

        items = found
            .map { r in
                Item(id: r.calendarItemIdentifier,
                     text: r.title ?? "",
                     done: r.isCompleted,
                     due: r.dueDateComponents.flatMap { Calendar.current.date(from: $0) },
                     notes: r.notes ?? "")
            }
            // Undone first, then by when it is due, then by what it says — a list ordered by the
            // identifier Apple hands back is a list in no order at all.
            .sorted {
                if $0.done != $1.done { return !$0.done }
                switch ($0.due, $1.due) {
                case let (a?, b?): return a < b
                case (nil, _?):    return false
                case (_?, nil):    return true
                default:           return $0.text < $1.text
                }
            }
    }

    // MARK: - Writing

    /// Add something to the list, optionally with a time it should speak up.
    @discardableResult
    func add(_ text: String, due: Date? = nil, notes: String = "") async -> Bool {
        guard await access() else { return false }
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return false }

        let reminder = EKReminder(eventStore: store)
        reminder.title = trimmed
        reminder.notes = notes.isEmpty ? nil : notes
        reminder.calendar = listCalendar() ?? store.defaultCalendarForNewReminders()

        if let due {
            reminder.dueDateComponents = Calendar.current.dateComponents(
                [.year, .month, .day, .hour, .minute], from: due)
            // A due date alone is silent. Without an alarm the reminder sits in the list and never
            // says anything, which is not what "remind me at six" means to anybody.
            reminder.addAlarm(EKAlarm(absoluteDate: due))
        }

        do {
            try store.save(reminder, commit: true)
            await load()
            // The brain keeps it too, so "what did I say I'd do?" is answerable without Reminders.
            SlyStore.shared.insert(kind: "task", title: trimmed,
                                   body: due.map { "due \($0.formatted(date: .abbreviated, time: .shortened))" } ?? "",
                                   source: "Tasks", date: .now)
            return true
        } catch {
            return false
        }
    }

    func toggle(_ item: Item) async {
        guard let reminder = store.calendarItem(withIdentifier: item.id) as? EKReminder else { return }
        reminder.isCompleted = !reminder.isCompleted
        try? store.save(reminder, commit: true)
        await load()
    }

    func remove(_ item: Item) async {
        guard let reminder = store.calendarItem(withIdentifier: item.id) as? EKReminder else { return }
        try? store.remove(reminder, commit: true)
        await load()
    }

    // MARK: - Plumbing

    private func access() async -> Bool {
        (try? await store.requestFullAccessToReminders()) ?? false
    }

    /// The SlyOS list, made once on first use.
    private func listCalendar() -> EKCalendar? {
        let existing = store.calendars(for: .reminder).first { $0.title == Self.listTitle }
        if let existing { return existing }

        guard let source = store.defaultCalendarForNewReminders()?.source
                ?? store.sources.first(where: { $0.sourceType == .calDAV })
                ?? store.sources.first else { return nil }

        let made = EKCalendar(for: .reminder, eventStore: store)
        made.title = Self.listTitle
        made.source = source
        try? store.saveCalendar(made, commit: true)
        return made
    }
}

/// Timers — "ten minutes" said out loud, and something that actually goes off.
///
/// Deliberately *not* an in-app countdown. An app-local timer stops the moment iOS suspends the
/// process, which is roughly the moment the owner puts the phone down — which is the entire
/// situation a kitchen timer exists for. A scheduled notification is handed to the system and fires
/// whether or not SlyOS is running, or installed in memory, or the screen is on.
enum Timers {

    static func request() async -> Bool {
        (try? await UNUserNotificationCenter.current()
            .requestAuthorization(options: [.alert, .sound, .badge])) ?? false
    }

    /// Set a timer. Returns when it will fire, or nil if notifications are refused.
    @discardableResult
    static func set(_ seconds: TimeInterval, label: String = "Timer") async -> Date? {
        guard seconds >= 1, await request() else { return nil }

        let content = UNMutableNotificationContent()
        content.title = label
        content.body = "\(phrase(seconds)) is up."
        content.sound = .default
        content.interruptionLevel = .timeSensitive

        let request = UNNotificationRequest(
            identifier: "slyos.timer.\(UUID().uuidString)",
            content: content,
            trigger: UNTimeIntervalNotificationTrigger(timeInterval: seconds, repeats: false))

        do {
            try await UNUserNotificationCenter.current().add(request)
            return Date.now.addingTimeInterval(seconds)
        } catch {
            return nil
        }
    }

    /// Everything currently counting down.
    static func pending() async -> [(id: String, label: String, fires: Date)] {
        let requests = await UNUserNotificationCenter.current().pendingNotificationRequests()
        return requests.compactMap { r in
            guard r.identifier.hasPrefix("slyos.timer."),
                  let trigger = r.trigger as? UNTimeIntervalNotificationTrigger,
                  let fires = trigger.nextTriggerDate() else { return nil }
            return (id: r.identifier, label: r.content.title, fires: fires)
        }
        .sorted { $0.fires < $1.fires }
    }

    static func cancel(_ id: String) {
        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: [id])
    }

    /// "10 minutes", "1 hour 30 minutes" — for reading back what was understood, which is the only
    /// way someone catches a misheard duration before it fails to go off.
    static func phrase(_ seconds: TimeInterval) -> String {
        let total = Int(seconds.rounded())
        let h = total / 3600, m = (total % 3600) / 60, s = total % 60
        var parts: [String] = []
        if h > 0 { parts.append("\(h) hour\(h == 1 ? "" : "s")") }
        if m > 0 { parts.append("\(m) minute\(m == 1 ? "" : "s")") }
        if s > 0 && h == 0 { parts.append("\(s) second\(s == 1 ? "" : "s")") }
        return parts.isEmpty ? "0 seconds" : parts.joined(separator: " ")
    }

    /// Read a duration out of a request: "set a timer for 20 minutes", "remind me in an hour".
    static func duration(in text: String) -> TimeInterval? {
        let t = text.lowercased()
        var total: TimeInterval = 0

        // Written numbers, because people say "half an hour" far more often than "30 minutes".
        if t.contains("half an hour") || t.contains("half hour") { total += 1_800 }
        if t.contains("an hour") && !t.contains("half an hour") { total += 3_600 }

        for (pattern, unit) in [(#"(\d+)\s*(?:hours?|hrs?|h)\b"#, 3_600.0),
                                (#"(\d+)\s*(?:minutes?|mins?|m)\b"#, 60.0),
                                (#"(\d+)\s*(?:seconds?|secs?|s)\b"#, 1.0)] {
            if let match = t.firstMatch(pattern), let n = Double(match[1]) {
                total += n * unit
            }
        }
        return total > 0 ? total : nil
    }
}
