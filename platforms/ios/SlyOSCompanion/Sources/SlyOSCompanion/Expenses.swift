import Foundation
import Observation
import SQLite3

/// Receipts as money, not as text.
///
/// Scanning already worked and led nowhere: a receipt became a `doc` memory holding raw OCR output,
/// with the first line as its title. Searchable, and useless for the only questions anyone asks a
/// receipt pile — how much did I spend this month, on what, and where does it keep going. A number
/// that is only ever a substring of a paragraph cannot be added up.
///
/// So the text is read into fields once, at scan time, and kept beside the memory it came from.
///
/// **Parsed on-device first.** A total and a date have shapes, and matching them costs nothing and
/// works offline with no key. The model is asked only when that fails, and only for the merchant —
/// which genuinely needs judgement, because the largest text on a receipt is as often the slogan as
/// the shop.
@Observable
final class Expenses {

    static let shared = Expenses()

    struct Entry: Identifiable, Equatable {
        var id: Int64
        var merchant: String
        var amount: Double
        var currency: String
        var category: String
        var date: Date
        /// The memory this came from, so the original scan is one hop away.
        var memoryID: Int64

        var formatted: String {
            let f = NumberFormatter()
            f.numberStyle = .currency
            f.currencyCode = currency
            return f.string(from: NSNumber(value: amount)) ?? String(format: "%.2f", amount)
        }
    }

    private var db: OpaquePointer? { SlyStore.shared.db }
    private let queue = DispatchQueue(label: "com.belto.slyos.expenses")
    private static let transient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)

    private(set) var entries: [Entry] = []

    private init() { prepare() }

    private func prepare() {
        queue.sync {
            sqlite3_exec(db, """
                CREATE TABLE IF NOT EXISTS expenses (
                  id        INTEGER PRIMARY KEY AUTOINCREMENT,
                  merchant  TEXT NOT NULL DEFAULT '',
                  amount    REAL NOT NULL,
                  currency  TEXT NOT NULL DEFAULT 'USD',
                  category  TEXT NOT NULL DEFAULT '',
                  ts        INTEGER NOT NULL,
                  memory_id INTEGER NOT NULL DEFAULT 0
                );
                """, nil, nil, nil)
            sqlite3_exec(db, "CREATE INDEX IF NOT EXISTS idx_expenses_ts ON expenses(ts DESC);",
                         nil, nil, nil)
            // A deleted receipt takes its line off the ledger. Otherwise "forget that" leaves the
            // total unchanged and the owner cannot work out why.
            sqlite3_exec(db, """
                CREATE TRIGGER IF NOT EXISTS expenses_gc AFTER DELETE ON memories BEGIN
                  DELETE FROM expenses WHERE memory_id = old.id;
                END;
                """, nil, nil, nil)
        }
    }

    // MARK: - Reading

    @discardableResult
    func load(limit: Int = 300) -> [Entry] {
        let rows: [Entry] = queue.sync {
            var st: OpaquePointer?
            let sql = """
                SELECT id, merchant, amount, currency, category, ts, memory_id
                FROM expenses ORDER BY ts DESC LIMIT ?;
                """
            guard sqlite3_prepare_v2(db, sql, -1, &st, nil) == SQLITE_OK else { return [] }
            defer { sqlite3_finalize(st) }
            sqlite3_bind_int(st, 1, Int32(limit))

            var out: [Entry] = []
            while sqlite3_step(st) == SQLITE_ROW {
                out.append(Entry(
                    id: sqlite3_column_int64(st, 0),
                    merchant: text(st, 1),
                    amount: sqlite3_column_double(st, 2),
                    currency: text(st, 3),
                    category: text(st, 4),
                    date: Date(timeIntervalSince1970: TimeInterval(sqlite3_column_int64(st, 5))),
                    memoryID: sqlite3_column_int64(st, 6)))
            }
            return out
        }
        entries = rows
        return rows
    }

    /// What was spent in a window, by category.
    func total(from: Date, to: Date) -> (total: Double, currency: String, byCategory: [(String, Double)]) {
        let inRange = load().filter { $0.date >= from && $0.date < to }
        guard !inRange.isEmpty else { return (0, "USD", []) }

        var byCategory: [String: Double] = [:]
        for e in inRange { byCategory[e.category.isEmpty ? "Other" : e.category, default: 0] += e.amount }

        return (inRange.reduce(0) { $0 + $1.amount },
                // The commonest currency present, rather than a guess: a total mixing dollars and
                // euros is a wrong number, and labelling it honestly is the least that can be done.
                inRange.map(\.currency).mostCommon() ?? "USD",
                byCategory.sorted { $0.value > $1.value }.map { ($0.key, $0.value) })
    }

    /// A line for the brain, so money questions are answered from the ledger and not from prose.
    func summary(monthsBack: Int = 0) -> String {
        let cal = Calendar.current
        let now = Date.now
        guard let start = cal.date(from: cal.dateComponents([.year, .month], from: now)),
              let from = cal.date(byAdding: .month, value: -monthsBack, to: start),
              let to = cal.date(byAdding: .month, value: 1, to: from) else { return "" }

        let (total, currency, byCategory) = self.total(from: from, to: to)
        guard total > 0 else { return "" }

        let f = NumberFormatter(); f.numberStyle = .currency; f.currencyCode = currency
        func money(_ v: Double) -> String { f.string(from: NSNumber(value: v)) ?? "\(v)" }

        let month = from.formatted(.dateTime.month(.wide).year())
        let parts = byCategory.prefix(6).map { "\($0.0) \(money($0.1))" }.joined(separator: ", ")
        return "\(month): \(money(total)) across \(entries.filter { $0.date >= from && $0.date < to }.count) "
            + "receipts — \(parts)"
    }

    // MARK: - Writing

    @discardableResult
    func record(merchant: String, amount: Double, currency: String, category: String,
                date: Date, memoryID: Int64) -> Bool {
        guard amount > 0 else { return false }
        let ok: Bool = queue.sync {
            var st: OpaquePointer?
            let sql = """
                INSERT INTO expenses (merchant, amount, currency, category, ts, memory_id)
                VALUES (?,?,?,?,?,?);
                """
            guard sqlite3_prepare_v2(db, sql, -1, &st, nil) == SQLITE_OK else { return false }
            defer { sqlite3_finalize(st) }
            sqlite3_bind_text(st, 1, merchant, -1, Self.transient)
            sqlite3_bind_double(st, 2, amount)
            sqlite3_bind_text(st, 3, currency, -1, Self.transient)
            sqlite3_bind_text(st, 4, category, -1, Self.transient)
            sqlite3_bind_int64(st, 5, Int64(date.timeIntervalSince1970))
            sqlite3_bind_int64(st, 6, memoryID)
            return sqlite3_step(st) == SQLITE_DONE
        }
        if ok { load() }
        return ok
    }

    func remove(_ entry: Entry) {
        queue.sync {
            var st: OpaquePointer?
            guard sqlite3_prepare_v2(db, "DELETE FROM expenses WHERE id = ?;", -1, &st, nil)
                    == SQLITE_OK else { return }
            defer { sqlite3_finalize(st) }
            sqlite3_bind_int64(st, 1, entry.id)
            sqlite3_step(st)
        }
        load()
    }

    private func text(_ st: OpaquePointer?, _ col: Int32) -> String {
        guard let c = sqlite3_column_text(st, col) else { return "" }
        return String(cString: c)
    }
}

// MARK: - Reading a receipt

extension Expenses {

    /// Pull a receipt apart. Returns nil when the text plainly isn't one.
    ///
    /// Deliberately conservative. A wrong number in a ledger is worse than a missing one: a missing
    /// receipt is visibly missing, and a wrong total quietly poisons every figure derived from it.
    @discardableResult
    func readReceipt(_ raw: String, memoryID: Int64) async -> Entry? {
        guard let amount = Self.total(in: raw) else { return nil }

        let currency = Self.currency(in: raw)
        let date = Self.date(in: raw) ?? .now
        var merchant = Self.merchant(in: raw)
        var category = Self.category(for: merchant, text: raw)

        // The model is asked only about the part that genuinely needs judgement, and only if the
        // cheap read came up short. The total is never handed to it — a hallucinated number is
        // precisely the failure this whole file exists to avoid.
        if (merchant.isEmpty || category == "Other"), ModelRouter.shared.isConfigured {
            let system = """
                From this receipt text, output exactly two lines and nothing else:
                MERCHANT: the shop or company name
                CATEGORY: one of Groceries, Restaurant, Transport, Fuel, Shopping, Health, Bills, \
                Travel, Entertainment, Services, Other

                If the merchant is not stated, write MERCHANT: unknown. Never guess a name from the \
                products bought.
                """
            if let reply = try? await AgentClient.complete(
                system: system, user: String(raw.prefix(1_500)), tier: .cheap) {
                for line in reply.components(separatedBy: .newlines) {
                    let l = line.trimmingCharacters(in: .whitespaces)
                    if l.lowercased().hasPrefix("merchant:"), merchant.isEmpty {
                        let v = l.dropFirst(9).trimmingCharacters(in: .whitespaces)
                        if v.lowercased() != "unknown" { merchant = v }
                    }
                    if l.lowercased().hasPrefix("category:") {
                        category = l.dropFirst(9).trimmingCharacters(in: .whitespaces)
                    }
                }
            }
        }

        guard record(merchant: merchant, amount: amount, currency: currency,
                     category: category, date: date, memoryID: memoryID) else { return nil }
        return entries.first
    }

    /// The amount actually paid.
    ///
    /// A receipt is full of numbers — line items, subtotal, tax, change, a loyalty balance — and the
    /// largest is not reliably the total. So a labelled total wins outright, and only when nothing
    /// is labelled does the largest plausible figure stand in.
    static func total(in text: String) -> Double? {
        let lines = text.components(separatedBy: .newlines)
        let labels = ["total", "amount due", "balance due", "grand total", "to pay", "betrag",
                      "gesamt", "summe", "importe", "totale"]
        // "Subtotal" contains "total" and is the commonest wrong answer of all.
        let notLabels = ["subtotal", "sub total", "zwischensumme", "tax", "vat", "tip", "change",
                         "cash", "balance", "points", "saved", "discount"]

        for line in lines {
            let l = line.lowercased()
            guard labels.contains(where: l.contains),
                  !notLabels.contains(where: l.contains) else { continue }
            if let v = number(in: line) { return v }
        }

        // Nothing labelled — take the largest, which on an unlabelled slip is nearly always it.
        let all = lines.compactMap { number(in: $0) }.filter { $0 > 0 && $0 < 1_000_000 }
        return all.max()
    }


    /// First capture groups of `pattern`, or nil.
    ///
    /// Local rather than the shared String helper: that one lives in a file the app extensions do
    /// not build, and BrainContext — which reads this ledger — runs inside them.
    private static func match(_ pattern: String, in text: String) -> [String]? {
        guard let re = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]),
              let m = re.firstMatch(in: text, range: NSRange(text.startIndex..., in: text))
        else { return nil }
        return (0..<m.numberOfRanges).map { i in
            guard let r = Range(m.range(at: i), in: text) else { return "" }
            return String(text[r])
        }
    }

    private static func number(in line: String) -> Double? {
        // Both conventions: 1,234.56 and 1.234,56. Guessed from which separator comes last.
        guard let m = match(#"(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})|\d+[.,]\d{2}|\d+)"#, in: line)
        else { return nil }
        var s = m[1]
        let lastComma = s.lastIndex(of: ",")
        let lastDot = s.lastIndex(of: ".")
        if let c = lastComma, let d = lastDot {
            if c > d { s = s.replacingOccurrences(of: ".", with: "").replacingOccurrences(of: ",", with: ".") }
            else { s = s.replacingOccurrences(of: ",", with: "") }
        } else if let c = lastComma {
            // A lone comma two from the end is a decimal point; otherwise it groups thousands.
            s = s.distance(from: c, to: s.endIndex) == 3
                ? s.replacingOccurrences(of: ",", with: ".")
                : s.replacingOccurrences(of: ",", with: "")
        }
        return Double(s)
    }

    static func currency(in text: String) -> String {
        for (token, code) in [("€", "EUR"), ("£", "GBP"), ("$", "USD"), ("¥", "JPY"),
                              ("EUR", "EUR"), ("GBP", "GBP"), ("USD", "USD"), ("CHF", "CHF")]
        where text.contains(token) { return code }
        return Locale.current.currency?.identifier ?? "USD"
    }

    static func date(in text: String) -> Date? {
        let patterns = [#"(\d{4})-(\d{1,2})-(\d{1,2})"#, #"(\d{1,2})[./](\d{1,2})[./](\d{2,4})"#]
        for pattern in patterns {
            guard let m = match(pattern, in: text) else { continue }
            var c = DateComponents()
            if pattern.hasPrefix("(\\d{4})") {
                c.year = Int(m[1]); c.month = Int(m[2]); c.day = Int(m[3])
            } else {
                let a = Int(m[1]) ?? 1, b = Int(m[2]) ?? 1
                var year = Int(m[3]) ?? 2_000
                if year < 100 { year += 2_000 }

                // Day/month order is not stated anywhere on a receipt, and guessing one convention
                // is wrong half the world over: 12.03.2026 is 12 March in Berlin and 3 December in
                // Boston. Above 12 in either position settles it outright; otherwise both readings
                // are built and the one that is in the past wins, because a receipt is for
                // something already bought. A future-dated reading is not ambiguous, it is wrong.
                var candidates: [DateComponents] = []
                if a > 12 { candidates = [DateComponents(year: year, month: b, day: a)] }
                else if b > 12 { candidates = [DateComponents(year: year, month: a, day: b)] }
                else {
                    candidates = [DateComponents(year: year, month: b, day: a),   // day first
                                  DateComponents(year: year, month: a, day: b)]   // month first
                }

                let tomorrow = Date.now.addingTimeInterval(86_400)
                let readings = candidates
                    .compactMap(Calendar.current.date(from:))
                    .filter { $0 < tomorrow }
                // Closest to today: a receipt is far more likely to be from last week than from
                // ten months ago, and where both readings are plausible that is the better bet.
                if let best = readings.min(by: {
                    abs($0.timeIntervalSinceNow) < abs($1.timeIntervalSinceNow)
                }) { return best }
                continue
            }
            if let d = Calendar.current.date(from: c), d < Date.now.addingTimeInterval(86_400) {
                return d
            }
        }
        return nil
    }

    /// The shop, from the top of the slip where it nearly always is.
    private static func merchant(in text: String) -> String {
        for line in text.components(separatedBy: .newlines).prefix(4) {
            let l = line.trimmingCharacters(in: .whitespaces)
            // Skip addresses, phone numbers, dates and anything mostly digits — a merchant name is
            // letters.
            guard l.count > 2, l.count < 40,
                  l.rangeOfCharacter(from: .letters) != nil,
                  l.filter(\.isNumber).count < l.count / 3,
                  !l.lowercased().contains("receipt"), !l.lowercased().contains("invoice")
            else { continue }
            return l
        }
        return ""
    }

    private static func category(for merchant: String, text: String) -> String {
        let hay = (merchant + " " + text).lowercased()
        let map: [(String, [String])] = [
            ("Groceries", ["market", "grocer", "supermarket", "aldi", "lidl", "tesco", "kroger",
                           "safeway", "trader joe", "whole foods", "rewe", "edeka"]),
            ("Restaurant", ["restaurant", "cafe", "café", "coffee", "pizza", "sushi", "bar ",
                            "bistro", "starbucks", "mcdonald", "diner"]),
            ("Fuel", ["fuel", "petrol", "gas station", "shell", "bp ", "chevron", "aral", "esso"]),
            ("Transport", ["uber", "lyft", "taxi", "transit", "railway", "train", "metro", "parking"]),
            ("Health", ["pharmacy", "chemist", "apotheke", "clinic", "dental", "doctor", "hospital"]),
            ("Travel", ["hotel", "airbnb", "airlines", "airway", "booking.com", "flight"]),
            ("Entertainment", ["cinema", "theatre", "theater", "netflix", "spotify", "concert"]),
            ("Bills", ["invoice", "utility", "electric", "internet", "mobile", "insurance"])
        ]
        for (name, words) in map where words.contains(where: hay.contains) { return name }
        return "Other"
    }
}

private extension Array where Element == String {
    /// The value appearing most often — used for currency, where mixing is possible but rare.
    func mostCommon() -> String? {
        var counts: [String: Int] = [:]
        for v in self { counts[v, default: 0] += 1 }
        return counts.max { $0.value < $1.value }?.key
    }
}
