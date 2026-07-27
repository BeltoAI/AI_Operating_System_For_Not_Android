import AppIntents
import SwiftUI
import Vision
import Observation

/// One press of the Action Button and every waiting message has a reply written.
///
/// This is as close to Android's ambient drafting as iOS permits, and the distance is one button.
/// Apple forbids reading other apps' notifications — but a Shortcut can take a screenshot and hand
/// it to us, and Notification Centre shows every waiting message at once. So: press the Action
/// Button, and the drafts are on your clipboard queue before you have opened anything.
///
/// The friction that matters is not the OCR, it is the setup. Anything requiring a person to build
/// a Shortcut by hand will not be used, so the app ships the intent and tells them the three taps.
enum ScreenDrafts {

    /// One notification lifted off the screen.
    struct Notice: Identifiable {
        let id = UUID()
        let app: String
        let person: String
        let message: String
        var draft: String?
    }

    /// Turn a screenshot of Notification Centre into individual messages.
    ///
    /// Vision gives back text with positions, not structure, so the grouping is inferred: a line
    /// carrying a known app name starts a new notification, the next line is usually who it is
    /// from, and everything until the following app line is the message.
    static func parse(_ image: UIImage) async -> [Notice] {
        let lines = await recognise(image)
        guard !lines.isEmpty else { return [] }

        let apps = ["WhatsApp", "Messages", "Mail", "Gmail", "Instagram", "LinkedIn", "Telegram",
                    "Slack", "Signal", "Messenger", "Discord", "X", "Twitter", "Teams", "Outlook"]

        var notices: [Notice] = []
        var app = ""
        var person = ""
        var body: [String] = []

        func flush() {
            let text = body.joined(separator: " ").trimmingCharacters(in: .whitespaces)
            // A notification with no message is a badge, not something to reply to.
            guard !app.isEmpty, text.count > 2 else { return }
            notices.append(Notice(app: app, person: person.isEmpty ? app : person, message: text))
        }

        for line in lines {
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            guard !trimmed.isEmpty else { continue }

            if let match = apps.first(where: { trimmed.localizedCaseInsensitiveContains($0) }),
               trimmed.count < 40 {
                flush()
                app = match; person = ""; body = []
                continue
            }
            guard !app.isEmpty else { continue }

            // Time stamps are chrome, and a short line right after the app is the sender.
            if trimmed.firstMatch(#"^(now|\d+[mhd]|\d{1,2}:\d{2})"#) != nil { continue }
            if person.isEmpty && trimmed.count < 40 { person = trimmed; continue }
            body.append(trimmed)
        }
        flush()
        return notices
    }

    /// Write a reply to each, grounded in the brain.
    static func draft(_ notices: [Notice]) async -> [Notice] {
        var out: [Notice] = []
        for var notice in notices {
            let context = await AgentClient.corpus(for: "\(notice.person) \(notice.message)")
            var system = """
                You are drafting a reply as the owner, in their voice, to a message that arrived on \
                \(notice.app). Output only the reply — no preamble, no quotes, no explanation. Keep \
                it as short as the message deserves.
                """
            system += AgentClient.voiceBlock()
            // Whatever was on that screen was written by someone else.
            system += Untrusted.clause

            var user = "FROM: \(notice.person)\nMESSAGE: \(notice.message)"
            if !context.isEmpty { user = "WHAT YOU KNOW:\n\(context)\n\n" + user }

            notice.draft = try? await AgentClient.complete(system: system, user: user, tier: .cheap)
            if let draft = notice.draft, !draft.isEmpty {
                DraftLog.shared.record(source: notice.message, draft: draft, tone: notice.app)
            }
            out.append(notice)
        }
        return out
    }

    /// Where the drafts wait until they are used.
    ///
    /// The app group, so the keyboard can offer the same drafts inside the app you are replying in.
    static func store(_ notices: [Notice]) {
        let rows = notices.compactMap { n -> [String: String]? in
            guard let d = n.draft, !d.isEmpty else { return nil }
            return ["app": n.app, "person": n.person, "message": n.message, "draft": d]
        }
        SharedContainer.defaults.set(rows, forKey: "screendrafts.queue")
        SharedContainer.defaults.set(Date().timeIntervalSince1970, forKey: "screendrafts.at")
    }

    static func queued() -> [(app: String, person: String, message: String, draft: String)] {
        let rows = SharedContainer.defaults.array(forKey: "screendrafts.queue") as? [[String: String]] ?? []
        return rows.compactMap { r in
            guard let a = r["app"], let p = r["person"], let m = r["message"], let d = r["draft"]
            else { return nil }
            return (a, p, m, d)
        }
    }

    private static func recognise(_ image: UIImage) async -> [String] {
        guard let cg = image.cgImage else { return [] }
        return await withCheckedContinuation { continuation in
            let request = VNRecognizeTextRequest { request, _ in
                let observations = request.results as? [VNRecognizedTextObservation] ?? []
                // Top to bottom: Vision returns them in confidence order, and reading order is what
                // makes the grouping work.
                let sorted = observations.sorted { $0.boundingBox.maxY > $1.boundingBox.maxY }
                continuation.resume(returning: sorted.compactMap { $0.topCandidates(1).first?.string })
            }
            request.recognitionLevel = .accurate
            request.usesLanguageCorrection = true
            DispatchQueue.global(qos: .userInitiated).async {
                try? VNImageRequestHandler(cgImage: cg, options: [:]).perform([request])
            }
        }
    }
}

/// The intent a Shortcut calls — this is what the Action Button ends up running.
struct DraftFromScreenIntent: AppIntent {
    static let title: LocalizedStringResource = "Draft replies from screenshot"
    static let description = IntentDescription(
        "Read every notification in a screenshot and write a reply to each, in your voice.")
    /// Opens afterwards so the drafts are there to act on — the one case where opening is the point.
    static let openAppWhenRun = true

    @Parameter(title: "Screenshot")
    var image: IntentFile

    func perform() async throws -> some IntentResult & ProvidesDialog {
        // `data(contentType:)` is iOS 18; `.data` works from 16 and is all this needs.
        guard let picture = UIImage(data: image.data) else {
            return .result(dialog: "I couldn't read that screenshot.")
        }
        let notices = await ScreenDrafts.parse(picture)
        guard !notices.isEmpty else {
            return .result(dialog: "No messages I could read on that screen.")
        }
        let drafted = await ScreenDrafts.draft(notices)
        ScreenDrafts.store(drafted)

        let count = drafted.filter { !($0.draft ?? "").isEmpty }.count
        return .result(dialog: IntentDialog(stringLiteral:
            "\(count) \(count == 1 ? "reply" : "replies") ready."))
    }
}
