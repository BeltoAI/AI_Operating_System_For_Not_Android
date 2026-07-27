import Foundation
import UIKit

/// Everything SlyOS does, written down — with when, and on which phone.
///
/// The brain knew what the owner had *told* it and nothing about what it had *done* for them. So
/// "did I already send that?", "when did I scan the receipt?", "what did I do on my iPhone
/// yesterday?" were unanswerable from inside an app that had performed every one of those actions.
///
/// Two properties make this worth having rather than noise:
///
/// * **One choke point.** Every action goes through `record`. Anything that writes its own log
///   instead is the one thing missing when someone asks, and there is no way to tell from the
///   outside that it is missing.
/// * **Stamped with the device.** These rows sync, so a phone's history arrives on the other phone.
///   Without a device on the row, "what did I do on my iPhone" is unanswerable the moment the
///   Samsung's actions land in the same table — and telling the owner their iPhone did something
///   their Samsung did is worse than not answering.
///
/// Stored as ordinary memories with `kind = "action"` so they sync, search and embed like
/// everything else — but the kind keeps them separable, because a thousand "opened the camera"
/// rows must never crowd out a real conversation at recall time.
enum Activity {

    /// What kind of thing happened. Kept coarse on purpose: fine-grained categories go stale as the
    /// app changes, and nobody asks a question that needs them.
    enum Kind: String {
        case created    // a document, deck, sheet, PDF, website
        case sent       // an email, an invitation — something that left the phone
        case scanned    // a receipt, a document, a photo read
        case imported   // an export, a file, a library
        case remembered // a note, a fact, a meeting
        case scheduled  // an event, a reminder, a timer
        case asked      // a question put to the brain

        /// A verb, for reading back. "You created", "You sent".
        var verb: String {
            switch self {
            case .created:    "created"
            case .sent:       "sent"
            case .scanned:    "scanned"
            case .imported:   "imported"
            case .remembered: "saved"
            case .scheduled:  "scheduled"
            case .asked:      "asked"
            }
        }
    }

    // MARK: - Which phone

    private static let deviceKey = "device.label"

    /// What this phone is called, in the owner's words.
    ///
    /// `UIDevice.name` returns a generic model string on iOS 16 and later unless the app holds an
    /// entitlement Apple grants for MDM, so "Emil's iPhone" is not available to read. The model is
    /// enough to tell two phones apart when one is an iPhone and the other a Samsung, and the owner
    /// can rename it when it isn't.
    static var device: String {
        get {
            SharedContainer.defaults.string(forKey: deviceKey)
                ?? UIDevice.current.model   // "iPhone", "iPad"
        }
        set {
            let trimmed = newValue.trimmingCharacters(in: .whitespacesAndNewlines)
            trimmed.isEmpty
                ? SharedContainer.defaults.removeObject(forKey: deviceKey)
                : SharedContainer.defaults.set(trimmed, forKey: deviceKey)
        }
    }

    // MARK: - Recording

    /// Write down something that happened.
    ///
    /// `detail` carries the specifics worth recalling — who it went to, what it was called, how
    /// much. Keep it short: this is a log line, and a paragraph here competes with real memories
    /// for the recall budget.
    @discardableResult
    static func record(_ kind: Kind, _ what: String, detail: String = "",
                       person: String = "") -> Int64? {
        let subject = what.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !subject.isEmpty else { return nil }

        var body = "You \(kind.verb) \(subject) on your \(device)"
        if !detail.isEmpty { body += " — \(detail)" }

        return SlyStore.shared.insert(
            kind: "action",
            person: person,
            title: subject,
            body: body,
            // The device is the source, so it survives the sync and reads naturally in recall.
            source: device,
            date: .now)
    }

    // MARK: - Reading back

    /// What was done, newest first, optionally on one device or in one window.
    static func recent(limit: Int = 40, on device: String? = nil,
                       from: Date? = nil, to: Date? = nil) -> [Memory] {
        let all = from != nil || to != nil
            ? SlyStore.shared.between(from ?? .distantPast, to ?? .distantFuture, limit: 400)
            : SlyStore.shared.recent(limit: 400)

        return all
            .filter { $0.kind == "action" }
            .filter { device == nil || $0.source.localizedCaseInsensitiveContains(device!) }
            .prefix(limit)
            .map { $0 }
    }

    /// The devices that have written to this brain — so a question can name one.
    static func devices() -> [String] {
        Array(Set(SlyStore.shared.recent(limit: 800)
            .filter { $0.kind == "action" }
            .map(\.source)
            .filter { !$0.isEmpty }))
            .sorted()
    }

    /// A block for the prompt, when the question is about what was done.
    ///
    /// Gated rather than always-on: an activity log in every prompt would spend the recall budget
    /// on "you opened the camera" instead of on the conversation the question was actually about.
    static func block(for question: String) -> String {
        let q = question.lowercased()
        let asks = ["what did i do", "what have i done", "did i already", "did i send",
                    "did i scan", "did i create", "when did i", "my activity", "on my iphone",
                    "on my phone", "on my samsung", "on my android", "what happened",
                    "history", "recently"]
        guard asks.contains(where: q.contains) else { return "" }

        // A named device narrows it. "What did I do on my Samsung" asked of a merged brain must not
        // answer with the iPhone's afternoon.
        let named = devices().first { q.contains($0.lowercased()) }
        let window = BrainContext.dateWindow(question)
        let rows = recent(limit: 30, on: named,
                          from: window?.lowerBound, to: window?.upperBound)
        guard !rows.isEmpty else {
            return named.map {
                "\n\nNOTHING IS RECORDED as having been done on \($0) in that period — say so "
                + "plainly rather than guessing."
            } ?? ""
        }

        let lines = rows.map {
            "· \($0.date.formatted(date: .abbreviated, time: .shortened)) — \($0.body)"
        }.joined(separator: "\n")

        return "\n\nWHAT SLYOS ACTUALLY DID, AND ON WHICH PHONE (this is the action record — it is "
            + "the only proof that something happened, and it OVERRIDES anything you or the brain "
            + "merely said. If something is not here, it did not happen):\n\(lines)"
    }
}
