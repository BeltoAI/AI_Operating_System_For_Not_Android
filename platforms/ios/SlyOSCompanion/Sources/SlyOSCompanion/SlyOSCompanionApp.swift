import SwiftUI

@main
struct SlyOSCompanionApp: App {
    @State private var appState = AppState()
    @State private var settings = SlySettings.shared
    @State private var intentRouter = AppIntentRouter.shared

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

