import SwiftUI

/// Powers — what SlyOS can actually do right now, and what is stopping the rest.
///
/// This doubles as the health check. Every row is computed from live state, never from a hardcoded
/// list, because a capability screen that claims something the app can't do is exactly how Android
/// ended up telling its owner an invite had been sent that never was.
struct PowersPanel: View {
    @Environment(\.palette) private var p

    @State private var permissions = Permissions.shared
    @State private var router = ModelRouter.shared
    @State private var brainCount = 0
    @State private var googleConnected = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header

            ScrollView {
                VStack(alignment: .leading, spacing: T.lg) {
                    section("WORKING", powers.filter(\.ready))
                    section("NEEDS SETUP", powers.filter { !$0.ready })
                    unavailable
                }
                .padding(.bottom, T.lg)
            }
            .scrollIndicators(.hidden)
        }
        .padding(.horizontal, T.md)
        .task { refresh() }
    }

    // MARK: - State

    private struct Power: Identifiable {
        let id: String
        let title: String
        let detail: String
        let symbol: String
        let ready: Bool
        var fix: String?
    }

    private var powers: [Power] {
        let hasModel = router.isConfigured
        return [
            Power(id: "recall", title: "Remember everything",
                  detail: brainCount == 0
                      ? "Nothing imported yet"
                      : "\(brainCount.formatted()) memories, searchable instantly",
                  symbol: "cpu", ready: brainCount > 0,
                  fix: brainCount == 0 ? "Import contacts or calendar in Settings" : nil),

            Power(id: "answers", title: "Answer as you",
                  detail: hasModel
                      ? "Using \(router.configuredProviders.map(\.label).joined(separator: ", "))"
                      : "No AI provider connected",
                  symbol: "bubble.left.fill", ready: hasModel,
                  fix: hasModel ? nil : "Add a key in Settings — several are free"),

            Power(id: "look", title: "Read anything you point at",
                  detail: "Receipts, letters, whiteboards — read on-device",
                  symbol: "camera.fill",
                  ready: permissions.state(.camera) == .granted,
                  fix: "Allow the camera"),

            Power(id: "talk", title: "Talk instead of type",
                  detail: "On-device dictation",
                  symbol: "mic.fill",
                  ready: permissions.state(.microphone) == .granted
                      && permissions.state(.speech) == .granted,
                  fix: "Allow the microphone and speech"),

            Power(id: "agenda", title: "Know what's on",
                  detail: "Calendar and reminders in Now",
                  symbol: "calendar",
                  ready: permissions.state(.calendar) == .granted,
                  fix: "Allow calendar access"),

            Power(id: "people", title: "Know who people are",
                  detail: "Names, numbers and addresses",
                  symbol: "person.crop.circle.fill",
                  ready: permissions.state(.contacts) == .granted
                      || permissions.state(.contacts) == .limited,
                  fix: "Allow contacts"),

            Power(id: "place", title: "Know where you are",
                  detail: "Answers with local context, and sharing your location",
                  symbol: "location.fill",
                  ready: permissions.state(.location) == .granted,
                  fix: "Allow location while using the app"),

            Power(id: "google", title: "Calendar invites with Meet links",
                  detail: googleConnected
                      ? "Google connected"
                      : "Real invites, emailed to real people",
                  symbol: "video.fill", ready: googleConnected,
                  fix: "Connect Google in Settings")
        ]
    }

    // MARK: - Chrome

    private var header: some View {
        VStack(alignment: .leading, spacing: T.xs) {
            Heading("Powers")
            Text("\(powers.filter(\.ready).count) of \(powers.count) ready")
                .font(.system(size: T.body)).foregroundStyle(p.inkFaint)
        }
        .padding(.top, T.md)
    }

    @ViewBuilder
    private func section(_ label: String, _ list: [Power]) -> some View {
        if !list.isEmpty {
            VStack(alignment: .leading, spacing: T.sm) {
                Text(label)
                    .font(.system(size: T.small, weight: .bold)).tracking(2)
                    .foregroundStyle(p.inkFaint)

                ForEach(list) { power in
                    HStack(alignment: .top, spacing: T.md) {
                        Image(systemName: power.symbol)
                            .font(.system(size: 19))
                            .foregroundStyle(power.ready ? p.accent : p.inkFaint)
                            .frame(width: 24)

                        VStack(alignment: .leading, spacing: 2) {
                            Text(power.title)
                                .font(.system(size: T.body)).foregroundStyle(p.ink)
                            Text(power.ready ? power.detail : (power.fix ?? power.detail))
                                .font(.system(size: T.caption))
                                .foregroundStyle(power.ready ? p.inkFaint : p.danger)
                                .fixedSize(horizontal: false, vertical: true)
                        }

                        Spacer()

                        if power.ready {
                            Image(systemName: "checkmark.circle.fill")
                                .font(.system(size: 16)).foregroundStyle(p.good)
                        }
                    }
                    .padding(.vertical, T.xs)
                }
            }
            .padding(.top, T.lg)
        }
    }

    /// What iOS will never allow. Stated outright rather than quietly omitted — someone comparing
    /// the two apps deserves to know before they buy, not after.
    private var unavailable: some View {
        VStack(alignment: .leading, spacing: T.sm) {
            Text("NOT POSSIBLE ON IPHONE")
                .font(.system(size: T.small, weight: .bold)).tracking(2)
                .foregroundStyle(p.inkFaint)

            Text("Apple does not let any app read other apps' notifications, replace your home "
                 + "screen, or operate your phone for you. The Android version does those; this one "
                 + "cannot, and no permission unlocks them.")
                .font(.system(size: T.caption)).foregroundStyle(p.inkFaint)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.top, T.lg)
    }

    private func refresh() {
        permissions.refresh()
        brainCount = SlyStore.shared.count()
        googleConnected = GoogleAuth.shared.isConnected
    }
}
