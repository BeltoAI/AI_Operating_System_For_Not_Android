import SwiftUI

enum AppTab: String, CaseIterable, Identifiable {
    case home
    case memory
    case actions
    case settings

    var id: String { rawValue }

    var title: String {
        switch self {
        case .home: "Home"
        case .memory: "Memory"
        case .actions: "Actions"
        case .settings: "Settings"
        }
    }

    var symbol: String {
        switch self {
        case .home: "sparkles"
        case .memory: "brain.head.profile"
        case .actions: "checklist"
        case .settings: "gearshape"
        }
    }
}

struct AppView: View {
    @Environment(AppState.self) private var appState

    var body: some View {
        @Bindable var appState = appState

        TabView(selection: $appState.selectedTab) {
            CommandCenterView()
                .tabItem { Label(AppTab.home.title, systemImage: AppTab.home.symbol) }
                .tag(AppTab.home)

            MemoryView()
                .tabItem { Label(AppTab.memory.title, systemImage: AppTab.memory.symbol) }
                .tag(AppTab.memory)

            ActionQueueView()
                .tabItem { Label(AppTab.actions.title, systemImage: AppTab.actions.symbol) }
                .tag(AppTab.actions)

            SettingsView()
                .tabItem { Label(AppTab.settings.title, systemImage: AppTab.settings.symbol) }
                .tag(AppTab.settings)
        }
    }
}

struct CommandCenterView: View {
    @Environment(AppState.self) private var appState
    @State private var prompt = ""

    var body: some View {
        NavigationStack {
            Form {
                Section("Prompt") {
                    TextEditor(text: $prompt)
                        .frame(minHeight: 120)
                    Button("Plan actions") {
                        appState.plan(prompt: prompt)
                    }
                    .disabled(prompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }

                Section("Latest plan") {
                    if appState.actionQueue.isEmpty {
                        ContentUnavailableView("No actions yet", systemImage: "sparkles", description: Text("Plan a command or run an App Intent."))
                    } else {
                        ForEach(appState.actionQueue) { action in
                            VStack(alignment: .leading, spacing: 6) {
                                Text(action.title).font(.headline)
                                Text(action.risk).font(.caption).foregroundStyle(.secondary)
                                if action.requiresConfirmation {
                                    Label("Requires confirmation", systemImage: "hand.raised")
                                        .font(.caption)
                                        .foregroundStyle(.orange)
                                }
                            }
                        }
                    }
                }
            }
            .navigationTitle("SlyOS")
        }
    }
}

struct MemoryView: View {
    @Environment(AppState.self) private var appState
    @State private var title = ""
    @State private var bodyText = ""

    var body: some View {
        NavigationStack {
            List {
                Section("Remember") {
                    TextField("Title", text: $title)
                    TextField("Memory", text: $bodyText, axis: .vertical)
                    Button("Save memory") {
                        appState.remember(title: title, body: bodyText)
                        title = ""
                        bodyText = ""
                    }
                    .disabled(bodyText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }

                Section("Local") {
                    ForEach(appState.memories) { memory in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(memory.title).font(.headline)
                            Text(memory.body).foregroundStyle(.secondary)
                        }
                    }
                }
            }
            .navigationTitle("Memory")
        }
    }
}

struct ActionQueueView: View {
    @Environment(AppState.self) private var appState

    var body: some View {
        NavigationStack {
            List(appState.actionQueue) { action in
                VStack(alignment: .leading, spacing: 6) {
                    Text(action.title).font(.headline)
                    Text(action.type).foregroundStyle(.secondary)
                    Text(action.requiresConfirmation ? "Held for confirmation" : "Allowed automatically")
                        .font(.caption)
                }
            }
            .navigationTitle("Actions")
        }
    }
}

struct SettingsView: View {
    var body: some View {
        NavigationStack {
            Form {
                Section("Sync") {
                    Text("Supabase URL")
                    Text("Publishable key")
                    Text("Magic link email")
                }

                Section("Platform limits") {
                    Text("iOS cannot replace the launcher, read all notifications, or control arbitrary apps. It can expose App Intents, Shortcuts, Share Extension, widgets, camera, files, reminders, and drafts.")
                }
            }
            .navigationTitle("Settings")
        }
    }
}

#Preview {
    AppView()
        .environment(AppState())
        .environment(AppIntentRouter.shared)
}

