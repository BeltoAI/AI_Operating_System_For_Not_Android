import Foundation
import Observation

@Observable
final class AppState {
    var selectedTab: AppTab = .home
    var memories: [MemoryEntry] = []
    var actionQueue: [PlannedAction] = []

    func plan(prompt: String) {
        let lower = prompt.lowercased()
        var actions: [PlannedAction] = []

        if lower.contains("send") || lower.contains("message") || lower.contains("email") {
            actions.append(PlannedAction(type: "find_contact", title: "Find contact", risk: "read_only", requiresConfirmation: false))
            actions.append(PlannedAction(type: "message", title: "Draft outbound message", risk: "external_send", requiresConfirmation: true))
        }

        if lower.contains("receipt") || lower.contains("expense") || lower.contains("invoice") {
            actions.append(PlannedAction(type: "expense_record", title: "Extract expense", risk: "local_write", requiresConfirmation: false))
        }

        if lower.contains("remember") || lower.contains("memory") {
            actions.append(PlannedAction(type: "memory_search", title: "Search memory", risk: "read_only", requiresConfirmation: false))
        }

        if actions.isEmpty {
            actions.append(PlannedAction(type: "memory_search", title: "Gather memory context", risk: "read_only", requiresConfirmation: false))
        }

        actionQueue = actions
    }

    func remember(title: String, body: String) {
        memories.insert(
            MemoryEntry(title: title.isEmpty ? "Untitled" : title, body: body),
            at: 0
        )
    }

    func handle(intent: AppIntentRouter.HandledIntent) {
        switch intent.route {
        case .openCommand(let prompt):
            selectedTab = .home
            if let prompt {
                plan(prompt: prompt)
            }
        case .openMemory:
            selectedTab = .memory
        case .remember(let text):
            remember(title: "From Shortcuts", body: text)
            selectedTab = .memory
        }
    }
}

struct MemoryEntry: Identifiable, Equatable {
    let id = UUID()
    var title: String
    var body: String
}

struct PlannedAction: Identifiable, Equatable {
    let id = UUID()
    var type: String
    var title: String
    var risk: String
    var requiresConfirmation: Bool
}

