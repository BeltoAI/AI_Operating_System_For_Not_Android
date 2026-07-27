import Foundation
import Observation

/// Turning text into vectors, using whichever provider the owner already pays for.
///
/// No new key: if they have OpenAI or Gemini for answers, embeddings come from the same account.
/// Gemini is preferred because its embedding endpoint is free at the volumes a personal brain
/// needs — 67,000 messages through a paid embedder is a bill nobody agreed to.
enum Embedder {

    /// Which provider will do it, and what it costs to know.
    enum Provider: String {
        case gemini, openai

        var model: String {
            switch self {
            case .gemini: "gemini-embedding-001"
            case .openai: "text-embedding-3-small"
            }
        }
        /// Batch size. Both accept more, but a failure loses the whole batch, so this is a
        /// compromise between round trips and how much is lost when one fails.
        var batch: Int { self == .gemini ? 50 : 100 }
    }

    /// Free first. Embedding a whole brain on a paid endpoint is a real cost.
    static var available: Provider? {
        let router = ModelRouter.shared
        if router.hasKey(for: .gemini) { return .gemini }
        if router.hasKey(for: .openai) { return .openai }
        return nil
    }

    static var isConfigured: Bool { available != nil }

    /// Embed a batch. Returns vectors in the same order, or throws — a partial result silently
    /// misaligned with its inputs would attach every vector to the wrong memory.
    static func embed(_ texts: [String], using provider: Provider) async throws -> [[Double]] {
        guard !texts.isEmpty else { return [] }
        let key = ModelRouter.shared.key(for: provider == .gemini ? .gemini : .openai)

        switch provider {
        case .openai:
            var req = URLRequest(url: URL(string: "https://api.openai.com/v1/embeddings")!)
            req.httpMethod = "POST"
            req.setValue("Bearer \(key)", forHTTPHeaderField: "Authorization")
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.timeoutInterval = 120
            req.httpBody = try JSONSerialization.data(withJSONObject: [
                "model": provider.model, "input": texts
            ])

            let json = try await fire(req)
            let rows = json["data"] as? [[String: Any]] ?? []
            // Sorted by index, because the API does not promise order.
            return rows
                .sorted { ($0["index"] as? Int ?? 0) < ($1["index"] as? Int ?? 0) }
                .compactMap { $0["embedding"] as? [Double] }

        case .gemini:
            let url = "https://generativelanguage.googleapis.com/v1beta/models/"
                + "\(provider.model):batchEmbedContents?key=\(key)"
            var req = URLRequest(url: URL(string: url)!)
            req.httpMethod = "POST"
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.timeoutInterval = 120
            req.httpBody = try JSONSerialization.data(withJSONObject: [
                "requests": texts.map { text in
                    ["model": "models/\(provider.model)",
                     "content": ["parts": [["text": text]]],
                     // Asymmetric: a stored document and a question are embedded differently, and
                     // saying which is which measurably improves what comes back.
                     "taskType": "RETRIEVAL_DOCUMENT"]
                }
            ])

            let json = try await fire(req)
            let rows = json["embeddings"] as? [[String: Any]] ?? []
            return rows.compactMap { $0["values"] as? [Double] }
        }
    }

    /// Embed a question. Same provider, different task type.
    static func embedQuery(_ text: String) async -> [Double]? {
        guard let provider = available else { return nil }
        if provider == .openai {
            return try? await embed([text], using: provider).first
        }
        let key = ModelRouter.shared.key(for: .gemini)
        let url = "https://generativelanguage.googleapis.com/v1beta/models/"
            + "\(provider.model):embedContent?key=\(key)"
        var req = URLRequest(url: URL(string: url)!)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.timeoutInterval = 30
        req.httpBody = try? JSONSerialization.data(withJSONObject: [
            "model": "models/\(provider.model)",
            "content": ["parts": [["text": text]]],
            "taskType": "RETRIEVAL_QUERY"
        ])
        guard let json = try? await fire(req) else { return nil }
        return (json["embedding"] as? [String: Any])?["values"] as? [Double]
    }

    private static func fire(_ req: URLRequest) async throws -> [String: Any] {
        let (data, response) = try await URLSession.shared.data(for: req)
        let code = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(code) else {
            throw AgentClient.ClientError.badResponse(code, String(data: data, encoding: .utf8) ?? "")
        }
        return (try? JSONSerialization.jsonObject(with: data) as? [String: Any]) ?? [:]
    }
}

/// Works through the brain in the background, giving everything a vector.
///
/// Time-budgeted rather than count-budgeted. Android's first attempt did 300 rows every 15 minutes,
/// which is 33 hours for a large brain — the work never finished and nobody could see why. This
/// runs until it runs out of time, reports where it got to, and picks up from there.
@Observable
final class EmbedWorker {

    static let shared = EmbedWorker()

    private(set) var running = false
    private(set) var embedded = 0
    private(set) var total = 0
    private(set) var note: String?

    var progress: Double { total == 0 ? 0 : Double(embedded) / Double(total) }
    var isComplete: Bool { total > 0 && embedded >= total }

    private init() { refreshCounts() }

    func refreshCounts() {
        let coverage = VectorStore.shared.coverage()
        embedded = coverage.embedded
        total = coverage.total
    }

    /// Embed for up to `seconds`, then stop and report.
    @MainActor
    func run(seconds: TimeInterval = 60) async {
        guard !running else { return }
        guard let provider = Embedder.available else {
            note = "Add a Gemini or OpenAI key — semantic recall needs one to build the index. "
                 + "Gemini's is free."
            return
        }
        running = true
        note = nil
        defer { running = false; refreshCounts() }

        let deadline = Date().addingTimeInterval(seconds)
        var done = 0

        while Date() < deadline {
            let batch = VectorStore.shared.pending(limit: provider.batch)
            if batch.isEmpty {
                note = "Everything is indexed."
                break
            }
            do {
                let vectors = try await Embedder.embed(batch.map(\.text), using: provider)
                // Only pair up what actually came back; a short reply must not shift every vector
                // onto the wrong memory.
                for (row, vector) in zip(batch, vectors) {
                    VectorStore.shared.put(id: row.id, vector: vector, model: provider.model)
                }
                done += vectors.count
                refreshCounts()
            } catch {
                note = "Stopped: \(error.localizedDescription)"
                break
            }
        }

        if note == nil {
            note = "Indexed \(done.formatted()) — \(embedded.formatted()) of \(total.formatted()) done."
        }
    }
}
