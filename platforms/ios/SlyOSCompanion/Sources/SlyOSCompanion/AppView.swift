import SwiftUI
import PhotosUI

/// The SlyOS shell: a full-bleed panel with the persistent bottom bar underneath.
///
/// Deliberately not a `TabView`. UIKit's tab bar imposes its own translucent chrome, its own
/// label-under-icon layout and the system tint — none of which the Android app has. The Compose
/// shell is a column (content, hairline, nav row), so this is one too.
struct AppView: View {
    @Environment(AppState.self) private var appState
    @Environment(SlySettings.self) private var settings

    var body: some View {
        @Bindable var appState = appState
        let p = Palette(dark: settings.dark)

        VStack(spacing: 0) {
            Group {
                switch appState.selectedTab {
                case .home:     HomePanel()
                case .now:      NowPanel()
                case .brain:    BrainPanel()
                case .research: ResearchPanel()
                case .powers:   PowersPanel()
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)

            // No divider above the bar: on Android the nav sits straight on the background, and a
            // hairline here was the single biggest reason the iOS bottom bar read as a separate
            // chrome strip rather than part of the screen.
            SlyBottomNav(current: appState.selectedTab, nowCount: appState.nowCount) { panel in
                appState.selectedTab = panel
            }
            .padding(.top, T.sm)
            // Measured off the Samsung: its first icon centre sits ~12% in, not the ~6.5% that the
            // bare 6pt row padding gives on a wider iPhone.
            .padding(.horizontal, T.md)
        }
        .background(p.bg.ignoresSafeArea())
        .environment(\.palette, p)
        // Android drives dark mode from its own store rather than the OS, so the two devices agree.
        .preferredColorScheme(settings.dark ? .dark : .light)
        // SwiftUI ignores the UIStatusBarHidden Info.plist key — the scene's hosting controller
        // answers for the status bar, and only this modifier reaches it. Without it the iOS clock
        // sits above SlyOS's own status line and the time appears twice.
        .statusBarHidden(true)
        // First run: the wizard, not an empty Home screen that can't answer anything yet.
        .sheet(isPresented: .constant(!settings.hasOnboarded)) { SetupWizard() }
    }
}

/// Home — the greeting is the hero. Matches the Compose Home panel: a status line at the top, then
/// a block of greeting, accent rule, prompt field and the talk affordance sitting above centre.
struct HomePanel: View {
    @Environment(AppState.self) private var appState
    @Environment(SlySettings.self) private var settings
    @Environment(\.palette) private var p
    @State private var prompt = ""
    @State private var answer = ""
    @State private var thinking = false
    @State private var failure: String?
    @State private var voice = VoiceInput.shared
    @State private var showScanner = false
    @State private var showPhotoPicker = false
    @State private var pickedPhoto: PhotosPickerItem?
    @FocusState private var promptFocused: Bool

    var body: some View {
        VStack(spacing: 0) {
            statusLine
            // 2:3 split. Measured off the Samsung: the greeting sits ~39% down the screen, so the
            // block needs more room above it than a single spacer against two gives.
            Spacer(); Spacer()
            greeting
            promptRow
            if thinking || !answer.isEmpty || failure != nil { answerBlock } else { talkAffordance }
            Spacer(); Spacer(); Spacer()
        }
        .padding(.horizontal, T.md)
        .onChange(of: voice.transcript) { _, heard in
            if voice.isListening { prompt = heard }
        }
        .sheet(isPresented: $showScanner) {
            DocumentScanner { pages in
                Task { await readPages(pages) }
            }
            .ignoresSafeArea()
        }
        .photosPicker(isPresented: $showPhotoPicker, selection: $pickedPhoto, matching: .images)
        .onChange(of: pickedPhoto) { _, item in
            guard let item else { return }
            Task {
                if let data = try? await item.loadTransferable(type: Data.self),
                   let image = UIImage(data: data) {
                    await readPages([image])
                }
                pickedPhoto = nil
            }
        }
    }

    /// Read scanned or picked images into the brain, then say what was found.
    private func readPages(_ pages: [UIImage]) async {
        guard !pages.isEmpty else { return }
        thinking = true; failure = nil; answer = ""
        var total = 0
        for page in pages {
            let read = await LookMode.capture(page)
            if !read.isEmpty { total += 1 }
        }
        thinking = false
        answer = total == 0
            ? "I couldn't read any text in that."
            : "Read \(total) \(total == 1 ? "page" : "pages") into memory. Ask me about it."
    }

    private var statusLine: some View {
        HStack {
            Text(appState.statusLeft)
            Spacer()
            Text(appState.statusRight)
        }
        .font(.system(size: T.body))
        .foregroundStyle(p.inkSoft)
        .padding(.top, T.sm)
    }

    private var greeting: some View {
        VStack(alignment: .leading, spacing: T.sm) {
            Text("what should happen, \(settings.greetingName)?")
                .font(.system(size: T.prompt))
                .foregroundStyle(p.ink)
                .fixedSize(horizontal: false, vertical: true)

            // The short accent rule under the greeting.
            Rectangle().fill(p.accent).frame(width: 96, height: 3)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var promptRow: some View {
        // Tight spacing and an explicit layout priority: with default priority SwiftUI shrinks the
        // text field before the fixed-width icons and the Send pill, truncating the placeholder to
        // "ask me an…". The field is the point of the screen, so it wins the space.
        HStack(spacing: T.sm) {
            VStack(spacing: T.xs) {
                TextField("", text: $prompt, prompt:
                    Text("ask me anything…").foregroundStyle(p.inkFaint))
                    .font(.system(size: T.prompt - 4))
                    .foregroundStyle(p.ink)
                    .textFieldStyle(.plain)
                    .focused($promptFocused)
                    .submitLabel(.send)
                    .onSubmit(send)
                Rectangle().fill(p.hairline).frame(height: 1)
            }
            .layoutPriority(1)

            Button { showPhotoPicker = true } label: {
                Image(systemName: "paperclip").font(.system(size: 22)).foregroundStyle(p.inkSoft)
            }
            .accessibilityLabel("Read a photo")

            Button { showScanner = true } label: {
                Image(systemName: "camera.fill").font(.system(size: 22)).foregroundStyle(p.inkSoft)
            }
            .accessibilityLabel("Look with the camera")

            Button(action: send) {
                Text("Send")
                    .font(.system(size: T.body))
                    .foregroundStyle(canSend ? p.ink : p.inkFaint)
                    .fixedSize()                       // never let the greedy field crush it
                    .padding(.horizontal, T.md).padding(.vertical, 10)
                    .background(Capsule().fill(canSend ? p.accent.opacity(0.22)
                                                       : p.bgElevated.opacity(0.5)))
            }
            .disabled(!canSend)
            .fixedSize()
        }
        .padding(.top, T.sm)
    }

    private var talkAffordance: some View {
        VStack(spacing: T.sm) {
            // The dot pulses while listening, so there is never any doubt the mic is live.
            OrangeDot()
                .scaleEffect(voice.isListening ? 1.9 : 1.0)
                .animation(voice.isListening
                           ? .easeInOut(duration: 0.7).repeatForever(autoreverses: true)
                           : .default,
                           value: voice.isListening)
            Text(voice.error ?? (voice.isListening ? "listening — tap to stop" : "tap to talk"))
                .font(.system(size: T.body))
                .foregroundStyle(voice.error == nil ? p.inkSoft : p.danger)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, T.lg)
        .contentShape(Rectangle())
        .onTapGesture { toggleVoice() }
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isButton)
        .accessibilityLabel(voice.isListening ? "Stop listening" : "Tap to talk")
    }

    /// Start or stop dictation. Stopping sends what was heard, so speaking is a complete path from
    /// question to answer without ever touching the keyboard.
    private func toggleVoice() {
        Task {
            if voice.isListening {
                voice.stop()
                let heard = voice.transcript.trimmingCharacters(in: .whitespacesAndNewlines)
                if !heard.isEmpty { prompt = heard; send() }
            } else {
                await voice.start()
            }
        }
    }

    /// The reply, in place of the talk affordance. Scrolls rather than pushing the prompt off the
    /// screen, because a long answer must not move the thing you type into.
    private var answerBlock: some View {
        VStack(alignment: .leading, spacing: T.sm) {
            if thinking {
                SlyWaiting("thinking")
            } else if let failure {
                Text(failure)
                    .font(.system(size: T.body)).foregroundStyle(p.danger)
                    .fixedSize(horizontal: false, vertical: true)
            } else {
                ScrollView {
                    AnswerView(text: answer)
                }
                .frame(maxHeight: 340)
                .scrollIndicators(.hidden)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.top, T.lg)
    }

    private var canSend: Bool {
        !prompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private func send() {
        guard canSend else { return }
        let asked = prompt

        // Everything you tell SlyOS is kept. That is the whole premise, so it happens here rather
        // than only when a model round-trip succeeds.
        appState.remember(title: "", body: asked, source: "Home")
        prompt = ""
        promptFocused = false
        answer = ""; failure = nil; thinking = true

        Task {
            do {
                // Off the main actor: the network call is the whole reason the Android Memory tab
                // used to fail with "-1 couldn't search".
                let reply = try await AgentClient.ask(asked)
                answer = reply
                thinking = false
                // Keep the answer too, so the brain remembers what it told you.
                appState.remember(title: asked, body: reply, source: "SlyOS")
            } catch {
                failure = error.localizedDescription
                thinking = false
            }
        }
    }
}
