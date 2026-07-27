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

    /// Best guess at who is being addressed — the word after "to", or a capitalised name.
    /// A calendar request needs a time. Vague ones are asked about rather than guessed at — an
    /// event at the wrong hour, emailed to someone, is worse than a question.
    static func when(in prompt: String) -> (start: Date, end: Date)? {
        let p = prompt.lowercased()
        var day = Date()
        if p.contains("tomorrow") { day = Calendar.current.date(byAdding: .day, value: 1, to: day) ?? day }

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
        if let m = prompt.firstMatch(#"(?i)\b(?:to|message|text|tell)\s+([A-Z][\w'-]+)"#) { return m[1] }
        if let m = prompt.firstMatch(#"\b([A-Z][a-z]{2,})\b"#) { return m[1] }
        return ""
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
            guard let slot = when(in: intent.instruction) else {
                return Outcome(text: "**Nothing created** — I need a time. Say when, and I'll make "
                               + "the event and send the invite.", didSomething: false)
            }
            // "Block my calendar" is for the owner alone — inviting someone to it would be absurd.
            let blocker = intent.instruction.lowercased().contains("block")
            let guests = (blocker || intent.recipient.isEmpty)
                ? []
                : [await lookUpEmail(for: intent.recipient)].compactMap { $0 }
            do {
                let event = try await GoogleCalendar.create(
                    title: title(from: intent.instruction),
                    start: slot.start, end: slot.end,
                    attendees: guests, withMeet: true)

                let who = guests.isEmpty ? "nobody else" : guests.joined(separator: ", ")
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
        let claims = ["i'll send", "i will send", "sending ", "i've sent", "i have sent", "sent it",
                      "creating ", "i'll create", "i've created", "i'll add", "adding it",
                      "inviting ", "i'll invite", "i've invited", "scheduling ", "i'll schedule",
                      "booking ", "done —", "done."]
        guard claims.contains(where: a.contains) else { return answer }

        return """
            **Nothing was actually done.** What follows is only a draft — nothing was sent, created
            or scheduled. If you meant it as an instruction, say it again more plainly — for example
            "block my calendar 6pm to 6:30pm today" — and I'll do it for real.

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
    private static func title(from prompt: String) -> String {
        var t = prompt
        for noise in ["create", "make", "set up", "schedule", "a ", "google meet", "meet", "invite",
                      "with", "for", "please", "tomorrow", "today"] {
            t = t.replacingOccurrences(of: noise, with: " ", options: [.caseInsensitive])
        }
        t = t.replacingOccurrences(of: #"\d{1,2}(:\d{2})?\s*(am|pm)?"#, with: " ",
                                   options: [.regularExpression, .caseInsensitive])
        let cleaned = t.replacingOccurrences(of: #"\s{2,}"#, with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return cleaned.isEmpty ? "Meeting" : String(cleaned.prefix(60))
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
