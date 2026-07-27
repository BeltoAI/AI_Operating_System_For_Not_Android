import Foundation

/// The things people actually ask a calendar to do, beyond making an event.
///
/// The API layer could already move, cancel, invite and add a Meet — and none of it was reachable.
/// `ActionRouter` had a single calendar branch that only ever created, so "move it to Thursday",
/// "who accepted?", "take Rana off it" and "cancel tomorrow's call" all fell through to prose that
/// described the action instead of performing it. That is the same failure as the verb gate that
/// once made the calendar unreachable entirely, one level up: the capability existed, the words
/// people use to ask for it did not route anywhere.
///
/// Two rules run through everything here:
///
/// * **Name the event before touching it.** Every reply says which event was changed, with its
///   date, because "moved it" is unverifiable and the wrong event moved is a missed meeting.
/// * **Never guess between two candidates.** If the words match more than one event, it asks. An
///   assistant that picks one and cancels it has done something the owner cannot undo.
enum CalendarFlows {

    enum Verb {
        case create
        case move          // "move it to Thursday", "push the call an hour"
        case cancel        // "cancel tomorrow's meeting"
        case invite        // "add Carlos to it"
        case uninvite      // "take Rana off the invite"
        case addMeet       // "put a Meet link on it"
        case rename        // "call it Q3 planning instead"
        case agenda        // "add these notes to the invite"
        case whoIsComing   // "has anyone accepted?"
        case chase         // "chase whoever hasn't replied"
        case brief         // "send everyone a note before it"
        case followUp      // "send a follow-up to everyone who came"
    }

    /// Which of those was asked for. `nil` means this is not a calendar request at all.
    ///
    /// Order matters and is not alphabetical: "cancel" is checked before "invite", because "cancel
    /// the invite to Rana" is a cancellation, not an invitation. Each phrase list is the words
    /// people actually use, not the words the API uses.
    static func verb(in prompt: String) -> Verb? {
        let p = prompt.lowercased()

        // Questions first — "who is coming to the call" contains "call" and must not create one.
        if ["who accepted", "who declined", "who has accepted", "who's coming", "whos coming",
            "who is coming", "did they accept", "has anyone", "who replied", "who hasn't replied",
            "any rsvp", "rsvp"].contains(where: p.contains) { return .whoIsComing }

        if ["cancel", "call it off", "delete the meeting", "delete the event", "drop the meeting",
            "scrap the"].contains(where: p.contains) { return .cancel }

        if ["take ", "remove ", "uninvite", "drop ", "don't include", "dont include",
            "no longer coming"].contains(where: p.contains),
           ["invite", "meeting", "event", "call", "from it", "off it"].contains(where: p.contains) {
            return .uninvite
        }

        if ["move", "reschedule", "push", "shift", "change it to", "make it", "bump",
            "postpone", "bring it forward", "earlier", "later"].contains(where: p.contains),
           !p.contains("make it a") { return .move }

        if ["chase", "follow up with whoever", "nudge", "remind them", "hasn't replied",
            "havent replied", "no reply yet"].contains(where: p.contains) { return .chase }

        if ["follow-up", "follow up", "recap", "thank everyone", "after the meeting",
            "send notes"].contains(where: p.contains) { return .followUp }

        if ["brief", "before the meeting", "pre-meeting", "heads up", "agenda to everyone",
            "send everyone"].contains(where: p.contains) { return .brief }

        if ["add a meet", "add meet", "meet link to", "put a meet", "add a google meet",
            "add video", "make it a video call"].contains(where: p.contains) { return .addMeet }

        if ["agenda", "notes to the", "description", "add notes"].contains(where: p.contains) {
            return .agenda
        }

        if ["rename", "call it ", "retitle", "change the title"].contains(where: p.contains) {
            return .rename
        }

        if ["add ", "invite ", "include "].contains(where: p.contains),
           ["to it", "to the meeting", "to the call", "to the invite", "to the event"]
            .contains(where: p.contains) { return .invite }

        if ["meet", "invite", "schedule", "calendar", "book ", "blocker", "block my", "block out",
            "set up a call", "appointment", "event"].contains(where: p.contains) { return .create }

        return nil
    }

    // MARK: - Finding the event being talked about

    enum Match {
        case one(GoogleCalendar.Event)
        case many([GoogleCalendar.Event])
        case none
    }

    /// Which event the words refer to.
    ///
    /// "It" means the next one — that is what people mean, and it is right far more often than any
    /// cleverer rule. A name or a word from the title narrows it. Ambiguity is returned as
    /// ambiguity rather than resolved by picking the first, because the caller may be about to
    /// cancel it.
    static func find(_ prompt: String, within days: Int = 30) async -> Match {
        let events = (try? await GoogleCalendar.find(
            to: Date.now.addingTimeInterval(Double(days) * 86_400), max: 50)) ?? []
        guard !events.isEmpty else { return .none }

        let p = prompt.lowercased()
        let upcoming = events
            .filter { ($0.start ?? .distantPast) > Date.now.addingTimeInterval(-3_600) }
            .sorted { ($0.start ?? .distantFuture) < ($1.start ?? .distantFuture) }

        // A word from the title, or an attendee's name.
        let words = p.components(separatedBy: CharacterSet.alphanumerics.inverted)
            .filter { $0.count > 3 && !Self.noise.contains($0) }
        if !words.isEmpty {
            let hits = upcoming.filter { event in
                let hay = (event.title + " " + event.attendees.map(\.email).joined(separator: " "))
                    .lowercased()
                return words.contains { hay.contains($0) }
            }
            if hits.count == 1 { return .one(hits[0]) }
            if hits.count > 1 { return .many(hits) }
        }

        // "tomorrow's meeting", "the 3pm"
        if let window = BrainContext.dateWindow(prompt) {
            let onThatDay = upcoming.filter {
                guard let start = $0.start else { return false }
                return window.contains(start)
            }
            if onThatDay.count == 1 { return .one(onThatDay[0]) }
            if onThatDay.count > 1 { return .many(onThatDay) }
        }

        // Bare "it" — the next thing on the calendar.
        if ["it", "that", "the meeting", "the call", "the event"].contains(where: p.contains),
           let next = upcoming.first {
            return .one(next)
        }
        return upcoming.isEmpty ? .none : .many(upcoming)
    }

    private static let noise: Set<String> = [
        "move", "cancel", "invite", "remove", "take", "please", "meeting", "event", "calendar",
        "with", "from", "that", "this", "them", "they", "email", "send", "make", "have", "about",
        "tomorrow", "today", "tonight", "next", "week", "reschedule", "push", "link", "google"
    ]

    /// How to say "I found several" without making the owner start over.
    static func ambiguous(_ events: [GoogleCalendar.Event]) -> String {
        let list = events.prefix(5).map {
            "· **\($0.title)** — \($0.start?.formatted(date: .abbreviated, time: .shortened) ?? "no time")"
        }.joined(separator: "\n")
        return """
            **Nothing changed — I need to know which one.**

            \(list)

            Say the name, or the day, and I'll do it.
            """
    }
}
