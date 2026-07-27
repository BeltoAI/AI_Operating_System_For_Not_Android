import SwiftUI
import EventKit
import Observation
import UIKit

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

        // GOOGLE CALENDAR, READ DIRECTLY.
        //
        // EventKit only sees calendars the phone itself subscribes to. SlyOS creates events through
        // the Google API, so unless the owner has also added that Google account under iOS Settings
        // → Calendar, it was writing to a calendar it could not read back — "block my calendar at
        // six" succeeded and "what's on today?" answered nothing, which reads as the app lying
        // about what it did.
        if GoogleAuth.shared.isConnected {
            let end = Calendar.current.date(byAdding: .day, value: 2, to: .now) ?? .now
            if let google = try? await GoogleCalendar.find(to: end, max: 25) {
                // The same event can arrive twice when the account is BOTH synced to the phone and
                // read from the API. Matched on title and start rather than on id, because the two
                // sources give the same meeting different identifiers.
                let already = Set(found.map { "\($0.title)|\($0.when?.timeIntervalSince1970 ?? 0)" })
                for e in google {
                    guard let start = e.start else { continue }
                    let key = "\(e.title)|\(start.timeIntervalSince1970)"
                    guard !already.contains(key) else { continue }
                    var bits = [start.formatted(date: .omitted, time: .shortened)]
                    if !Calendar.current.isDateInToday(start) { bits.append("tomorrow") }
                    if !e.attendees.isEmpty {
                        bits.append("with " + e.attendees.map(\.email).joined(separator: ", "))
                    }
                    if !e.meetLink.isEmpty { bits.append("Meet") }
                    found.append(Item(id: e.id, title: e.title,
                                      detail: bits.joined(separator: " · "),
                                      when: start, kind: .event))
                }
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
        items = found
            .filter { !dismissed.contains($0.id) }
            .sorted { ($0.when ?? .distantFuture) < ($1.when ?? .distantFuture) }
        loading = false
    }

    // MARK: - Digest

    private(set) var digest = ""
    private(set) var digesting = false

    /// Summarise what is on, in the owner's own terms.
    ///
    /// Written from the same brain as everything else, so it can say "Ronan's LP call" rather than
    /// "Event at 17:00".
    @MainActor
    func catchUp() async {
        guard !digesting else { return }
        digesting = true
        defer { digesting = false }

        guard !items.isEmpty else { digest = "You're all caught up."; return }
        let lines = items.prefix(20).map { "\($0.title) — \($0.detail)" }.joined(separator: "\n")
        do {
            digest = try await AgentClient.complete(
                system: "You are SlyOS summarising the owner's next two days in three sentences or "
                      + "fewer. Plain, specific, no preamble and no bullet list. Say what actually "
                      + "needs them, and name people.",
                user: "WHAT'S ON:\n\(lines)",
                tier: .cheap)
        } catch {
            digest = ""
        }
    }

    // MARK: - Actions

    /// Dismissals are remembered, not just hidden.
    ///
    /// The underlying event or reminder still exists — SlyOS has no business deleting someone's
    /// calendar because they swiped a card away. What it records is that they have dealt with it, so
    /// it stops coming back on every reload.
    @ObservationIgnored
    private var dismissed: Set<String> {
        get { Set(SharedContainer.defaults.stringArray(forKey: "now.dismissed") ?? []) }
        set { SharedContainer.defaults.set(Array(newValue), forKey: "now.dismissed") }
    }

    @MainActor
    func dismiss(_ item: Item) {
        dismissed.insert(item.id)
        withAnimation(.easeOut(duration: 0.2)) { items.removeAll { $0.id == item.id } }
    }

    @MainActor
    func clearAll() {
        dismissed.formUnion(items.map(\.id))
        withAnimation(.easeOut(duration: 0.2)) { items.removeAll() }
    }

    /// Open the thing itself, in the app that owns it.
    @MainActor
    func open(_ item: Item) {
        let url = item.kind == .event
            ? URL(string: "calshow://")           // Calendar at today
            : URL(string: "x-apple-reminderkit://")
        if let url, UIApplication.shared.canOpenURL(url) { UIApplication.shared.open(url) }
    }
}


/// Recording the room, and what happens to it afterwards.
///
/// A live transcript on screen rather than a waveform: a waveform proves the microphone is on, and
/// a transcript proves it is *hearing you* — which is the thing you actually want to know sixty
/// seconds into a meeting you cannot repeat.
struct MeetingSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.palette) private var p
    @State private var notes = MeetingNotes.shared
    @State private var title = ""
    @State private var saving = false
    @State private var saved: String?
    @State private var tick = Date.now

    private let clock = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: T.md) {
                if let saved {
                    done(saved)
                } else {
                    header
                    live
                    controls
                }
            }
            .padding(T.md)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            .background(p.bg.ignoresSafeArea())
            .navigationTitle("Take notes")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(notes.isRecording ? "Discard" : "Close") {
                        notes.stop(); notes.discard(); dismiss()
                    }.tint(p.accent)
                }
            }
            .onReceive(clock) { tick = $0 }
        }
        .preferredColorScheme(nil)
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: T.xs) {
            TextField("", text: $title, prompt:
                Text("what is this? (optional)").foregroundStyle(p.inkFaint))
                .font(.system(size: T.prompt - 6)).foregroundStyle(p.ink)
                .textFieldStyle(.plain)
            Rectangle().fill(p.hairline).frame(height: 1)
            Text("Heard and written on this phone. Nothing is uploaded unless you save, and then "
                 + "only the text.")
                .font(.system(size: T.caption)).foregroundStyle(p.inkFaint)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var live: some View {
        ScrollView {
            Text(notes.transcript.isEmpty
                 ? (notes.isRecording ? "Listening…" : "Tap record and put the phone on the table.")
                 : notes.transcript)
                .font(.system(size: T.body))
                .foregroundStyle(notes.transcript.isEmpty ? p.inkFaint : p.ink)
                .frame(maxWidth: .infinity, alignment: .leading)
                .textSelection(.enabled)
        }
        .scrollIndicators(.hidden)
        .frame(maxHeight: .infinity)
    }

    private var controls: some View {
        VStack(spacing: T.sm) {
            if let problem = notes.problem {
                Text(problem).font(.system(size: T.caption)).foregroundStyle(p.danger)
                    .fixedSize(horizontal: false, vertical: true)
            }
            HStack(spacing: T.md) {
                Button {
                    Task {
                        if notes.isRecording { notes.stop() } else { await notes.start() }
                    }
                } label: {
                    HStack(spacing: 8) {
                        Circle().fill(notes.isRecording ? p.danger : p.accent).frame(width: 12, height: 12)
                        Text(notes.isRecording ? "Stop · \(notes.elapsed)" : "Record")
                            .font(.system(size: T.body, weight: .medium))
                    }
                    .foregroundStyle(p.ink)
                    .frame(maxWidth: .infinity).padding(.vertical, 14)
                    .background(Capsule().fill(p.bgElevated))
                }

                if !notes.transcript.isEmpty && !notes.isRecording {
                    Button {
                        Task {
                            saving = true
                            saved = await notes.save(title: title) ?? "too short to keep"
                            saving = false
                        }
                    } label: {
                        Text(saving ? "Saving…" : "Save")
                            .font(.system(size: T.body, weight: .medium)).foregroundStyle(.white)
                            .padding(.horizontal, T.lg).padding(.vertical, 14)
                            .background(Capsule().fill(p.accent))
                    }
                    .disabled(saving)
                }
            }
        }
    }

    private func done(_ name: String) -> some View {
        VStack(alignment: .leading, spacing: T.md) {
            Text("Saved").font(.system(size: T.prompt)).foregroundStyle(p.ink)
            Text("**\(name)** is in your brain — the whole transcript, plus a summary with the "
                 + "decisions and who owes what. Anything you agreed to is on your list.")
                .font(.system(size: T.body)).foregroundStyle(p.inkSoft)
                .fixedSize(horizontal: false, vertical: true)
            Text("Ask about it whenever: \"what did we decide about the timeline?\"")
                .font(.system(size: T.caption)).foregroundStyle(p.inkFaint)
            Spacer()
            Button("Done") { notes.discard(); dismiss() }
                .font(.system(size: T.body)).foregroundStyle(.white)
                .frame(maxWidth: .infinity).padding(.vertical, 14)
                .background(Capsule().fill(p.accent))
        }
    }
}

struct NowPanel: View {
    @Environment(\.palette) private var p
    @State private var feed = NowFeed()
    @State private var mail = MailWatch.shared
    @State private var replying: ConfirmSend.Payload?
    @State private var showOutbox = false
    @State private var showReconnect = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header

            if feed.loading {
                waiting("reading your day")
            } else if let blocked = feed.blocked {
                blockedState(blocked)
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 0) {
                        mailSection.padding(.top, T.lg)
                        digestCard.padding(.top, T.lg)
                        if feed.items.isEmpty { emptyState } else { list }
                    }
                    .padding(.bottom, T.md)
                }
                .scrollIndicators(.hidden)
            }

            Spacer(minLength: 0)
        }
        .padding(.horizontal, T.md)
        .task { await feed.load() }
        .task { await mail.refresh() }
        .sheet(item: Binding(get: { replying.map(IdentifiedPayload.init) },
                             set: { replying = $0?.payload })) { wrapper in
            ConfirmSend(payload: wrapper.payload) { approved in
                Task { _ = await ActionRouter.sendApproved(approved) }
            }
        }
        .sheet(isPresented: $showOutbox) { OutboxView() }
        .sheet(isPresented: $showReconnect) { ReconnectView() }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: T.xs) {
            Heading("Now")
            HStack(spacing: 14) {
                Text(Date.now.formatted(.dateTime.weekday(.wide).month(.abbreviated).day()))
                    .font(.system(size: T.caption)).foregroundStyle(p.inkFaint)
                Spacer()
                Button("Sent for you") { showOutbox = true }
                    .font(.system(size: T.caption)).foregroundStyle(p.inkSoft)
                Button("Reconnect") { showReconnect = true }
                    .font(.system(size: T.caption)).foregroundStyle(p.inkSoft)
            }
        }
        .padding(.top, T.md)
    }

    /// Mail that needs answering, with the reply already written.
    ///
    /// The one automatic inbox iOS permits, and the reason to open this screen at all: the replies
    /// are drafted before you look, so the work is approving rather than writing.
    @ViewBuilder
    private var mailSection: some View {
        if !mail.items.isEmpty || mail.loading {
            VStack(alignment: .leading, spacing: 10) {
                SectionHeader(title: "NEEDS A REPLY · \(mail.items.count)") {
                    if mail.loading { SlyOrbit(size: 12) }
                    else {
                        Text("↻").font(.system(size: T.small)).foregroundStyle(p.accent)
                            .padding(4)
                            .onTapGesture { Task { await mail.refresh() } }
                    }
                }

                ForEach(mail.items) { item in
                    SlyCard(onOpen: { replying = mail.payload(for: item) },
                            onClose: { mail.dismiss(item) }) {
                        mailCard(item)
                    }
                }
            }
            .padding(.bottom, T.sm)
        }
    }

    private func mailCard(_ item: MailWatch.Item) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top, spacing: 12) {
                SlyAvatar(name: item.from, tint: .hex(0xD44638), badge: "envelope.fill")
                VStack(alignment: .leading, spacing: 3) {
                    HStack {
                        Text(item.from)
                            .font(.system(size: T.body)).foregroundStyle(p.ink).lineLimit(1)
                        Spacer()
                        Text(item.received.formatted(.relative(presentation: .numeric)))
                            .font(.system(size: T.caption)).foregroundStyle(p.inkFaint)
                    }
                    HStack(spacing: 6) {
                        Text(item.subject)
                            .font(.system(size: T.small)).foregroundStyle(p.inkSoft).lineLimit(1)
                        // Human or machine, before you read a word of it. Automated mail still
                        // appears — a booking or a code is often the thing that matters — it just
                        // gets no reply written to an address that cannot receive one.
                        Text(item.automated ? "automated" : "person")
                            .font(.system(size: T.caption))
                            .foregroundStyle(item.automated ? p.inkFaint : p.accent)
                            .padding(.horizontal, 6).padding(.vertical, 1)
                            .background(Capsule().fill(item.automated ? p.hairline
                                                                      : p.accent.opacity(0.16)))
                    }
                    if let flag = item.flag {
                        Text(flag)
                            .font(.system(size: T.caption)).foregroundStyle(p.accent)
                    }
                    Text(item.snippet)
                        .font(.system(size: T.small)).foregroundStyle(p.inkSoft).lineLimit(2)
                }
            }
            .padding(14)

            // The draft, which is the whole point.
            Group {
                if item.automated {
                    Text("No reply drafted — this came from a system, not a person.")
                        .font(.system(size: T.caption)).foregroundStyle(p.inkFaint)
                        .padding(.horizontal, 14).padding(.bottom, 12)
                } else if item.drafting {
                    SlyWaiting("writing your reply")
                } else if let draft = item.draft, !draft.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        Text(draft)
                            .font(.system(size: T.small)).foregroundStyle(p.ink)
                            .fixedSize(horizontal: false, vertical: true)
                            .padding(12)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(RoundedRectangle(cornerRadius: 10).fill(p.bg))

                        HStack(spacing: 10) {
                            Button {
                                replying = mail.payload(for: item)
                            } label: {
                                Text("Review & send")
                                    .font(.system(size: T.small, weight: .medium))
                                    .foregroundStyle(p.bgElevated)
                                    .padding(.horizontal, T.md).padding(.vertical, 8)
                                    .background(Capsule().fill(p.accent))
                            }
                            Button {
                                UIPasteboard.general.string = draft
                            } label: {
                                Text("Copy")
                                    .font(.system(size: T.small)).foregroundStyle(p.accent)
                                    .padding(.horizontal, T.md).padding(.vertical, 8)
                                    .background(Capsule().fill(p.hairline))
                            }
                            Spacer()
                        }
                    }
                }
            }
            .padding(.horizontal, 14).padding(.bottom, 14)
        }
    }

    /// "WHAT YOU MISSED" — a written summary of the day so far, on demand.
    ///
    /// 18pt corners and 18pt padding, wider than the list cards, exactly as Compose sets it: this is
    /// a panel you read, not an item you act on.
    private var digestCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionHeader(title: "WHAT YOU MISSED") {
                if feed.digesting { SlyOrbit(size: 12) }
                else {
                    Text("↻").font(.system(size: T.small)).foregroundStyle(p.accent)
                        .padding(4)
                        .onTapGesture { Task { await feed.catchUp() } }
                }
            }
            if feed.digesting && feed.digest.isEmpty {
                SlyWaiting("reading your day")
            } else if feed.digest.isEmpty {
                Text(feed.items.isEmpty ? "You're all caught up." : "Tap ↻ for a summary.")
                    .font(.system(size: T.small)).foregroundStyle(p.inkSoft)
            } else {
                Text(feed.digest)
                    .font(.system(size: T.small)).foregroundStyle(p.ink)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(18)
        .background(RoundedRectangle(cornerRadius: 18).fill(p.bgElevated))
    }

    private var list: some View {
        VStack(alignment: .leading, spacing: 0) {
            SectionHeader(title: "WAITING · \(feed.items.count)") {
                Button("Clear all") { feed.clearAll() }
                    .font(.system(size: T.caption))
                    .foregroundStyle(p.danger)
            }
            .padding(.top, T.lg).padding(.bottom, 10)

            LazyVStack(alignment: .leading, spacing: 10) {
                ForEach(feed.items) { item in
                    SlyCard(onOpen: { feed.open(item) },
                            onClose: { feed.dismiss(item) }) {
                        itemBody(item)
                    }
                }
            }
        }
    }

    /// One card. Avatar, who, where it came from, then the detail — the same anatomy as Android's
    /// notification card, which is what makes the two feeds read as the same screen.
    private func itemBody(_ item: NowFeed.Item) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top, spacing: 12) {
                SlyAvatar(name: item.title,
                          tint: item.kind == .event ? .hex(0x4285F4) : p.accent,
                          badge: item.kind == .event ? "calendar" : "checkmark")
                VStack(alignment: .leading, spacing: 3) {
                    Text(item.title)
                        .font(.system(size: T.body)).foregroundStyle(p.ink)
                        .lineLimit(1)
                    Text(item.kind == .event ? "in your calendar" : "a reminder")
                        .font(.system(size: T.caption))
                        .foregroundStyle(item.kind == .event ? .hex(0x4285F4) : p.accent)
                    Text(item.detail)
                        .font(.system(size: T.small))
                        .foregroundStyle(item.detail == "overdue" ? p.danger : p.inkSoft)
                        .lineLimit(6)
                }
                Spacer(minLength: 0)
            }
            .padding(14)

            HStack {
                Spacer()
                Text("Open ↗")
                    .font(.system(size: T.small)).foregroundStyle(p.inkSoft)
                    .padding(4)
                    .onTapGesture { feed.open(item) }
            }
            .padding(.horizontal, 14).padding(.bottom, 12)
        }
    }

    private var emptyState: some View {
        VStack(alignment: .leading, spacing: T.sm) {
            SectionHeader("WAITING · 0").padding(.top, T.lg)
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

    private func waiting(_ s: String) -> some View {
        VStack { Spacer(); SlyWaiting(s, orbit: 34); Spacer() }
            .frame(maxWidth: .infinity)
    }
}
