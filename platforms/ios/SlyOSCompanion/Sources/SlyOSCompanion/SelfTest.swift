import Foundation
import Observation

/// Does this actually work, right now, on this phone?
///
/// Every failure in this app's history was invisible until someone hit it in normal use: the brain
/// looked full while recall returned nothing, vision failed silently for weeks because the photo was
/// labelled JPEG and encoded as HEIC, and a calendar branch was unreachable behind a verb gate that
/// nobody could see from the outside. In each case the app's own screens said everything was fine.
///
/// So the checks here *exercise* things rather than reading a flag. "Google is connected" is a
/// setting; "a calendar request came back with events" is evidence. Where a real call would cost
/// money or send something, the check stops one step short and says so.
@Observable
final class SelfTest {

    static let shared = SelfTest()
    private init() {}

    enum Result: String {
        case pass = "PASS"
        case fail = "FAIL"
        case skip = "SKIP"
    }

    struct Check: Identifiable {
        let id = UUID()
        let area: String
        let name: String
        let result: Result
        let detail: String
        let ms: Int
    }

    private(set) var checks: [Check] = []
    private(set) var running = false
    private(set) var lastRun: Date?

    var failures: Int { checks.filter { $0.result == .fail }.count }

    /// Run everything. Each check is timed and isolated: one throwing must not end the run, or a
    /// single broken area hides every result behind it.
    @MainActor
    func run() async {
        guard !running else { return }
        running = true
        checks = []
        defer { running = false; lastRun = .now }

        await brainChecks()
        await modelChecks()
        await googleChecks()
        permissionChecks()
        await syncChecks()
    }

    private func record(_ area: String, _ name: String,
                        _ work: () async -> (Result, String)) async {
        let started = Date.now
        let (result, detail) = await work()
        checks.append(Check(area: area, name: name, result: result, detail: detail,
                            ms: Int(Date.now.timeIntervalSince(started) * 1000)))
    }

    // MARK: - Brain

    private func brainChecks() async {
        let store = SlyStore.shared

        await record("Brain", "Read and write") {
            let before = store.count()
            store.insert(kind: "note", title: "", body: "self-test \(Date.now.timeIntervalSince1970)",
                         source: "SelfTest")
            let after = store.count()
            return after > before
                ? (.pass, "wrote and counted (\(before) → \(after))")
                : (.fail, "the write did not increase the count — the brain is not persisting")
        }

        await record("Brain", "Keyword search") {
            let hits = store.search("self-test", limit: 5)
            return hits.isEmpty
                ? (.fail, "the row just written was not findable — the FTS index is not being kept up")
                : (.pass, "found \(hits.count)")
        }

        await record("Brain", "What it holds") {
            let total = store.count()
            guard total > 0 else {
                return (.skip, "empty — import a chat export or read a document in first")
            }
            let sources = store.countsBySource().prefix(4)
                .map { "\($0.0) \($0.1.formatted())" }.joined(separator: ", ")
            return (.pass, "\(total.formatted()) memories · \(sources)")
        }

        await record("Brain", "Semantic recall") {
            guard Embedder.isConfigured else {
                return (.skip, "no embedding provider — Gemini's free tier covers this")
            }
            let (indexed, total) = VectorStore.shared.coverage()
            guard indexed > 0 else {
                return (.fail, "nothing embedded yet — recall is keyword-only until this runs")
            }
            guard let vector = await Embedder.embedQuery("what do I need to do") else {
                return (.fail, "the embedding provider did not return a vector")
            }
            let near = VectorStore.shared.nearest(to: vector, limit: 3)
            return near.isEmpty
                ? (.fail, "\(indexed.formatted()) vectors indexed but the search matched none")
                : (.pass, "\(indexed.formatted()) vectors · nearest \(near.count)")
        }

        await record("Brain", "Context assembly") {
            let context = await BrainContext.build(for: "what do you know about me")
            return context.count > 200
                ? (.pass, "assembled \(context.count.formatted()) characters")
                : (.fail, "came back almost empty — answers will be ungrounded")
        }

        await record("Brain", "Learned facts") {
            let n = Distiller.facts.count
            return n > 0
                ? (.pass, "\(n) distilled from your own history")
                : (.skip, "nothing distilled yet — this runs once a day once there's material")
        }
    }

    // MARK: - Models

    private func modelChecks() async {
        await record("Models", "A provider answers") {
            guard ModelRouter.shared.isConfigured else {
                return (.fail, "no AI key at all — nothing that needs a model can work")
            }
            do {
                let reply = try await AgentClient.complete(
                    system: "Reply with the single word: ok", user: "ok", tier: .cheap)
                return reply.isEmpty
                    ? (.fail, "a provider accepted the request and returned nothing")
                    : (.pass, "answered \"\(reply.prefix(20))\"")
            } catch {
                return (.fail, error.localizedDescription)
            }
        }

        await record("Models", "Fallback chain") {
            let chain = ModelRouter.shared.chain(tier: .standard)
            switch chain.count {
            case 0: return (.fail, "no provider in the chain")
            case 1: return (.skip, "only \(chain[0].label) — one bad moment and there is no answer")
            default:
                return (.pass, chain.map(\.label).joined(separator: " → "))
            }
        }

        await record("Models", "Vision") {
            let seeing = ModelRouter.shared.chain(tier: .standard, needsVision: true)
            return seeing.isEmpty
                ? (.skip, "no model that can see — Look reads text on-device but cannot identify")
                : (.pass, seeing.map(\.label).joined(separator: " → "))
        }
    }

    // MARK: - Google

    private func googleChecks() async {
        guard GoogleAuth.shared.isConnected else {
            checks.append(Check(area: "Google", name: "Connected", result: .skip,
                                detail: "not connected — mail, invitations and documents are off",
                                ms: 0))
            return
        }

        await record("Google", "Token refresh") {
            do {
                _ = try await GoogleAuth.shared.accessToken()
                return (.pass, GoogleAuth.shared.connectedEmail ?? "connected")
            } catch {
                return (.fail, "signed in but the token will not refresh: \(error.localizedDescription)")
            }
        }

        await record("Google", "Calendar reads") {
            do {
                let events = try await GoogleCalendar.find(
                    to: Date.now.addingTimeInterval(7 * 24 * 3600), max: 10)
                return (.pass, "\(events.count) event\(events.count == 1 ? "" : "s") in the next week")
            } catch {
                return (.fail, error.localizedDescription)
            }
        }

        await record("Google", "Mail reads") {
            await MailWatch.shared.refresh(max: 3)
            if let problem = MailWatch.shared.lastError {
                return (.fail, problem)
            }
            return (.pass, "\(MailWatch.shared.items.count) needing a reply")
        }
    }

    // MARK: - Permissions

    private func permissionChecks() {
        let wanted: [(Permissions.Capability, String)] = [
            (.calendar, "what's on, and creating events"),
            (.reminders, "reminders that fire"),
            (.contacts, "knowing who someone is"),
            (.camera, "Look"),
            (.microphone, "talking to it"),
            (.notifications, "telling you when something needs you")
        ]
        for (capability, what) in wanted {
            let granted = Permissions.shared.state(capability) == .granted
            checks.append(Check(
                area: "Permissions", name: capability.title,
                result: granted ? .pass : .skip,
                detail: granted ? what : "off — \(what) will not work",
                ms: 0))
        }
    }

    // MARK: - Sync and backup

    private func syncChecks() async {
        checks.append(Check(
            area: "Sync", name: "Shared brain",
            result: SharedContainer.isShared ? .pass : .fail,
            detail: SharedContainer.isShared
                ? "the keyboard and share extension read the same brain"
                : "App Group unavailable — the keyboard sees an empty brain",
            ms: 0))

        await record("Sync", "Account") {
            guard SupabaseClient.shared.isConfigured else {
                return (.skip, "not configured in this build")
            }
            guard let email = SupabaseClient.shared.email else {
                return (.skip, "not signed in — the brain stays on this phone only")
            }
            return (.pass, "signed in as \(email)")
        }

        await record("Sync", "Drive backup") {
            guard GoogleAuth.shared.isConnected else { return (.skip, "needs Google") }
            let when = DriveBackup.shared.lastBackup
            guard let when else { return (.skip, "never backed up") }
            let days = Calendar.current.dateComponents([.day], from: when, to: .now).day ?? 0
            return days > 7
                ? (.skip, "last backed up \(days) days ago")
                : (.pass, "backed up \(when.formatted(date: .abbreviated, time: .shortened))")
        }
    }
}
