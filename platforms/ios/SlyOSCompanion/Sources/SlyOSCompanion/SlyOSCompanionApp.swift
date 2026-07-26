import SwiftUI

@main
struct SlyOSCompanionApp: App {
    @State private var appState = AppState()
    @State private var settings = SlySettings.shared
    @State private var intentRouter = AppIntentRouter.shared

    init() {
        // Location reaches UIKit APIs an extension cannot use, so it is handed to the client here
        // rather than referenced from it.
        AgentClient.placeResolver = { await LocationProvider.shared.describe() }
    }

    var body: some Scene {
        WindowGroup {
            AppView()
                .environment(appState)
                .environment(settings)
                .environment(intentRouter)
                .onChange(of: intentRouter.handledIntent) { _, handled in
                    guard let handled else { return }
                    appState.handle(intent: handled)
                }
        }
    }
}

