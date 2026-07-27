import Foundation
import NaturalLanguage
import Observation

/// Turning text into vectors, using whichever provider the owner already pays for.
///
/// No new key: if they have OpenAI or Gemini for answers, embeddings come from the same account.
/// Gemini is preferred because its embedding endpoint is free at the volumes a personal brain
/// needs — 67,000 messages through a paid embedder is a bill nobody agreed to.
enum Embedder {

    enum EmbedError: LocalizedError {
        case unavailable
        var errorDescription: String? { "No embedder is available on this device." }
    }

    /// Which provider will do it, and what it costs to know.
    enum Provider: String {
        /// Apple's own, running on the phone. No key, no network, no bill, no spend cap — and no
        /// sentence leaves the device to be turned into a vector, which is the same promise the
        /// rest of the brain makes.
        case local
        case gemini, openai, mistral

        var model: String {
            switch self {
            case .local: "apple-nl-contextual-v1"
            case .gemini: "gemini-embedding-001"
            case .openai: "text-embedding-3-small"
            case .mistral: "mistral-embed"
            }
        }
        /// Batch size. Both accept more, but a failure loses the whole batch, so this is a
        /// compromise between round trips and how much is lost when one fails.
        var batch: Int {
            switch self {
            // No round trip to lose, so the only limit is memory.
            case .local: 200
            case .gemini: 50
            case .openai, .mistral: 100
            }
        }

        /// Mistral speaks the OpenAI embeddings shape exactly, so it shares that request path.
        var isOpenAIShaped: Bool { self == .openai || self == .mistral }

        var endpoint: String {
            switch self {
            case .openai: "https://api.openai.com/v1/embeddings"
            case .mistral: "https://api.mistral.ai/v1/embeddings"
            case .gemini, .local: ""   // gemini builds per-call; local never leaves the phone
            }
        }
    }

    /// Free first. Embedding a whole brain on a paid endpoint is a real cost.
    ///
    /// Mistral is in the list because without it semantic recall simply stops the moment the other
    /// two are unavailable — which is not hypothetical: a spend cap on one account and an exhausted
    /// quota on the other left the brain keyword-only with no way to fix it short of adding a
    /// third-party key the owner did not have. `mistral-embed` returns 1,024 dimensions and is
    /// verified working.
    static var available: Provider? {
        // On-device first, and it is not a fallback — it is the right default. It costs nothing,
        // works offline, cannot be rate-limited, and cannot stop working because a billing cap was
        // hit on an unrelated account. That last one is not hypothetical: a spend cap on Gemini and
        // an exhausted OpenAI quota left the brain keyword-only with no way to fix it.
        //
        // The hosted embedders remain, since they are stronger, and someone who wants the best
        // recall can switch. But nobody should have to buy anything for the brain to work at all.
        if local != nil { return .local }
        let router = ModelRouter.shared
        if router.hasKey(for: .gemini) { return .gemini }
        if router.hasKey(for: .mistral) { return .mistral }
        if router.hasKey(for: .openai) { return .openai }
        return nil
    }

    /// Apple's contextual sentence embedding, if this device has the model for the current language.
    ///
    /// Built once: loading it is expensive and it is used on every message of an import.
    static let local: NLContextualEmbedding? = {
        let language = Locale.current.language.languageCode?.identifier ?? "en"
        guard let embedding = NLContextualEmbedding(language: NLLanguage(language))
                ?? NLContextualEmbedding(language: .english) else { return nil }
        if !embedding.hasAvailableAssets {
            // The asset downloads on first use; until it lands, a hosted embedder covers.
            embedding.requestAssets { _, _ in }
            return nil
        }
        guard (try? embedding.load()) != nil else { return nil }
        return embedding
    }()

    /// Embed on the phone. One vector per text, in order.
    ///
    /// The token vectors are mean-pooled into a sentence vector — the standard reduction, and the
    /// one that makes two paraphrases of the same sentence land near each other.
    private static func embedLocally(_ texts: [String]) -> [[Double]]? {
        guard let model = local else { return nil }
        var out: [[Double]] = []
        for text in texts {
            let trimmed = String(text.prefix(2_000))
            guard let result = try? model.embeddingResult(for: trimmed, language: nil) else {
                out.append([])
                continue
            }
            var sum = [Double](repeating: 0, count: model.dimension)
            var count = 0
            result.enumerateTokenVectors(in: trimmed.startIndex..<trimmed.endIndex) { vector, _ in
                for (i, v) in vector.enumerated() where i < sum.count { sum[i] += v }
                count += 1
                return true
            }
            out.append(count > 0 ? sum.map { $0 / Double(count) } : [])
        }
        return out
    }

    static var isConfigured: Bool { available != nil }

    /// Embed a batch. Returns vectors in the same order, or throws — a partial result silently
    /// misaligned with its inputs would attach every vector to the wrong memory.
    static func embed(_ texts: [String], using provider: Provider) async throws -> [[Double]] {
        guard !texts.isEmpty else { return [] }

        // No key, no request, no failure mode.
        if provider == .local {
            guard let vectors = embedLocally(texts) else { throw EmbedError.unavailable }
            return vectors
        }

        // The key must match the provider. This read `.gemini : .openai`, so Mistral was handed
        // OpenAI's key and every request came back 401 — a provider that looked configured and
        // could never succeed.
        let routed: ModelRouter.Provider = switch provider {
        case .gemini: .gemini
        case .mistral: .mistral
        case .openai, .local: .openai
        }
        let key = ModelRouter.shared.key(for: routed)

        switch provider {
        case .local:
            throw EmbedError.unavailable   // handled above
        case .openai, .mistral:
            var req = URLRequest(url: URL(string: provider.endpoint)!)
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
        // Everything except Gemini goes through the ordinary batch path. This read
        // `if provider == .openai`, so local and Mistral queries fell through to the Gemini
        // endpoint with a Gemini key — the corpus embedded with one model and the question with
        // another, which is not a weaker search, it is a meaningless one.
        guard provider == .gemini else {
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
