import Foundation
import Observation

/// Home's own conversation — one continuous thread, never a list.
///
/// Android splits these deliberately and iOS matches it: Home is the assistant you talk to all day,
/// so it has one rolling memory that survives closing the app; the Chat screen is where separate
/// conversations live. Merging them would mean either Home forgetting every time you started a new
/// chat, or the chat list filling with one-line asides.
///
/// This is the fix for the concrete complaint: a photo was read, its text described, and the very
/// next question — "what was it?" — got a blank look, because nothing carried between prompts.
enum HomeChat {

    struct Turn: Codable {
        var question: String
        var answer: String
        var at: Date = .now
    }

    /// Kept, so the record is durable. Only the newest few are ever sent to a model.
    private static let cap = 200
    private static let key = "home.turns"

    static func add(question: String, answer: String) {
        guard !question.isEmpty || !answer.isEmpty else { return }
        var turns = all()
        turns.append(Turn(question: question, answer: answer))
        if turns.count > cap { turns.removeFirst(turns.count - cap) }
        if let data = try? JSONEncoder().encode(turns) {
            SharedContainer.defaults.set(data, forKey: key)
        }
    }

    static func all() -> [Turn] {
        guard let data = SharedContainer.defaults.data(forKey: key),
              let turns = try? JSONDecoder().decode([Turn].self, from: data) else { return [] }
        return turns
    }

    /// The recent exchange, oldest-first, as the model wants it.
    static func context(_ n: Int = 12) -> [(role: String, text: String)] {
        all().suffix(n).flatMap { [(role: "user", text: $0.question),
                                   (role: "assistant", text: $0.answer)] }
    }

    static func clear() { SharedContainer.defaults.removeObject(forKey: key) }
}

/// Conversations that continue, and more than one of them.
///
/// Before this, every prompt on Home was standalone. Upload a photo, get its text read back, then
/// ask "what was it?" — and the app had already forgotten, because the second prompt reached the
/// model with no trace of the first. That is not a chat; it is a search box that answers in prose.
///
/// Threads are separate for the same reason they are separate everywhere else: a question about
/// dinner plans should not drag in the context of a contract you were reading an hour ago.
///
/// Stored in the App Group so a thread started in the app is the same thread the keyboard sees, and
/// as JSON rather than SQLite because the whole file is small and is always read and written whole.
@Observable
final class ChatStore {

    static let shared = ChatStore()

    struct Turn: Codable, Identifiable, Equatable {
        var id = UUID()
        var role: String        // "user" | "assistant"
        var text: String
        var at: Date = .now
    }

    struct Thread: Codable, Identifiable, Equatable {
        var id: Int64
        var title: String
        var updated: Date
        var turns: [Turn]

        var displayTitle: String { title.isEmpty ? "New chat" : title }
    }

    /// Per thread. Older turns are gone from the thread but still in the brain, which is where
    /// anything worth recalling lives anyway.
    private static let maxTurns = 200
    /// How many turns are handed to the model. Enough for a conversation to hold together; not so
    /// many that the history crowds out the recalled memories, which are the actual product.
    private static let contextTurns = 12

    private static let key = "chat.threads"

    private(set) var threads: [Thread] = []
    /// The thread Home is currently in. Persisted, so closing the app does not silently start a new
    /// conversation and lose the thread of what you were doing.
    var currentID: Int64? {
        didSet { SharedContainer.defaults.set(currentID ?? 0, forKey: "chat.current") }
    }

    private init() {
        load()
        let saved = Int64(SharedContainer.defaults.integer(forKey: "chat.current"))
        currentID = threads.contains { $0.id == saved } ? saved : threads.first?.id
    }

    // MARK: - Reading

    var current: Thread? {
        guard let currentID else { return nil }
        return threads.first { $0.id == currentID }
    }

    /// The recent turns, for grounding the next answer.
    ///
    /// Returned oldest-first, which is the order a conversation is read in — handed to a model
    /// newest-first it reasons about the exchange backwards.
    func context(limit: Int = contextTurns) -> [(role: String, text: String)] {
        guard let thread = current else { return [] }
        return thread.turns.suffix(limit).map { (role: $0.role, text: $0.text) }
    }

    // MARK: - Writing

    @discardableResult
    func newThread() -> Int64 {
        let id = Int64(Date.now.timeIntervalSince1970 * 1000)
        threads.insert(Thread(id: id, title: "", updated: .now, turns: []), at: 0)
        currentID = id
        save()
        return id
    }

    /// Add a turn to the current thread, starting one if there isn't a current thread yet.
    func append(role: String, text: String) {
        let id = currentID ?? newThread()
        guard let index = threads.firstIndex(where: { $0.id == id }) else { return }

        threads[index].turns.append(Turn(role: role, text: text))
        if threads[index].turns.count > Self.maxTurns {
            threads[index].turns.removeFirst(threads[index].turns.count - Self.maxTurns)
        }
        threads[index].updated = .now

        // Titled from the first thing asked, so the list reads as what you talked about rather than
        // as a column of timestamps.
        if threads[index].title.isEmpty, role == "user" {
            threads[index].title = String(text.trimmingCharacters(in: .whitespacesAndNewlines).prefix(42))
        }

        // Newest first. The list is the picker's order.
        let moved = threads.remove(at: index)
        threads.insert(moved, at: 0)
        save()
    }

    func rename(_ id: Int64, to title: String) {
        guard let index = threads.firstIndex(where: { $0.id == id }) else { return }
        threads[index].title = title.trimmingCharacters(in: .whitespacesAndNewlines)
        save()
    }

    func delete(_ id: Int64) {
        threads.removeAll { $0.id == id }
        if currentID == id { currentID = threads.first?.id }
        save()
    }

    func clearAll() {
        threads = []
        currentID = nil
        save()
    }

    // MARK: - Persistence

    private func save() {
        guard let data = try? JSONEncoder().encode(threads) else { return }
        SharedContainer.defaults.set(data, forKey: Self.key)
    }

    private func load() {
        guard let data = SharedContainer.defaults.data(forKey: Self.key),
              let saved = try? JSONDecoder().decode([Thread].self, from: data) else { return }
        threads = saved.sorted { $0.updated > $1.updated }
    }
}
