import AppIntents
import Foundation
import Observation

@Observable
final class AppIntentRouter {
    enum Route: Equatable {
        case openCommand(prompt: String?)
        case openMemory
        case remember(text: String)
    }

    struct HandledIntent: Equatable {
        let id = UUID()
        let route: Route
    }

    static let shared = AppIntentRouter()
    var handledIntent: HandledIntent?

    private init() {}
}

struct OpenSlyOSIntent: AppIntent {
    static let title: LocalizedStringResource = "Open SlyOS"
    static let description = IntentDescription("Open SlyOS to the command center.")
    static let openAppWhenRun = true

    @Parameter(
        title: "Prompt",
        inputConnectionBehavior: .connectToPreviousIntentResult
    )
    var prompt: String?

    func perform() async throws -> some IntentResult {
        await MainActor.run {
            AppIntentRouter.shared.handledIntent = .init(route: .openCommand(prompt: prompt))
        }
        return .result()
    }
}

struct RememberInSlyOSIntent: AppIntent {
    static let title: LocalizedStringResource = "Remember in SlyOS"
    static let description = IntentDescription("Save a memory into the SlyOS brain.")
    static let openAppWhenRun = false

    @Parameter(
        title: "Memory",
        inputConnectionBehavior: .connectToPreviousIntentResult
    )
    var text: String

    func perform() async throws -> some IntentResult & ProvidesDialog {
        await MainActor.run {
            AppIntentRouter.shared.handledIntent = .init(route: .remember(text: text))
        }
        return .result(dialog: "Saved to SlyOS memory.")
    }
}

struct OpenSlyOSMemoryIntent: AppIntent {
    static let title: LocalizedStringResource = "Open SlyOS memory"
    static let openAppWhenRun = true

    func perform() async throws -> some IntentResult {
        await MainActor.run {
            AppIntentRouter.shared.handledIntent = .init(route: .openMemory)
        }
        return .result()
    }
}

struct SlyOSShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: OpenSlyOSIntent(),
            phrases: [
                "Open SlyOS",
                "Ask SlyOS in \(.applicationName)"
            ],
            shortTitle: "Ask SlyOS",
            systemImageName: "sparkles"
        )

        AppShortcut(
            intent: RememberInSlyOSIntent(),
            phrases: [
                "Remember this in \(.applicationName)",
                "Save to SlyOS"
            ],
            shortTitle: "Remember",
            systemImageName: "brain.head.profile"
        )

        AppShortcut(
            intent: OpenSlyOSMemoryIntent(),
            phrases: [
                "Open SlyOS memory",
                "Show my SlyOS brain"
            ],
            shortTitle: "Memory",
            systemImageName: "brain"
        )
    }
}

