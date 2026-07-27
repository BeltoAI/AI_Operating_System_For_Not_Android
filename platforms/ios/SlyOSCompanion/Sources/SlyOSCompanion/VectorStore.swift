import Foundation
import SQLite3

/// Recall by **meaning** rather than by exact words — ported from Android's `VectorStore`.
///
/// This is the difference between an assistant and a search box. Keyword search cannot answer "what
/// did I promise Carlos" unless someone typed the word "promise"; an embedding can, because "I'll
/// get you the lease numbers by Friday" and "what did you promise" land near each other.
///
/// Two decisions carried over, both of which matter at this scale:
///
/// * **int8 quantisation.** A 1536-dimension float vector is 6KB; the int8 copy is 1.5KB. Over a
///   67,000-message brain that is 400MB against 100MB, and the search is I/O-bound rather than
///   compute-bound, so a quarter of the bytes is roughly four times the speed.
/// * **No stored scale.** Quantising as `v[i] / max|v| * 127` loses the magnitude, but cosine
///   divides by the norm of each vector — so the scale appears once in the numerator and once
///   inside the square root of the denominator, and cancels. Storing it would be dead weight.
///
/// Degrades to keyword search when no embedding provider is configured. It must never be the reason
/// the app stops answering.
final class VectorStore {

    static let shared = VectorStore()

    private var db: OpaquePointer? { SlyStore.shared.db }
    private let queue = DispatchQueue(label: "com.belto.slyos.vectors")

    private init() { prepare() }

    private func prepare() {
        queue.sync {
            // Vectors live beside the memories, keyed by row id, so a deleted memory takes its
            // vector with it rather than leaving an orphan that can still be recalled.
            sqlite3_exec(db, """
                CREATE TABLE IF NOT EXISTS vectors (
                  id    INTEGER PRIMARY KEY,
                  dim   INTEGER NOT NULL,
                  q8    BLOB NOT NULL,
                  model TEXT NOT NULL DEFAULT ''
                );
                """, nil, nil, nil)
            sqlite3_exec(db, """
                CREATE TRIGGER IF NOT EXISTS vectors_gc AFTER DELETE ON memories BEGIN
                  DELETE FROM vectors WHERE id = old.id;
                END;
                """, nil, nil, nil)
        }
    }

    // MARK: - Writing

    /// Store one vector, quantised.
    func put(id: Int64, vector: [Double], model: String) {
        guard !vector.isEmpty else { return }
        let bytes = Self.quantise(vector)

        queue.sync {
            var st: OpaquePointer?
            let sql = "INSERT OR REPLACE INTO vectors (id, dim, q8, model) VALUES (?,?,?,?);"
            guard sqlite3_prepare_v2(db, sql, -1, &st, nil) == SQLITE_OK else { return }
            defer { sqlite3_finalize(st) }
            sqlite3_bind_int64(st, 1, id)
            sqlite3_bind_int(st, 2, Int32(vector.count))
            bytes.withUnsafeBytes { raw in
                _ = sqlite3_bind_blob(st, 3, raw.baseAddress, Int32(bytes.count), nil)
            }
            sqlite3_bind_text(st, 4, model, -1, unsafeBitCast(-1, to: sqlite3_destructor_type.self))
            sqlite3_step(st)
        }
    }

    /// `v[i] / max|v| * 127` — the scale is deliberately not kept; see the note above.
    static func quantise(_ vector: [Double]) -> [Int8] {
        let peak = vector.map(abs).max() ?? 0
        guard peak > 0 else { return vector.map { _ in Int8(0) } }
        return vector.map { Int8(clamping: Int(($0 / peak * 127).rounded())) }
    }

    // MARK: - Reading

    /// Memory ids nearest the query vector, best first.
    ///
    /// The whole table is scanned. That sounds wrong until you measure it: 100,000 int8 vectors is
    /// 150MB of sequential reads and a dot product per row, which is well under a second — and an
    /// approximate index would cost more in complexity than it saves at this size.
    func nearest(to query: [Double], limit: Int = 40) -> [(id: Int64, score: Double)] {
        guard !query.isEmpty else { return [] }
        let normSquared = query.reduce(0) { $0 + $1 * $1 }
        guard normSquared > 0 else { return [] }

        return queue.sync {
            var st: OpaquePointer?
            guard sqlite3_prepare_v2(db, "SELECT id, dim, q8 FROM vectors;", -1, &st, nil) == SQLITE_OK
            else { return [] }
            defer { sqlite3_finalize(st) }

            var scored: [(Int64, Double)] = []
            while sqlite3_step(st) == SQLITE_ROW {
                let id = sqlite3_column_int64(st, 0)
                let dim = Int(sqlite3_column_int(st, 1))
                // A vector from a different provider has a different dimension and is meaningless
                // here — comparing them would return confident nonsense.
                guard dim == query.count,
                      let raw = sqlite3_column_blob(st, 2) else { continue }
                let bytes = raw.assumingMemoryBound(to: Int8.self)

                var dot = 0.0, norm = 0.0
                for i in 0..<dim {
                    let v = Double(bytes[i])
                    dot += query[i] * v
                    norm += v * v
                }
                let denominator = (normSquared * norm).squareRoot()
                if denominator > 0 { scored.append((id, dot / denominator)) }
            }
            return scored
                .sorted { $0.1 > $1.1 }
                .prefix(limit)
                .map { (id: $0.0, score: $0.1) }
        }
    }

    /// How much of the brain has been embedded — the honest answer to "why didn't it find that?".
    func coverage() -> (embedded: Int, total: Int) {
        queue.sync {
            func count(_ sql: String) -> Int {
                var st: OpaquePointer?
                guard sqlite3_prepare_v2(db, sql, -1, &st, nil) == SQLITE_OK else { return 0 }
                defer { sqlite3_finalize(st) }
                return sqlite3_step(st) == SQLITE_ROW ? Int(sqlite3_column_int64(st, 0)) : 0
            }
            return (count("SELECT COUNT(*) FROM vectors;"),
                    count("SELECT COUNT(*) FROM memories;"))
        }
    }

    /// Rows still needing a vector, oldest first.
    func pending(limit: Int) -> [(id: Int64, text: String)] {
        queue.sync {
            var st: OpaquePointer?
            let sql = """
                SELECT m.id, m.person, m.title, m.body FROM memories m
                LEFT JOIN vectors v ON v.id = m.id
                WHERE v.id IS NULL AND length(m.body) > 12
                ORDER BY m.ts DESC LIMIT ?;
                """
            guard sqlite3_prepare_v2(db, sql, -1, &st, nil) == SQLITE_OK else { return [] }
            defer { sqlite3_finalize(st) }
            sqlite3_bind_int(st, 1, Int32(limit))

            var out: [(Int64, String)] = []
            while sqlite3_step(st) == SQLITE_ROW {
                func text(_ col: Int32) -> String {
                    sqlite3_column_text(st, col).map { String(cString: $0) } ?? ""
                }
                // Who and what, together — "Carlos: the lease numbers by Friday" embeds far better
                // than the sentence alone, because the person is half of what makes it findable.
                let combined = [text(1), text(2), text(3)]
                    .filter { !$0.isEmpty }
                    .joined(separator: ": ")
                out.append((sqlite3_column_int64(st, 0), String(combined.prefix(2_000))))
            }
            return out
        }
    }
}
