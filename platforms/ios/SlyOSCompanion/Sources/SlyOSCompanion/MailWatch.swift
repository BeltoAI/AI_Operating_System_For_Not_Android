import Foundation
import Observation
import SwiftUI

/// Mail that needs you, with a reply already written.
///
/// This is the one genuinely automatic inbox on iPhone. Apple forbids reading other apps'
/// notifications, but Gmail's API is ours to poll — so email needs no screenshot, no gateway and no
/// extra permission. It is also where most things that actually need answering arrive.
///
/// Two decisions that make it useful rather than noisy:
///
/// * **Only what plausibly needs a reply.** An inbox is mostly receipts, newsletters and
///   notifications. A queue that lists all of it is a worse inbox, not a better one.
/// * **Drafted before you look.** The point is to open SlyOS and find the replies already written,
///   not to open it and start work.
@Observable
final class MailWatch {

    static let shared = MailWatch()

    struct Item: Identifiable {
        let id: String
        let from: String
        let fromAddress: String
        let subject: String
        let snippet: String
        let received: Date
        /// Filled in by the drafting pass, which runs after the list is on screen.
        var draft: String?
        var drafting = false
        /// Why this one matters, when the brain knows something about it.
        var flag: String?
        /// Sent by a system rather than a person — shown on the card, and never drafted to.
        var automated = false
    }

    private(set) var items: [Item] = []
    private(set) var loading = false
    private(set) var lastError: String?
    private(set) var lastChecked: Date?

    /// Threads already dealt with. Kept so a reply you have handled does not reappear each refresh.
    private var handled: Set<String> {
        get { Set(SharedContainer.defaults.stringArray(forKey: "mailwatch.handled") ?? []) }
        set { SharedContainer.defaults.set(Array(newValue.prefix(500)), forKey: "mailwatch.handled") }
    }

    // MARK: - Fetch

    /// Recent mail worth answering.
    ///
    /// The Gmail query does the filtering server-side, which matters: pulling the whole inbox and
    /// discarding most of it would be slow and would burn quota on messages nobody will read.
    @MainActor
    func refresh(max: Int = 25) async {
        guard GoogleAuth.shared.isConnected else {
            lastError = "Connect Google to see mail here."
            return
        }
        loading = true
        lastError = nil
        defer { loading = false }

        do {
            let token = try await GoogleAuth.shared.accessToken()
            // In the inbox, unread, addressed to the owner, and not the categories that never need
            // a personal reply.
            let query = "is:unread in:inbox -category:promotions -category:social -category:forums"
            let ids = try await messageIDs(query: query, max: max, token: token)

            var found: [Item] = []
            for id in ids where !handled.contains(id) {
                if let item = try? await item(id: id, token: token) { found.append(item) }
            }
            items = found.sorted { $0.received > $1.received }
            lastChecked = Date()

            // Drafting happens after the list is visible, so the screen is useful immediately and
            // fills in rather than making you wait for all of it.
            Task { await draftAll() }
        } catch {
            lastError = error.localizedDescription
        }
    }

    private func messageIDs(query: String, max: Int, token: String) async throws -> [String] {
        var c = URLComponents(string: "https://gmail.googleapis.com/gmail/v1/users/me/messages")!
        c.queryItems = [.init(name: "q", value: query), .init(name: "maxResults", value: String(max))]
        let json = try await get(c.url!, token: token)
        return (json["messages"] as? [[String: Any]] ?? []).compactMap { $0["id"] as? String }
    }

    private func item(id: String, token: String) async throws -> Item? {
        let json = try await get(
            URL(string: "https://gmail.googleapis.com/gmail/v1/users/me/messages/\(id)?format=full")!,
            token: token)

        let payload = json["payload"] as? [String: Any] ?? [:]
        let headers = payload["headers"] as? [[String: Any]] ?? []
        func header(_ name: String) -> String {
            headers.first { ($0["name"] as? String)?.lowercased() == name.lowercased() }?["value"]
                as? String ?? ""
        }

        let from = header("From")
        let subject = header("Subject")
        guard !from.isEmpty else { return nil }

        // Anything with a List-Unsubscribe header is a mailing, not a person. That single check
        // removes most of what would otherwise clutter the queue.
        guard header("List-Unsubscribe").isEmpty, header("Precedence").lowercased() != "bulk" else {
            return nil
        }

        // Human or machine, decided before anything is written.
        //
        // The headers above catch mailing lists, and nothing else: a booking confirmation, a
        // verification code and a receipt all arrive as ordinary mail from an address that cannot
        // receive an answer. They belong in the queue — they are often the thing that matters — but
        // drafting a reply in the owner's voice to no-reply@ is a wasted call and slightly absurd.
        let automated = isAutomated(from: from, subject: subject)

        let millis = Double(json["internalDate"] as? String ?? "") ?? 0
        let snippet = (json["snippet"] as? String ?? "")
            .replacingOccurrences(of: "&#39;", with: "'")
            .replacingOccurrences(of: "&quot;", with: "\"")
            .replacingOccurrences(of: "&amp;", with: "&")

        return Item(id: id,
                    from: displayName(from),
                    fromAddress: address(from),
                    subject: subject,
                    snippet: snippet,
                    received: Date(timeIntervalSince1970: millis / 1000),
                    flag: flag(for: displayName(from)),
                    automated: automated)
    }

    /// What the brain knows that changes how urgent this is.
    ///
    /// "She has asked twice and you said Monday" is the difference between a list and an assistant.
    private func flag(for person: String) -> String? {
        guard !person.isEmpty else { return nil }
        let history = SlyStore.shared.search(person, limit: 12)
        guard history.count >= 3 else { return nil }
        guard let last = history.map(\.date).max() else { return nil }
        let days = Calendar.current.dateComponents([.day], from: last, to: .now).day ?? 0
        if days > 30 { return "You haven't spoken in \(days) days" }
        return "\(history.count) exchanges in your brain"
    }

    // MARK: - Drafting

    /// A sender that is a system rather than a person.
    ///
    /// Read from the address and the subject, because that is where a machine announces itself. The
    /// body would say so too, but the snippet Gmail returns is short enough that "unsubscribe" and
    /// "do not reply" routinely fall outside it.
    private func isAutomated(from: String, subject: String) -> Bool {
        let address = address(from).lowercased()
        let local = String(address.prefix { $0 != "@" })
        let robotic = ["no-reply", "noreply", "donotreply", "do-not-reply", "notification",
                       "notifications", "alerts", "alert", "mailer", "postmaster", "billing",
                       "receipts", "invoices", "support", "updates", "automated", "bounce"]
        if robotic.contains(where: { local.contains($0) }) { return true }

        let s = subject.lowercased()
        return ["verification code", "verify your", "one-time code", "security code",
                "password reset", "confirm your email", "your receipt", "your invoice",
                "your order", "statement is ready", "do not reply"]
            .contains { s.contains($0) }
    }

    @MainActor
    private func draftAll() async {
        for index in items.indices {
            guard items[index].draft == nil, !items[index].automated else { continue }
            items[index].drafting = true
            let item = items[index]

            let reply = await draft(for: item)
            guard let position = items.firstIndex(where: { $0.id == item.id }) else { continue }
            items[position].draft = reply
            items[position].drafting = false
        }
    }

    private func draft(for item: Item) async -> String {
        let context = await AgentClient.corpus(for: "\(item.from) \(item.subject)")
        var system = """
            You are writing a reply as the owner of this mailbox, in their voice. Output only the \
            body of the reply — no greeting line repeating the subject, no "here is a draft", no \
            signature block. Keep it as short as the message deserves. If it needs a decision only \
            the owner can make, write the reply that asks the one question you would need answered.
            """
        system += AgentClient.voiceBlock()
        // The email was written by someone else: data, never instruction.
        system += Untrusted.clause

        var user = "FROM: \(item.from)\nSUBJECT: \(item.subject)\n\n\(item.snippet)"
        if !context.isEmpty { user = "WHAT YOU KNOW:\n\(context)\n\n" + user }

        do {
            // Cheap tier: these are drafted in bulk, and a queue of twenty on the heavy model is
            // both slow and expensive for something the owner will edit anyway.
            return try await AgentClient.complete(system: system, user: user, tier: .cheap)
        } catch {
            return ""
        }
    }

    // MARK: - Acting

    /// Stop showing this one. The mail itself is untouched — SlyOS has no business marking someone
    /// else's inbox read because a card was swiped away.
    @MainActor
    func dismiss(_ item: Item) {
        handled.insert(item.id)
        withAnimation { items.removeAll { $0.id == item.id } }
    }

    /// What a reply to this needs, for the confirmation sheet.
    func payload(for item: Item) -> ConfirmSend.Payload {
        ConfirmSend.Payload(
            recipient: item.fromAddress,
            subject: item.subject.lowercased().hasPrefix("re:") ? item.subject : "Re: \(item.subject)",
            body: item.draft ?? "",
            action: "Reply to \(item.from)")
    }

    // MARK: - Plumbing

    private func get(_ url: URL, token: String) async throws -> [String: Any] {
        var req = URLRequest(url: url)
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        req.timeoutInterval = 30
        let (data, response) = try await URLSession.shared.data(for: req)
        let code = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(code) else {
            throw GoogleCalendar.CalendarError.api(code, String(data: data, encoding: .utf8) ?? "")
        }
        return (try? JSONSerialization.jsonObject(with: data) as? [String: Any]) ?? [:]
    }

    /// `"Carlos Ruiz <carlos@x.com>"` → `"Carlos Ruiz"`.
    private func displayName(_ header: String) -> String {
        if let open = header.firstIndex(of: "<") {
            let name = header[header.startIndex..<open]
                .trimmingCharacters(in: CharacterSet(charactersIn: " \"'"))
            if !name.isEmpty { return name }
        }
        return String(address(header).prefix { $0 != "@" })
    }

    private func address(_ header: String) -> String {
        header.firstMatch(#"[\w.+-]+@[\w-]+\.[\w.]+"#)?[0] ?? header
    }
}
