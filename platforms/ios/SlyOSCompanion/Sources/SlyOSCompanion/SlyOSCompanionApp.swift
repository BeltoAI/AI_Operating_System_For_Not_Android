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
        AgentClient.agendaResolver = {
            let feed = await NowFeed()
            await feed.load()
            let items = await feed.items

            // Never return nil or empty. An empty agenda block means no block at all, and the model
            // then answers a calendar question from general knowledge — "I don't have access to your
            // calendar" — while sitting on a granted permission and a connected Google account. An
            // empty calendar and an unreachable one are different answers and have different fixes,
            // so the block says which.
            guard items.isEmpty else {
                return items.prefix(15)
                    .map { "· \($0.title) — \($0.detail)" }
                    .joined(separator: "\n")
            }
            if let blocked = await feed.blocked { return "CANNOT BE READ: \(blocked)" }
            if await !GoogleAuth.shared.isConnected {
                return "Nothing on the phone's own calendar for the next two days. Google is NOT "
                    + "connected, so any Google Calendar events are invisible — say so, and say "
                    + "they can connect it in Settings."
            }
            return "Nothing on for the next two days — the calendar was read and it is genuinely empty."
        }
        // Same reason: ModelRouter is shared with the extension, which carries no gateway client.
        ModelRouter.openClaw = (baseURL: { OpenClaw.shared.baseURL },
                                token: { OpenClaw.shared.token })
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
                .task {
                    // Publish what is switched on, so the keyboard and share extension — which
                    // cannot reach GoogleAuth or EventKit at all — still describe this phone's real
                    // capabilities rather than a guess.
                    BrainContext.Live(
                        googleConnected: GoogleAuth.shared.isConnected,
                        calendarGranted: Permissions.shared.state(.calendar) == .granted,
                        remindersGranted: Permissions.shared.state(.reminders) == .granted,
                        contactsGranted: Permissions.shared.state(.contacts) == .granted,
                        locationGranted: Permissions.shared.state(.location) == .granted,
                        openClawReady: OpenClaw.shared.isConfigured
                    ).publish()

                    // Distil what has been imported into things the brain knows. On the foreground
                    // rather than in a background task: iOS grants background time on its own
                    // schedule and often not at all, and a nightly job that never runs is worse
                    // than no job — it looks like the feature works.
                    await Distiller.runIfDue()
                    // Embeddings for anything imported since last time, on a time budget.
                    await EmbedWorker.shared.run()
                }
        }
    }
}

