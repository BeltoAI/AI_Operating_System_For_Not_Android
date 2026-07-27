import Foundation

/// THE single source of truth for what the brain knows on any given request.
///
/// Every answering path — Home, the keyboard, the share extension, Siri, mail drafting — assembles
/// its context here, so they cannot drift apart. On Android the same function exists for the same
/// reason: when each surface built its own context, the Memory tab could answer a question that
/// Home AI, asked the same thing thirty seconds later, claimed to know nothing about.
///
/// It runs inside app extensions too, which constrains how it learns anything: an extension cannot
/// reach `GoogleAuth`, `Permissions` or `EventKit`. So live state is *published* into the App Group
/// by the app (see `Live`) and merely read here. The keyboard then knows Google is connected without
/// linking a single line of the code that connects it.
enum BrainContext {

    // MARK: - Live state

    /// What is actually switched on right now, shared across every process.
    ///
    /// Written by the app whenever connection or permission state changes; read by anything that
    /// builds a prompt. Defaults are all-off, which is the safe direction — claiming a capability
    /// that is not there is exactly the failure this whole file exists to prevent.
    struct Live {
        var googleConnected = false
        var calendarGranted = false
        var remindersGranted = false
        var contactsGranted = false
        var locationGranted = false
        var openClawReady = false

        private static let key = "brain.live"

        static var current: Live {
            let raw = SharedContainer.defaults.dictionary(forKey: key) as? [String: Bool] ?? [:]
            return Live(googleConnected: raw["google"] ?? false,
                        calendarGranted: raw["calendar"] ?? false,
                        remindersGranted: raw["reminders"] ?? false,
                        contactsGranted: raw["contacts"] ?? false,
                        locationGranted: raw["location"] ?? false,
                        openClawReady: raw["openclaw"] ?? false)
        }

        func publish() {
            SharedContainer.defaults.set([
                "google": googleConnected, "calendar": calendarGranted,
                "reminders": remindersGranted, "contacts": contactsGranted,
                "location": locationGranted, "openclaw": openClawReady
            ], forKey: Self.key)
        }
    }

    // MARK: - Capabilities

    /// What SlyOS can actually do on *this* phone, with live connection state.
    ///
    /// Both directions of this have gone wrong on Android, and each was worse than a plain mistake:
    ///
    /// * Asked to schedule a call and send a Meet link, the answering path said "I genuinely can't
    ///   do it — you'll have to do it manually." Google was connected and the action layer emits
    ///   exactly that action. It had taught the owner that a shipping feature did not exist.
    /// * Told what it could do, it over-corrected to "Done. Here's what was set up" for things that
    ///   had not happened. A false completion is worse than a false refusal, because the owner
    ///   stops checking.
    ///
    /// So the list is built from live state rather than from either prompt's imagination, and it is
    /// followed immediately by what counts as proof.
    ///
    /// Nothing here is aspirational. Android claims screen control and message sending because
    /// Android has an accessibility service; iOS has no such API at any entitlement level, so this
    /// list says drafting where Android says sending. A capability list that overstates the platform
    /// produces exactly the confident lie it was written to prevent.
    static func capabilities(_ live: Live = .current) -> String {
        var s = """

            WHAT YOU CAN ACTUALLY DO (you are an assistant that operates this phone — never tell the \
            owner you cannot do something on this list):

            """

        s += "• Calendar: create, move and cancel events and invite people by email"
        switch (live.googleConnected, live.calendarGranted) {
        case (true, _):
            s += " — Google IS connected, so real invitations and Google Meet links work.\n"
        case (false, true):
            s += " — on-device calendar only; Google is NOT connected, so no invitations or Meet "
                + "links until they connect it in Settings.\n"
        case (false, false):
            s += " — calendar access is OFF; ask them to turn it on in Settings.\n"
        }

        s += "• Email: read the mail that needs answering and send replies"
        s += live.googleConnected
            ? " — Gmail IS connected. Every send is shown to the owner to approve first.\n"
            : " — needs Google connected in Settings first.\n"

        s += "• Reminders: create reminders that really fire"
        s += live.remindersGranted ? ".\n" : " — reminders access is OFF; ask them to turn it on.\n"

        s += """
            • Replies: draft a reply in the owner's own voice for any app — through the SlyOS \
            keyboard, or by sharing a message to SlyOS. You write it; the owner presses send. iPhone \
            has no way for any app to send in WhatsApp, iMessage or Instagram, so never say a message \
            was sent through one of those.
            • Documents: real Google Docs, Sheets and Slides, PDFs, and deployed websites that come \
            back as a working link.
            • Memory: search everything the owner has imported — messages, mail, documents, photos of \
            text, receipts — by keyword and by meaning.
            • Also: camera and vision, reading and filing documents and receipts, research papers, \
            and answering out loud through Siri.

            """
        if live.openClawReady {
            s += "• A connected gateway that can reach other services on the owner's behalf, within "
                + "the limits they set.\n"
        }
        s += "If a request needs something switched on, say exactly which switch — never a flat "
            + "\"I can't\".\n"
        return s + proofClause
    }

    /// What counts as evidence that something happened.
    ///
    /// This paragraph exists because of one specific failure: "was the invite sent to Joslyn?" was
    /// answered with a confident yes for an invite Google's own record shows went to nobody. The
    /// brain held a memory saying the invite went out — its own earlier sentence — and a promise is
    /// indistinguishable from a receipt at retrieval time.
    static let proofClause = """

        WHAT COUNTS AS PROOF THAT SOMETHING HAPPENED: only a record of the action — a calendar, \
        outbox, document or message entry describing the completed action, with its details. A \
        message where you SAID you would do something, or described yourself doing it, is NOT proof, \
        and never becomes proof by being repeated. Asked whether something was actually sent, \
        invited, scheduled, emailed or created, look for the action record; if there isn't one, say \
        plainly that you can't confirm it and say how to check. Being wrong here costs the owner a \
        missed meeting and their trust in every other answer you give.

        AND NEVER CLAIM SOMETHING IS ALREADY DONE. You are the answering path — the action layer \
        carries things out separately. Say what you are doing or about to do ("creating that event \
        now, inviting them with a Meet link"), never "Done", never "here's what was set up", and \
        never invent a confirmation, link or invitation you have not been shown.
        """

    // MARK: - Building

    /// Everything relevant the brain holds about one request.
    ///
    /// Ordered by what survives truncation. The time and the capability list lead because they are
    /// tiny and everything depends on them — on Android the time was appended last and was the first
    /// casualty every time the context overflowed, which is how a scheduling assistant ended up not
    /// knowing what day it was.
    static func build(for question: String) async -> String {
        var s = "Current time: \(Date.now.formatted(.dateTime.weekday(.wide).year().month().day().hour().minute()))\n"
        s += capabilities()

        let store = SlyStore.shared

        // The people this question is about, as relationships rather than fragments.
        let dossiers = people(in: question).prefix(3).compactMap { dossier(for: $0, store: store) }
        if !dossiers.isEmpty {
            s += "\n\nYOUR ACTUAL RELATIONSHIP WITH THE PEOPLE NAMED HERE (from the message record — "
                + "these are people you KNOW):\n" + dossiers.joined(separator: "\n")
        }

        // "What did I do yesterday" matches no keyword. Dates need a date query.
        if let window = dateWindow(question) {
            let rows = store.between(window.lowerBound, window.upperBound, limit: 40)
            if !rows.isEmpty {
                let log = rows.prefix(40).map {
                    "[\($0.date.formatted(.dateTime.month().day().hour().minute()))] "
                    + ($0.person.isEmpty ? "" : "\($0.person): ")
                    + $0.body.trimmingCharacters(in: .whitespacesAndNewlines).prefix(200)
                }.joined(separator: "\n")
                s += "\n\nWHAT WENT THROUGH YOUR BRAIN IN THE PERIOD ASKED ABOUT (newest first — "
                    + "answer the date question from these):\n\(log.prefix(1_800))"
            }
        }

        // "Who did I email last?" — keyword search matches the word "email" in bodies instead.
        if asksAboutSending(question) {
            let sent = store.recentSent(limit: 8, platform: platform(in: question))
            if !sent.isEmpty {
                let lines = sent.map {
                    "• \($0.date.formatted(date: .abbreviated, time: .shortened)) → "
                    + "\($0.person.isEmpty ? "?" : $0.person): "
                    + $0.body.trimmingCharacters(in: .whitespacesAndNewlines).prefix(160)
                }.joined(separator: "\n")
                s += "\n\nTHE MOST RECENT THINGS YOU SENT (newest first — answer who/what you last "
                    + "sent from these):\n\(lines)"
            }
        }

        // The ranked hybrid recall — keyword and meaning, merged. The bulk of the context.
        let recalled = await AgentClient.corpus(for: question)
        if !recalled.isEmpty {
            s += "\n\nMOST RELEVANT MEMORIES (ranked best-first — the top lines matter most):\n"
                + recalled
        }

        return s
    }

    // MARK: - Question shape

    /// Candidate names in a question: capitalised words that aren't sentence-openers or common
    /// words, plus anything the brain already recognises as a person.
    ///
    /// Matching against known people rather than guessing is what stops "Do I have Randor?" being
    /// answered from the phone's contacts alone — and answered "no" about someone messaged daily.
    private static func people(in question: String) -> [String] {
        let words = question.components(separatedBy: CharacterSet.alphanumerics.inverted)
            .filter { $0.count > 2 }
        guard !words.isEmpty else { return [] }
        let lowered = Set(words.map { $0.lowercased() })

        var found = SlyStore.shared.knownPeople().filter { person in
            person.components(separatedBy: CharacterSet.alphanumerics.inverted)
                .contains { $0.count > 2 && lowered.contains($0.lowercased()) }
        }

        // A capitalised word mid-sentence that the brain has never seen is still probably a name,
        // and saying "I have no record of them" is a better answer than ignoring the word.
        if found.isEmpty {
            found = words.dropFirst().filter { $0.first?.isUppercase == true && !Self.stopWords.contains($0.lowercased()) }
        }
        return Array(NSOrderedSet(array: found)) as? [String] ?? []
    }

    private static let stopWords: Set<String> = [
        "the", "and", "what", "when", "where", "who", "how", "did", "does", "can", "will",
        "google", "gmail", "whatsapp", "telegram", "instagram", "linkedin", "slyos", "monday",
        "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday", "today", "tomorrow"
    ]

    private static func dossier(for name: String, store: SlyStore) -> String? {
        let d = store.dossier(person: name, limit: 5)
        guard d.total > 0, let last = d.last else {
            return "• \(name): nothing in your brain about them at all — it is safe to say you don't know them."
        }
        let days = Calendar.current.dateComponents([.day], from: last, to: .now).day ?? 0
        var line = "• \(name): \(d.total) exchanges in your brain"
        if let first = d.first {
            line += ", from \(first.formatted(date: .abbreviated, time: .omitted)) to "
                + "\(last.formatted(date: .abbreviated, time: .omitted))"
        }
        line += days > 30 ? ". You haven't spoken in \(days) days.\n" : ".\n"
        line += d.lines.map {
            "   – \($0.date.formatted(date: .abbreviated, time: .omitted)): "
            + $0.body.trimmingCharacters(in: .whitespacesAndNewlines).prefix(180)
        }.joined(separator: "\n")
        return line
    }

    private static func asksAboutSending(_ q: String) -> Bool {
        let l = q.lowercased()
        return ["did i send", "who did i", "who have i", "last email", "last message",
                "recently sent", "last texted", "last wrote", "have i emailed", "have i messaged",
                "did i email", "did i message", "did i text"].contains { l.contains($0) }
    }

    private static func platform(in q: String) -> String? {
        let l = q.lowercased()
        for name in ["whatsapp", "telegram", "instagram", "linkedin", "gmail"] where l.contains(name) {
            return name == "gmail" ? "Gmail" : name.capitalized
        }
        if l.contains("email") || l.contains("mail") { return "Gmail" }
        return nil
    }

    /// The period a question is about — "yesterday", "this week", "last Tuesday".
    ///
    /// Returns a half-open range, so a memory stamped at midnight belongs to exactly one day.
    static func dateWindow(_ q: String) -> Range<Date>? {
        let l = q.lowercased()
        let cal = Calendar.current
        let today = cal.startOfDay(for: .now)
        let day: TimeInterval = 86_400

        if l.contains("yesterday") { return (today - day)..<today }
        if l.contains("today") || l.contains("so far today") { return today..<(today + day) }
        if l.contains("last week") { return (today - 14 * day)..<(today - 7 * day) }
        if l.contains("this week") || l.contains("past week") { return (today - 7 * day)..<(today + day) }
        if l.contains("last month") || l.contains("this month") || l.contains("past month") {
            return (today - 31 * day)..<(today + day)
        }

        // "last Tuesday" / "on Friday" — the most recent one that has already happened.
        let names = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]
        guard let index = names.firstIndex(where: { l.contains($0) }) else { return nil }
        let todayIndex = cal.component(.weekday, from: today) - 1
        var back = (todayIndex - index + 7) % 7
        if back == 0 { back = 7 }
        let start = today - Double(back) * day
        return start..<(start + day)
    }
}
