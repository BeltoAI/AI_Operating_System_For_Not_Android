import SwiftUI
import EventKit
import Observation

/// What needs you — the iOS answer to Android's notification queue.
///
/// Android fills this from notifications it reads as they arrive. iOS cannot do that at any
/// entitlement level, so Now is built from what iOS *does* expose: what's on your calendar today,
/// and what you've asked to be reminded of. That is a smaller promise, and it is one the app can
/// actually keep.
@Observable
final class NowFeed {

    struct Item: Identifiable {
        let id: String
        let title: String
        let detail: String
        let when: Date?
        let kind: Kind
        var done = false

        enum Kind { case event, reminder }
    }

    private(set) var items: [Item] = []
    private(set) var loading = false
    private(set) var blocked: String?

    private let store = EKEventStore()

    /// Everything between now and the end of tomorrow, plus anything overdue.
    @MainActor
    func load() async {
        loading = true
        blocked = nil
        var found: [Item] = []

        let calendarOK = (try? await store.requestFullAccessToEvents()) ?? false
        let remindersOK = (try? await store.requestFullAccessToReminders()) ?? false

        if !calendarOK && !remindersOK {
            blocked = "Now needs calendar or reminder access to show you anything."
            loading = false
            return
        }

        if calendarOK {
            let start = Date()
            let end = Calendar.current.date(byAdding: .day, value: 2, to: start) ?? start
            let predicate = store.predicateForEvents(withStart: start, end: end, calendars: nil)
            found += store.events(matching: predicate).compactMap { e in
                guard let title = e.title, !title.isEmpty else { return nil }
                var bits: [String] = []
                if let start = e.startDate {
                    bits.append(start.formatted(date: .omitted, time: .shortened))
                    if !Calendar.current.isDateInToday(start) { bits.append("tomorrow") }
                }
                if let location = e.location, !location.isEmpty { bits.append(location) }
                let people = (e.attendees ?? []).compactMap(\.name).filter { !$0.isEmpty }
                if !people.isEmpty { bits.append("with \(people.joined(separator: ", "))") }
                return Item(id: e.eventIdentifier ?? UUID().uuidString,
                            title: title, detail: bits.joined(separator: " · "),
                            when: e.startDate, kind: .event)
            }
        }

        if remindersOK {
            let predicate = store.predicateForIncompleteReminders(
                withDueDateStarting: nil,
                ending: Calendar.current.date(byAdding: .day, value: 2, to: Date()),
                calendars: nil)
            let reminders: [EKReminder] = await withCheckedContinuation { cont in
                store.fetchReminders(matching: predicate) { cont.resume(returning: $0 ?? []) }
            }
            found += reminders.map { r in
                let due = r.dueDateComponents.flatMap(Calendar.current.date(from:))
                let overdue = due.map { $0 < Date() } ?? false
                return Item(id: r.calendarItemIdentifier,
                            title: r.title ?? "Reminder",
                            detail: overdue ? "overdue"
                                            : (due?.formatted(date: .omitted, time: .shortened) ?? "no time set"),
                            when: due, kind: .reminder)
            }
        }

        // Soonest first; anything without a time sinks to the bottom rather than jumping the queue.
        items = found.sorted { ($0.when ?? .distantFuture) < ($1.when ?? .distantFuture) }
        loading = false
    }
}

struct NowPanel: View {
    @Environment(\.palette) private var p
    @State private var feed = NowFeed()

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header

            if feed.loading {
                centred("Looking…")
            } else if let blocked = feed.blocked {
                blockedState(blocked)
            } else if feed.items.isEmpty {
                emptyState
            } else {
                list
            }

            Spacer(minLength: 0)
        }
        .padding(.horizontal, T.md)
        .task { await feed.load() }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: T.xs) {
            Heading("Now")
            Text(Date.now.formatted(.dateTime.weekday(.wide).month(.abbreviated).day()))
                .font(.system(size: T.body)).foregroundStyle(p.inkFaint)
        }
        .padding(.top, T.md)
    }

    private var list: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("\(feed.items.count) WAITING")
                .font(.system(size: T.small, weight: .bold)).tracking(2)
                .foregroundStyle(p.inkFaint)
                .padding(.top, T.lg).padding(.bottom, T.sm)

            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0) {
                    ForEach(feed.items) { item in
                        HStack(alignment: .top, spacing: T.md) {
                            Image(systemName: item.kind == .event ? "calendar" : "checkmark.circle")
                                .font(.system(size: 17))
                                .foregroundStyle(p.accent)
                                .frame(width: 22)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(item.title)
                                    .font(.system(size: T.body)).foregroundStyle(p.ink)
                                Text(item.detail)
                                    .font(.system(size: T.caption))
                                    .foregroundStyle(item.detail == "overdue" ? p.danger : p.inkFaint)
                            }
                            Spacer()
                        }
                        .padding(.vertical, T.sm)
                        Hairline().opacity(0.6)
                    }
                }
            }
            .scrollIndicators(.hidden)
        }
    }

    private var emptyState: some View {
        VStack(alignment: .leading, spacing: T.sm) {
            Text("WAITING · 0")
                .font(.system(size: T.small, weight: .bold)).tracking(2)
                .foregroundStyle(p.inkFaint)
                .padding(.top, T.lg)
            Text("All caught up.")
                .font(.system(size: 28)).foregroundStyle(p.ink)
            Text("Nothing on your calendar or reminders for the next two days.")
                .font(.system(size: T.body)).foregroundStyle(p.inkFaint)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func blockedState(_ message: String) -> some View {
        VStack(alignment: .leading, spacing: T.sm) {
            Text("Nothing to show yet.")
                .font(.system(size: 28)).foregroundStyle(p.ink)
                .padding(.top, T.lg)
            Text(message)
                .font(.system(size: T.body)).foregroundStyle(p.inkFaint)
                .fixedSize(horizontal: false, vertical: true)
            Button("Open Settings") { Permissions.shared.openSettings() }
                .font(.system(size: T.body))
                .foregroundStyle(p.ink)
                .padding(.horizontal, T.lg).padding(.vertical, 10)
                .background(Capsule().fill(p.accent))
                .padding(.top, T.sm)
        }
    }

    private func centred(_ s: String) -> some View {
        VStack { Spacer(); Text(s).font(.system(size: T.body)).foregroundStyle(p.inkFaint); Spacer() }
            .frame(maxWidth: .infinity)
    }
}
