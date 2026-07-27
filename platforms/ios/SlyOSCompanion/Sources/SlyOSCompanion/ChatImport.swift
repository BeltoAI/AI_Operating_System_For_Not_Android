import Foundation
import UniformTypeIdentifiers

/// Reading the exports people can actually get: WhatsApp, Instagram, LinkedIn, Telegram.
///
/// This matters more on iPhone than anything else in the app. iOS will never let SlyOS watch
/// messages arrive, so the only route to a brain that knows your conversations is the archive each
/// service is legally obliged to hand you. Every one of them offers a download; none of them offers
/// an API a phone can use.
///
/// The parsers are deliberately forgiving. These files are not a documented format — they are
/// whatever the vendor emitted this quarter, and they change without notice. A parser that demands
/// an exact shape reports "0 imported" on a perfectly good archive and looks like a broken feature.
enum ChatImport {

    enum Source: String, CaseIterable, Identifiable {
        case whatsapp = "WhatsApp"
        case instagram = "Instagram"
        case linkedin = "LinkedIn"
        case telegram = "Telegram"

        var id: String { rawValue }

        /// What to tell someone so they can actually get the file.
        var howTo: String {
            switch self {
            case .whatsapp:
                "Open a chat → ⋮ → More → Export chat → Without media. Do it per conversation; "
                + "WhatsApp has no bulk export."
            case .instagram:
                "instagram.com → Settings → Your activity → Download your information → JSON. "
                + "Arrives by email as a ZIP. Pick the ZIP itself — SlyOS reads every conversation in it."
            case .linkedin:
                "linkedin.com → Settings → Data privacy → Get a copy of your data → pick Messages. "
                + "Pick the ZIP itself when it arrives."
            case .telegram:
                "Telegram Desktop → Settings → Advanced → Export Telegram data → Machine-readable "
                + "JSON."
            }
        }


        /// Which files inside an export actually hold messages.
        ///
        /// An Instagram archive is overwhelmingly photos and video, and inflating those to discard
        /// them would spend the memory the messages need.
        func wants(_ path: String) -> Bool {
            let lower = path.lowercased()
            switch self {
            case .whatsapp:  return lower.hasSuffix(".txt")
            case .instagram: return lower.hasSuffix(".json") && lower.contains("message")
            case .linkedin:  return lower.hasSuffix(".csv") && lower.contains("message")
            case .telegram:  return lower.hasSuffix(".json")
            }
        }

        var fileTypes: [UTType] {
            switch self {
            case .whatsapp: [.plainText, .zip]
            case .instagram, .telegram: [.json, .zip]
            case .linkedin: [.commaSeparatedText, .zip]
            }
        }
    }

    struct Result {
        let imported: Int
        let people: Int
        let note: String
    }

    /// Read whatever was picked and put it in the brain.
    ///
    /// The whole archive, if that is what was picked. Every one of these services hands you a zip —
    /// Instagram's holds a `message_1.json` per conversation across hundreds of folders — and the
    /// picker already offered `.zip`, but the parser then read the archive's raw bytes as text and
    /// reported "nothing readable". Downloading exactly what the instructions said produced nothing,
    /// which is the worst possible first five minutes.
    static func read(_ url: URL, as source: Source, ownerName: String) throws -> Result {
        // Files chosen from another app arrive security-scoped; without this the read fails with a
        // permission error that looks like a corrupt file.
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }

        let data = try Data(contentsOf: url)
        var memories: [Memory] = []

        // "PK\u{03}\u{04}" — sniffed rather than taken from the extension, because a file saved from
        // Mail or Drive frequently arrives named something else entirely.
        if data.starts(with: [0x50, 0x4B, 0x03, 0x04]) {
            let files = try Unzip.entries(in: data) { path in source.wants(path) }
            guard !files.isEmpty else {
                return Result(imported: 0, people: 0,
                              note: "That archive has no \(source.rawValue) messages in it. "
                                  + source.howTo)
            }
            for file in files {
                memories += parse(file.data, as: source, owner: ownerName)
            }
        } else {
            memories = parse(data, as: source, owner: ownerName)
        }

        guard !memories.isEmpty else {
            return Result(imported: 0, people: 0,
                          note: "Nothing readable in that file. \(source.howTo)")
        }

        SlyStore.shared.insertMany(memories)
        let people = Set(memories.map(\.person)).count
        return Result(imported: memories.count, people: people,
                      note: "\(memories.count.formatted()) messages from \(people) "
                          + (people == 1 ? "person" : "people") + ".")
    }

    /// One file's worth, whatever it came wrapped in.
    private static func parse(_ data: Data, as source: Source, owner: String) -> [Memory] {
        switch source {
        case .whatsapp:  parseWhatsApp(String(decoding: data, as: UTF8.self), owner: owner)
        case .instagram: parseInstagram(data, owner: owner)
        case .linkedin:  parseLinkedIn(String(decoding: data, as: UTF8.self), owner: owner)
        case .telegram:  parseTelegram(data, owner: owner)
        }
    }

    // MARK: - WhatsApp

    /// `[12/03/2025, 14:22:01] Carlos: message`, or `12/03/2025, 14:22 - Carlos: message`.
    ///
    /// Both bracket and dash forms exist depending on platform and locale, and a message can run
    /// over several lines — so a line that does not start with a timestamp is a continuation of the
    /// one before, not a message with no sender.
    private static func parseWhatsApp(_ text: String, owner: String) -> [Memory] {
        var out: [Memory] = []
        var current: (who: String, body: String, at: Date)?

        let pattern = #"^\[?(\d{1,2}[./]\d{1,2}[./]\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?)\s*(?:[APap][Mm])?\]?\s*[-–]?\s*([^:]{1,60}):\s*(.*)$"#

        for line in text.split(separator: "\n", omittingEmptySubsequences: false) {
            let row = String(line)
            if let m = row.firstMatch(pattern) {
                if let c = current { out.append(memory(c, owner: owner, source: "WhatsApp")) }
                current = (who: m[3].trimmingCharacters(in: .whitespaces),
                           body: m[4],
                           at: date(m[1], m[2]) ?? Date())
            } else if var c = current, !row.trimmingCharacters(in: .whitespaces).isEmpty {
                c.body += "\n" + row
                current = c
            }
        }
        if let c = current { out.append(memory(c, owner: owner, source: "WhatsApp")) }
        // System lines are noise and there are a lot of them.
        return out.filter {
            !$0.body.contains("end-to-end encrypted")
                && !$0.body.contains("Messages and calls are")
                && $0.body != "<Media omitted>"
        }
    }

    // MARK: - Instagram

    /// Instagram's JSON, which mangles non-ASCII on the way out (see `mojibake`).
    private static func parseInstagram(_ data: Data, owner: String) -> [Memory] {
        guard let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return [] }
        let participants = (root["participants"] as? [[String: Any]] ?? [])
            .compactMap { $0["name"] as? String }
        let thread = participants.first { $0 != owner } ?? participants.first ?? "Instagram"

        return (root["messages"] as? [[String: Any]] ?? []).compactMap { row in
            guard let text = row["content"] as? String, !text.isEmpty else { return nil }
            let who = row["sender_name"] as? String ?? thread
            let millis = (row["timestamp_ms"] as? Double) ?? 0
            return Memory(kind: "message",
                          person: who == owner ? thread : who,
                          title: "",
                          body: mojibake(text),
                          source: who == owner ? "Instagram (sent)" : "Instagram",
                          date: Date(timeIntervalSince1970: millis / 1000))
        }
    }

    /// Instagram exports UTF-8 that has been through Latin-1 — "café" arrives as "cafÃ©", and every
    /// emoji as a run of nonsense. Round-tripping it back is the only way to recover the text.
    private static func mojibake(_ s: String) -> String {
        guard s.contains("Ã") || s.contains("â") else { return s }
        guard let raw = s.data(using: .isoLatin1),
              let fixed = String(data: raw, encoding: .utf8) else { return s }
        return fixed
    }

    // MARK: - LinkedIn

    /// `CONVERSATION ID,CONVERSATION TITLE,FROM,SENDER PROFILE URL,TO,DATE,SUBJECT,CONTENT,...`
    private static func parseLinkedIn(_ csv: String, owner: String) -> [Memory] {
        let rows = parseCSV(csv)
        guard let header = rows.first else { return [] }
        let lower = header.map { $0.lowercased() }
        func column(_ name: String) -> Int? { lower.firstIndex { $0.contains(name) } }

        guard let fromIndex = column("from"), let contentIndex = column("content") else { return [] }
        let dateIndex = column("date")
        let toIndex = column("to")

        return rows.dropFirst().compactMap { row in
            guard row.count > max(fromIndex, contentIndex) else { return nil }
            let body = row[contentIndex].trimmingCharacters(in: .whitespacesAndNewlines)
            guard !body.isEmpty else { return nil }

            let from = row[fromIndex]
            let sentByOwner = from.localizedCaseInsensitiveContains(owner)
            let other = sentByOwner ? (toIndex.flatMap { row.count > $0 ? row[$0] : nil } ?? "") : from

            var when = Date()
            if let dateIndex, row.count > dateIndex { when = isoish(row[dateIndex]) ?? when }

            return Memory(kind: "message", person: other, title: "", body: body,
                          source: sentByOwner ? "LinkedIn (sent)" : "LinkedIn", date: when)
        }
    }

    // MARK: - Telegram

    private static func parseTelegram(_ data: Data, owner: String) -> [Memory] {
        guard let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return [] }
        // A full export nests every chat; a single-chat export is the chat itself.
        let chats = ((root["chats"] as? [String: Any])?["list"] as? [[String: Any]]) ?? [root]

        return chats.flatMap { chat -> [Memory] in
            let name = chat["name"] as? String ?? "Telegram"
            return (chat["messages"] as? [[String: Any]] ?? []).compactMap { row in
                // `text` is a string, or an array of runs when the message has links or formatting.
                let text: String
                if let plain = row["text"] as? String { text = plain }
                else if let runs = row["text"] as? [Any] {
                    text = runs.compactMap { part in
                        (part as? String) ?? ((part as? [String: Any])?["text"] as? String)
                    }.joined()
                } else { return nil }

                guard !text.isEmpty else { return nil }
                let who = row["from"] as? String ?? name
                let seconds = Double(row["date_unixtime"] as? String ?? "") ?? 0
                return Memory(kind: "message",
                              person: who == owner ? name : who,
                              title: "", body: text,
                              source: who == owner ? "Telegram (sent)" : "Telegram",
                              date: seconds > 0 ? Date(timeIntervalSince1970: seconds) : Date())
            }
        }
    }

    // MARK: - Shared

    private static func memory(_ c: (who: String, body: String, at: Date),
                               owner: String, source: String) -> Memory {
        let mine = !owner.isEmpty && c.who.localizedCaseInsensitiveContains(owner)
        return Memory(kind: "message",
                      person: c.who,
                      title: "",
                      body: c.body.trimmingCharacters(in: .whitespacesAndNewlines),
                      source: mine ? "\(source) (sent)" : source,
                      date: c.at)
    }

    /// Day/month order is ambiguous and the file never says which. A value over 12 in the first
    /// position settles it; otherwise assume the non-US order, which is what most exports use.
    private static func date(_ day: String, _ time: String) -> Date? {
        let parts = day.split(whereSeparator: { $0 == "/" || $0 == "." }).map(String.init)
        guard parts.count == 3 else { return nil }
        let a = Int(parts[0]) ?? 1, b = Int(parts[1]) ?? 1
        var year = Int(parts[2]) ?? 2000
        if year < 100 { year += 2000 }

        let clock = time.split(separator: ":").map { Int($0) ?? 0 }
        var c = DateComponents()
        c.year = year
        c.day = a > 12 ? a : b
        c.month = a > 12 ? b : a
        c.hour = clock.first ?? 0
        c.minute = clock.count > 1 ? clock[1] : 0
        return Calendar.current.date(from: c)
    }

    private static func isoish(_ s: String) -> Date? {
        for format in ["yyyy-MM-dd HH:mm:ss", "yyyy-MM-dd'T'HH:mm:ss'Z'", "yyyy-MM-dd", "MM/dd/yy HH:mm"] {
            let f = DateFormatter()
            f.dateFormat = format
            f.locale = Locale(identifier: "en_US_POSIX")
            if let d = f.date(from: s.trimmingCharacters(in: .whitespaces)) { return d }
        }
        return nil
    }

    /// CSV with quoted fields and embedded newlines — LinkedIn messages contain both, and splitting
    /// on commas shifts every column after the first quoted comma.
    private static func parseCSV(_ text: String) -> [[String]] {
        var rows: [[String]] = []
        var row: [String] = []
        var field = ""
        var inQuotes = false
        var chars = Array(text)
        var i = 0

        while i < chars.count {
            let c = chars[i]
            if inQuotes {
                if c == "\"" {
                    if i + 1 < chars.count, chars[i + 1] == "\"" { field.append("\""); i += 1 }
                    else { inQuotes = false }
                } else { field.append(c) }
            } else {
                switch c {
                case "\"": inQuotes = true
                case ",": row.append(field); field = ""
                case "\n", "\r\n":
                    row.append(field); field = ""
                    if !(row.count == 1 && row[0].isEmpty) { rows.append(row) }
                    row = []
                default: field.append(c)
                }
            }
            i += 1
        }
        if !field.isEmpty || !row.isEmpty { row.append(field); rows.append(row) }
        return rows
    }
}
