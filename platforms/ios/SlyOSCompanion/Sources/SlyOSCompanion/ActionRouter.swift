import Foundation

/// What SlyOS can actually *do*, and — just as importantly — what it must never claim to do.
///
/// Android has a ToolRouter that executes; iOS had nothing, so "send a message to Joslyn on
/// WhatsApp" produced the sentence "I'll send a message to Joslyn on WhatsApp" and then no message.
/// That is worse than a missing feature. It is the app lying, and it is the specific failure that
/// cost the Android build its owner's trust when it claimed to have invited someone it never had.
///
/// The rule here is absolute: **a channel SlyOS cannot reach is never described as done or
/// promised.** It offers the draft and says plainly who has to send it.
enum ActionRouter {

    enum Channel {
        case email(to: String)
        case whatsapp(to: String)
        case telegram(to: String)
        case sms(to: String)
        case calendar
        case task
        case timer
        case unknown

        /// Whether this phone can complete it without a human.
        var reachable: Bool {
            switch self {
            case .email: GoogleAuth.shared.isConnected
            case .calendar: GoogleAuth.shared.isConnected
            // Nothing on iOS can put text into WhatsApp and press send. A gateway can.
            case .whatsapp, .telegram:
                OpenClaw.shared.isConfigured && OpenClaw.shared.allowActions
            // iOS can open Messages pre-filled, but the human still taps send.
            // Both are on-device and need no account, which is the point of them: they work on a
            // phone with no API key and no Google connected at all.
            case .task, .timer: true
            case .sms, .unknown: false
            }
        }

        var name: String {
            switch self {
            case .email: "email"
            case .whatsapp: "WhatsApp"
            case .telegram: "Telegram"
            case .sms: "Messages"
            case .calendar: "your calendar"
            case .task: "your list"
            case .timer: "a timer"
            case .unknown: "that"
            }
        }
    }

    struct Intent {
        let channel: Channel
        let recipient: String
        let instruction: String
    }

    /// Read a request. Deliberately conservative: an unrecognised request is a question, not an
    /// action, because treating a question as an action is how an assistant sends something nobody
    /// asked for.
    static func detect(_ prompt: String) -> Intent? {
        let p = prompt.lowercased()
        let recipient = person(in: prompt)

        // Calendar is checked FIRST and has its own vocabulary.
        //
        // It used to sit behind a messaging verb gate — "send", "email", "tell" — so "block my
        // calendar 6 to 6:30" and "create a Meet and invite Joslyn" never reached it and fell
        // through to prose that claimed the thing was done. The calendar branch was unreachable by
        // the very phrasings people actually use for it.
        let calendarWords = ["meet", "invite", "schedule", "calendar", "book ", "blocker",
                             "block my", "block out", "set up a call", "appointment", "event"]
        if calendarWords.contains(where: p.contains) {
            return Intent(channel: .calendar, recipient: recipient, instruction: prompt)
        }

        // Timers before tasks. "Remind me in 20 minutes" is a timer, and it contains "remind me" —
        // routed to the list it would sit there silently, which is the opposite of what was asked.
        if p.contains("timer") || (p.contains("remind me in") && Timers.duration(in: p) != nil) {
            return Intent(channel: .timer, recipient: "", instruction: prompt)
        }
        let taskWords = ["remind me", "add to my list", "add to the list", "put on my list",
                         "to-do", "todo", "to do list", "don't let me forget", "dont let me forget",
                         "remember to"]
        if taskWords.contains(where: p.contains) {
            return Intent(channel: .task, recipient: "", instruction: prompt)
        }

        let verbs = ["send", "message", "write to", "text ", "email", "reply to", "tell ", "dm "]
        guard verbs.contains(where: p.contains) else { return nil }

        if p.contains("whatsapp") { return Intent(channel: .whatsapp(to: recipient), recipient: recipient, instruction: prompt) }
        if p.contains("telegram") { return Intent(channel: .telegram(to: recipient), recipient: recipient, instruction: prompt) }
        if p.contains("email") || p.contains("mail ") { return Intent(channel: .email(to: recipient), recipient: recipient, instruction: prompt) }
        if p.contains("text ") || p.contains("sms") || p.contains("imessage") {
            return Intent(channel: .sms(to: recipient), recipient: recipient, instruction: prompt)
        }
        return nil
    }

    /// What to actually put on the list.
    ///
    /// Everything after the asking phrase, with the leading "to" gone — "remind me to call the vet"
    /// is the task "call the vet", not "to call the vet".
    private static func taskText(_ prompt: String) -> String {
        var text = prompt
        for opener in ["don't let me forget to", "dont let me forget to", "don't let me forget",
                       "dont let me forget", "remind me to", "remind me", "remember to",
                       "add to my list", "add to the list", "put on my list", "todo", "to-do"] {
            if let range = text.range(of: opener, options: [.caseInsensitive]) {
                text = String(text[range.upperBound...])
                break
            }
        }
        // A trailing time belongs to the due date, not to the words on the list.
        for tail in [" at ", " tomorrow", " today", " tonight", " this evening", " in the morning"] {
            if let range = text.range(of: tail, options: [.caseInsensitive, .backwards]) {
                text = String(text[..<range.lowerBound])
            }
        }
        return text
            .trimmingCharacters(in: CharacterSet(charactersIn: " ,.:;-–—"))
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// What the timer is for, when they said — "timer for the pasta" reads better than "Timer".
    private static func timerLabel(_ prompt: String) -> String {
        guard let range = prompt.range(of: "for the ", options: [.caseInsensitive]) else {
            return "Timer"
        }
        let rest = prompt[range.upperBound...]
            .trimmingCharacters(in: CharacterSet(charactersIn: " ,.:;"))
        // "for the pasta" is a label; "for the next 10 minutes" is the duration said again.
        guard !rest.isEmpty, Timers.duration(in: rest) == nil else { return "Timer" }
        return rest.prefix(1).uppercased() + rest.dropFirst().prefix(40)
    }

    /// Best guess at who is being addressed — the word after "to", or a capitalised name.
    /// A calendar request needs a time. Vague ones are asked about rather than guessed at — an
    /// event at the wrong hour, emailed to someone, is worse than a question.
    static func when(in prompt: String) -> (start: Date, end: Date)? {
        let p = prompt.lowercased()
        var day = Date()
        if p.contains("tomorrow") { day = Calendar.current.date(byAdding: .day, value: 1, to: day) ?? day }

        // "right now", "from now" — the start is this moment, and demanding a stated hour for it
        // is why a perfectly clear request came back as "I need a time".
        if p.contains("right now") || p.contains("from now") || p.contains("starting now") {
            let start = Date()
            if let range = p.firstMatch(#"(?:until|till|to)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?"#) {
                var hour = Int(range[1]) ?? 0
                let minute = Int(range[2]) ?? 0
                if range[3] == "pm", hour < 12 { hour += 12 }
                if range[3].isEmpty, hour < 8 { hour += 12 }
                var parts = Calendar.current.dateComponents([.year, .month, .day], from: start)
                parts.hour = hour; parts.minute = minute
                if let end = Calendar.current.date(from: parts), end > start { return (start, end) }
            }
            return (start, start.addingTimeInterval(1800))
        }

        guard let m = p.firstMatch(#"(\d{1,2})(?::(\d{2}))?\s*(am|pm)?"#) else { return nil }
        var hour = Int(m[1]) ?? 0
        let minute = Int(m[2]) ?? 0
        let meridiem = m[3]
        if meridiem == "pm", hour < 12 { hour += 12 }
        if meridiem == "am", hour == 12 { hour = 0 }
        // No am/pm on a small number: assume the working day rather than the small hours.
        if meridiem.isEmpty, hour < 8 { hour += 12 }

        var parts = Calendar.current.dateComponents([.year, .month, .day], from: day)
        parts.hour = hour; parts.minute = minute
        guard let start = Calendar.current.date(from: parts) else { return nil }

        // "6 to 6:30" states its own end. Defaulting to an hour would silently book twice the time
        // the owner asked to block.
        if let range = p.firstMatch(#"(?:to|until|till|-|–)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?"#) {
            var endHour = Int(range[1]) ?? hour
            let endMinute = Int(range[2]) ?? 0
            let endMeridiem = range[3]
            if endMeridiem == "pm", endHour < 12 { endHour += 12 }
            if endMeridiem.isEmpty, endHour < hour { endHour += 12 }   // 6 to 6:30 pm
            var endParts = parts
            endParts.hour = endHour; endParts.minute = endMinute
            if let end = Calendar.current.date(from: endParts), end > start { return (start, end) }
        }
        return (start, start.addingTimeInterval(3600))
    }

    private static func person(in prompt: String) -> String {
        if let m = prompt.firstMatch(#"(?i)\b(?:to|message|text|tell)\s+([A-Z][\w'-]+)"#),
           !isCommandWord(m[1]) { return m[1] }

        // Any capitalised word — but not the verb the sentence opens with. "Email her I love her"
        // capitalises "Email", and taking that as the recipient produced the flatly contradictory
        // "I don't have an email address for Email. Here's the draft: To: joslyn@…".
        if let m = prompt.firstMatch(#"\b([A-Z][a-z]{2,})\b"#), !isCommandWord(m[1]) {
            return m[1]
        }

        // "email her", "text him" — a pronoun means the person the conversation is already about.
        // Without this, the commonest way anyone phrases a follow-up resolves to nobody.
        let p = prompt.lowercased()
        if ["her", "him", "them", "they"].contains(where: { p.contains(" \($0) ") || p.hasSuffix(" \($0)") }) {
            if let recent = recentPerson() { return recent }
        }
        return ""
    }

    /// Words that open a sentence and are never a name.
    private static func isCommandWord(_ word: String) -> Bool {
        [
            "email", "mail", "send", "message", "text", "tell", "write", "reply", "draft",
            "create", "make", "build", "block", "add", "set", "remind", "schedule", "book",
            "invite", "google", "meet", "calendar", "gmail", "whatsapp", "telegram", "instagram",
            "slyos", "please", "hey", "can", "could", "would", "what", "when", "where", "who",
            "today", "tomorrow", "tonight", "monday", "tuesday", "wednesday", "thursday",
            "friday", "saturday", "sunday"
        ].contains(word.lowercased())
    }

    /// The last person the conversation named, for resolving a pronoun.
    private static func recentPerson() -> String? {
        for turn in HomeChat.context(6).reversed() {
            for word in turn.text.components(separatedBy: CharacterSet.alphanumerics.inverted)
            where word.count > 2 && word.first?.isUppercase == true && !isCommandWord(word) {
                return word
            }
        }
        return nil
    }

    struct Outcome {
        let text: String
        /// True only when something actually left the phone.
        let didSomething: Bool
        /// Set when the action needs the owner to read and approve it first.
        var confirm: ConfirmSend.Payload?
    }

    /// Actually send an email the owner has just approved.
    static func sendApproved(_ payload: ConfirmSend.Payload) async -> String {
        do {
            try await Gmail.send(to: payload.recipient,
                                 subject: payload.subject ?? "",
                                 body: payload.body)
            Outbox.shared.record(what: "Email to \(payload.recipient)",
                                 detail: payload.subject ?? "", outcome: "sent")
            return "Sent to \(payload.recipient)."
        } catch {
            Outbox.shared.record(what: "Email to \(payload.recipient)",
                                 detail: error.localizedDescription, outcome: "failed")
            return "Couldn't send it — \(error.localizedDescription)"
        }
    }

    /// Models like writing "To:" and "Subject:" into the body. Left in, the recipient sees them
    /// twice.
    private static func stripHeaders(from draft: String) -> String {
        draft.split(separator: "\n", omittingEmptySubsequences: false)
            .drop { $0.firstMatch(#"(?i)^(to|subject|from|cc):"#) != nil || $0.isEmpty }
            .joined(separator: "\n")
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// Carry out what can be carried out, and be honest about the rest.
    static func perform(_ intent: Intent, draft: String) async -> Outcome {
        switch intent.channel {
        case .email(let to):
            guard GoogleAuth.shared.isConnected else {
                return Outcome(text: notConnected("Google", draft: draft), didSomething: false)
            }
            let address = to.contains("@") ? to : (await lookUpEmail(for: intent.recipient) ?? "")
            guard !address.isEmpty else {
                return Outcome(text: "I don't have an email address for \(intent.recipient). Here's "
                               + "the draft:\n\n\(draft)", didSomething: false)
            }
            // Proposed, never sent outright. An email is not undoable, and the one time the
            // address or the wording is wrong there is no recovering it.
            return Outcome(
                text: "",
                didSomething: false,
                confirm: ConfirmSend.Payload(
                    recipient: address,
                    subject: subject(of: draft),
                    body: stripHeaders(from: draft),
                    action: "Email \(intent.recipient.isEmpty ? address : intent.recipient)"))

        case .whatsapp, .telegram:
            // The honest case, and the one that was lying before.
            guard intent.channel.reachable else {
                return Outcome(text: cannotSend(intent.channel, to: intent.recipient, draft: draft),
                               didSomething: false)
            }
            do {
                _ = try await OpenClaw.shared.invoke(
                    tool: "messages.send",
                    args: ["to": intent.recipient, "text": draft],
                    confirmed: true)
                Outbox.shared.record(what: "\(intent.channel.name) to \(intent.recipient)",
                                     detail: draft, outcome: "sent")
                return Outcome(text: "Sent to \(intent.recipient) on \(intent.channel.name).\n\n\(draft)",
                               didSomething: true)
            } catch {
                return Outcome(text: "Your gateway refused it — \(error.localizedDescription)\n\n\(draft)",
                               didSomething: false)
            }

        case .calendar:
            guard GoogleAuth.shared.isConnected else {
                return Outcome(text: notConnected("Google", draft: draft), didSomething: false)
            }
            // Anything that is not "create" goes to the flow layer. The API could already move,
            // cancel, invite, un-invite and add a Meet — none of it was reachable, because this
            // branch only ever created, so every one of those requests fell through to prose that
            // described the action instead of doing it.
            if let verb = CalendarFlows.verb(in: intent.instruction), verb != .create {
                return await runFlow(verb, intent: intent, draft: draft)
            }
            guard let slot = when(in: intent.instruction) else {
                return Outcome(text: "**Nothing created** — I need a time. Say when, and I'll make "
                               + "the event and send the invite.", didSomething: false)
            }
            // "Block my calendar" is for the owner alone — inviting someone to it would be absurd.
            let said = intent.instruction.lowercased()
            let blocker = ["block", "busy", "hold "].contains { said.contains($0) }
            // Asked for outright, in any of the ways people say it.
            let wantsMeet = ["google meet", "meet link", "video call", "hangout", "zoom",
                             "a meet", "with meet", "include a meet", "call link"]
                .contains { said.contains($0) }
            let guests = (blocker || intent.recipient.isEmpty)
                ? []
                : [await lookUpEmail(for: intent.recipient)].compactMap { $0 }
            do {
                let event = try await GoogleCalendar.create(
                    title: title(from: intent.instruction),
                    start: slot.start, end: slot.end,
                    attendees: guests,
                    // A Meet link when there are guests — or whenever one was actually asked for.
                    //
                    // The condition used to be guests-only, so "block my calendar until 12:30" then
                    // "include a Google Meet" created the event and silently ignored the Meet. A
                    // solo event with a room is a perfectly ordinary thing to want: you make the
                    // link first and send it to someone after.
                    withMeet: wantsMeet || (!blocker && !guests.isEmpty))

                let who = guests.isEmpty ? "nobody else" : guests.joined(separator: ", ")
                Activity.record(.scheduled, event.title,
                                detail: "\(slot.start.formatted(date: .abbreviated, time: .shortened))"
                                    + (guests.isEmpty ? "" : " · invited \(guests.joined(separator: ", "))"))
                Outbox.shared.record(what: "Calendar invite — \(event.title)",
                                     detail: "\(slot.start.formatted()) · invited \(who)",
                                     outcome: "sent")
                var text = "Created **\(event.title)** for \(slot.start.formatted(date: .abbreviated, time: .shortened))."
                if !event.meetLink.isEmpty { text += "\n\nMeet: \(event.meetLink)" }
                if !guests.isEmpty {
                    text += "\n\nInvite emailed to \(who)."
                } else if !blocker && !intent.recipient.isEmpty {
                    text += "\n\n**Nobody was invited** — I don't have an email address for "
                        + "\(intent.recipient)."
                }
                return Outcome(text: text, didSomething: true)
            } catch {
                Outbox.shared.record(what: "Calendar invite", detail: error.localizedDescription,
                                     outcome: "failed")
                return Outcome(text: "**Not created** — \(error.localizedDescription)", didSomething: false)
            }

        case .timer:
            guard let seconds = Timers.duration(in: intent.instruction) else {
                return Outcome(text: "**No timer set** — I couldn't tell how long for. Try "
                               + "\"set a timer for 10 minutes\".", didSomething: false)
            }
            guard let fires = await Timers.set(seconds, label: timerLabel(intent.instruction)) else {
                return Outcome(text: "**No timer set** — SlyOS needs permission to send "
                               + "notifications, or nothing can go off. Turn it on in Settings.",
                               didSomething: false)
            }
            Activity.record(.scheduled, "a timer for \(Timers.phrase(seconds))")
            Outbox.shared.record(what: "Timer — \(Timers.phrase(seconds))",
                                 detail: "goes off \(fires.formatted(date: .omitted, time: .shortened))",
                                 outcome: "sent")
            // The duration is read back deliberately. A misheard "fifteen" for "fifty" is only ever
            // caught here — by the time it fails to go off, whatever it was for is over.
            return Outcome(text: "Timer set for **\(Timers.phrase(seconds))** — goes off at "
                           + "\(fires.formatted(date: .omitted, time: .shortened)).",
                           didSomething: true)

        case .task:
            let what = taskText(intent.instruction)
            guard !what.isEmpty else {
                return Outcome(text: "**Nothing added** — I couldn't tell what to put on the list.",
                               didSomething: false)
            }
            let due = Self.when(in: intent.instruction)?.start
            guard await Tasks.shared.add(what, due: due) else {
                return Outcome(text: "**Nothing added** — SlyOS needs access to Reminders. Turn it "
                               + "on in Settings.", didSomething: false)
            }
            Activity.record(.scheduled, what, detail: "on your list")
            Outbox.shared.record(what: "Added to your list", detail: what, outcome: "sent")
            var text = "Added **\(what)** to your list."
            if let due {
                text += " I'll remind you at \(due.formatted(date: .abbreviated, time: .shortened))."
            }
            text += "\n\nIt's in your Reminders, so it's on your Mac and Watch too."
            return Outcome(text: text, didSomething: true)

        case .sms, .unknown:
            return Outcome(text: cannotSend(intent.channel, to: intent.recipient, draft: draft),
                           didSomething: false)
        }
    }

    /// The last line of defence against the app claiming to have done something.
    ///
    /// Twice now a request slipped past detection and the model answered "Creating Google Meet now.
    /// Inviting Joslyn." — a sentence, and nothing else. Every individual cause has been fixed and
    /// each time another phrasing found its way through, so the guard belongs at the end rather than
    /// in the matching: if nothing ran, no answer may read as though something did.
    ///
    /// It corrects rather than hides. Deleting the model's text would lose the draft it wrote.
    static func correctIfItClaimed(_ answer: String) -> String {
        let a = answer.lowercased()
        // COMPLETION claims only — things stated as already having happened.
        //
        // This used to fire on "creating ", "sending ", "inviting " too, which was a bug of our own
        // making: the capability prompt explicitly instructs the model to say what it is *about to*
        // do, so a perfectly good answer earned a "Nothing was actually done" banner on top of
        // itself. Every reply looked broken, and the one warning that should mean something became
        // noise people learn to scroll past — which is exactly how a real false claim gets missed.
        let claims = ["i've sent", "i have sent", "sent it", "i sent ", "email sent",
                      "i've created", "i have created", "i created ", "created it",
                      "i've added", "i have added", "i've invited", "i have invited",
                      "i've scheduled", "i have scheduled", "i've booked",
                      "done —", "done!", "all set", "that's done", "it's done"]
        guard claims.contains(where: a.contains) else { return answer }

        return """
            **Nothing was actually sent or created.** The reply below says otherwise, but this was
            an answer, not an action. Ask plainly — "block my calendar 6pm to 6:30pm today", "email
            Joslyn about dinner" — and it happens for real.

            \(answer)
            """
    }

    // MARK: - Honest copy

    /// The wording that matters most in the whole app.
    ///
    /// It states what did *not* happen first, before the draft, so nobody skims it and believes a
    /// message went out.
    private static func cannotSend(_ channel: Channel, to who: String, draft: String) -> String {
        """
        **Not sent — I can't send on \(channel.name) from an iPhone.**

        Apple gives no app a way to put text into another app and send it. Copy this and paste it, \
        or use the SlyOS keyboard inside \(channel.name) to insert it in one tap. Connecting an \
        OpenClaw gateway is the only way to make this automatic.

        \(draft)
        """
    }

    private static func notConnected(_ what: String, draft: String) -> String {
        "**Not sent** — connect \(what) in Settings first.\n\n\(draft)"
    }

    /// A usable event title from the request — the words minus the scheduling scaffolding.
    /// A title for the event.
    ///
    /// Word-stripping produced "Block my calendar right now until ." — a title made of the leftovers
    /// after deleting the meaningful words, which is worse than none. Recognised shapes get a plain
    /// name; anything else keeps the owner's own words, which are at least intelligible.
    private static func title(from prompt: String) -> String {
        let p = prompt.lowercased()
        if p.contains("block") { return "Busy" }
        if p.contains("lunch") { return "Lunch" }
        if p.contains("dinner") || p.contains("date night") { return "Dinner" }
        if p.contains("call") || p.contains("meet") { return "Call" }

        // "with X about Y" — Y is the subject.
        if let m = prompt.firstMatch(#"(?i)\babout\s+(.{3,50})$"#) {
            return String(m[1].trimmingCharacters(in: CharacterSet(charactersIn: " .")).prefix(60))
        }
        return "Meeting"
    }

    private static func subject(of draft: String) -> String {
        if let m = draft.firstMatch(#"(?im)^subject:\s*(.+)$"#) { return m[1] }
        return String(draft.split(separator: "\n").first ?? "").prefix(80).description
    }

    /// An address from the brain — contacts were imported precisely so this works.
    private static func lookUpEmail(for name: String) async -> String? {
        guard !name.isEmpty else { return nil }
        for memory in SlyStore.shared.search(name, limit: 10) {
            if let m = memory.body.firstMatch(#"[\w.+-]+@[\w-]+\.[\w.]+"#) { return m[0] }
        }
        return nil
    }
}

// MARK: - Calendar flows

extension ActionRouter {

    /// Everything a calendar request can be, other than making a new event.
    ///
    /// Every branch names the event it touched and the date it touched, because "moved it" is
    /// unverifiable and the wrong meeting moved is a meeting somebody misses. Where the request
    /// matches more than one event, nothing happens and it asks — an assistant that guesses and
    /// then cancels has done something the owner cannot undo.
    static func runFlow(_ verb: CalendarFlows.Verb, intent: Intent, draft: String) async -> Outcome {
        let match = await CalendarFlows.find(intent.instruction)
        let event: GoogleCalendar.Event
        switch match {
        case .one(let e): event = e
        case .many(let list): return Outcome(text: CalendarFlows.ambiguous(list), didSomething: false)
        case .none:
            return Outcome(text: "**Nothing changed** — I couldn't find an event matching that in "
                           + "the next month.", didSomething: false)
        }

        let when = event.start?.formatted(date: .abbreviated, time: .shortened) ?? "no time set"

        do {
            switch verb {
            case .create:
                return Outcome(text: "", didSomething: false)   // handled by the caller

            case .move:
                guard let slot = Self.when(in: intent.instruction) else {
                    return Outcome(text: "**Not moved** — I need a new time. Try \"move it to "
                                   + "Thursday at 3\".", didSomething: false)
                }
                let length = (event.end ?? Date()).timeIntervalSince(event.start ?? Date())
                // The original length is preserved unless a new end was actually stated. A "move"
                // that quietly turns a two-hour workshop into 30 minutes is a wrong answer.
                let end = slot.end > slot.start.addingTimeInterval(60)
                    ? slot.end : slot.start.addingTimeInterval(max(length, 1_800))
                let updated = try await GoogleCalendar.patch(id: event.id, start: slot.start, end: end)
                Activity.record(.scheduled, "moved \(updated.title)",
                                detail: "was \(when), now \(slot.start.formatted(date: .abbreviated, time: .shortened))")
                return Outcome(text: "Moved **\(updated.title)** from \(when) to "
                               + "\(slot.start.formatted(date: .abbreviated, time: .shortened))."
                               + (event.attendees.isEmpty ? "" : " Everyone invited has been told."),
                               didSomething: true)

            case .cancel:
                try await GoogleCalendar.delete(id: event.id)
                Activity.record(.scheduled, "cancelled \(event.title)", detail: when)
                return Outcome(text: "Cancelled **\(event.title)** (\(when))."
                               + (event.attendees.isEmpty ? "" : " Attendees have been notified."),
                               didSomething: true)

            case .invite:
                let emails = Self.emails(in: intent.instruction)
                guard !emails.isEmpty else {
                    return Outcome(text: "**Nobody added** — I need an email address for them.",
                                   didSomething: false)
                }
                let updated = try await GoogleCalendar.patch(id: event.id, addAttendees: emails)
                Activity.record(.sent, "invited \(emails.joined(separator: ", "))",
                                detail: "to \(updated.title)")
                return Outcome(text: "Added \(emails.joined(separator: ", ")) to "
                               + "**\(updated.title)** (\(when)). The invitation has gone out.",
                               didSomething: true)

            case .uninvite:
                let emails = Self.emails(in: intent.instruction)
                let named = emails.isEmpty
                    ? event.attendees.map(\.email).filter {
                        intent.instruction.lowercased().contains($0.prefix(while: { $0 != "@" }).lowercased())
                      }
                    : emails
                guard !named.isEmpty else {
                    return Outcome(text: "**Nobody removed** — I couldn't tell who. Currently "
                                   + "invited: \(event.attendees.map(\.email).joined(separator: ", ")).",
                                   didSomething: false)
                }
                let updated = try await GoogleCalendar.removeAttendees(id: event.id, emails: named)
                Activity.record(.scheduled, "removed \(named.joined(separator: ", "))",
                                detail: "from \(updated.title)")
                return Outcome(text: "Took \(named.joined(separator: ", ")) off "
                               + "**\(updated.title)** (\(when)).", didSomething: true)

            case .addMeet:
                let updated = try await GoogleCalendar.patch(id: event.id, addMeet: true)
                guard !updated.meetLink.isEmpty else {
                    return Outcome(text: "**No Meet link** — Google didn't attach one. It sometimes "
                                   + "refuses on events it didn't create.", didSomething: false)
                }
                Activity.record(.scheduled, "added a Meet link", detail: updated.title)
                return Outcome(text: "Added a Meet link to **\(updated.title)** (\(when)).\n\n"
                               + updated.meetLink, didSomething: true)

            case .rename:
                let title = Self.title(from: intent.instruction)
                guard !title.isEmpty else {
                    return Outcome(text: "**Not renamed** — I couldn't tell what to call it.",
                                   didSomething: false)
                }
                let updated = try await GoogleCalendar.patch(id: event.id, title: title)
                return Outcome(text: "Renamed it to **\(updated.title)** (\(when)).",
                               didSomething: true)

            case .agenda:
                // The draft is the agenda — it was written from the brain before this ran.
                let updated = try await GoogleCalendar.patch(id: event.id, description: draft)
                Activity.record(.scheduled, "added an agenda", detail: updated.title)
                return Outcome(text: "Added the agenda to **\(updated.title)** (\(when)). Everyone "
                               + "invited can see it.\n\n\(draft)", didSomething: true)

            case .whoIsComing:
                guard !event.attendees.isEmpty else {
                    return Outcome(text: "**\(event.title)** (\(when)) has nobody invited — the "
                                   + "attendee list is empty, so no invitation was ever sent.",
                                   didSomething: false)
                }
                let lines = event.attendees.map { a -> String in
                    let state = switch a.responseStatus {
                    case "accepted": "accepted"
                    case "declined": "**declined**"
                    case "tentative": "maybe"
                    default: "no reply yet"
                    }
                    return "· \(a.email) — \(state)"
                }.joined(separator: "\n")
                return Outcome(text: "**\(event.title)** — \(when)\n\n\(lines)", didSomething: false)

            case .chase, .brief, .followUp:
                let targets = verb == .chase
                    ? event.awaitingReply.map(\.email)
                    : event.attendees.filter { !$0.organizer }.map(\.email)
                guard !targets.isEmpty else {
                    return Outcome(text: verb == .chase
                                   ? "Nobody to chase — everyone invited to **\(event.title)** has replied."
                                   : "**\(event.title)** has nobody invited to write to.",
                                   didSomething: false)
                }
                // Outbound mail is always read and approved first, however routine it looks.
                return Outcome(
                    text: "",
                    didSomething: false,
                    confirm: ConfirmSend.Payload(
                        recipient: targets.joined(separator: ", "),
                        subject: verb == .followUp ? "Following up — \(event.title)" : event.title,
                        body: draft,
                        action: verb == .chase
                            ? "Chase \(targets.count) who haven't replied"
                            : "Email \(targets.count) about \(event.title)"))
            }
        } catch {
            return Outcome(text: "**Nothing changed** — \(error.localizedDescription)",
                           didSomething: false)
        }
    }

    /// Email addresses written out in the request.
    static func emails(in text: String) -> [String] {
        let pattern = #"[\w.+-]+@[\w-]+\.[\w.]+"#
        guard let re = try? NSRegularExpression(pattern: pattern) else { return [] }
        return re.matches(in: text, range: NSRange(text.startIndex..., in: text)).compactMap {
            Range($0.range, in: text).map { String(text[$0]) }
        }
    }
}
