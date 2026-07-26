import SwiftUI

/// Settings. Everything here is wired to something real and persists across launches.
struct SettingsPanel: View {
    @Environment(SlySettings.self) private var settings
    @Environment(\.dismiss) private var dismiss

    private var router: ModelRouter { ModelRouter.shared }

    @State private var brainCount = 0
    @State private var sources: [(String, Int)] = []

    var body: some View {
        @Bindable var settings = settings
        let p = Palette(dark: settings.dark)

        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: T.lg) {

                    group("ACCOUNT", p: p) { AccountSection(palette: p) }

                    group("APPEARANCE", p: p) {
                        Toggle(isOn: $settings.dark) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Dark mode")
                                    .font(.system(size: T.body)).foregroundStyle(p.ink)
                                Text("SlyOS remembers this itself rather than following iOS, so "
                                     + "your phones look the same.")
                                    .font(.system(size: T.caption)).foregroundStyle(p.inkFaint)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                        }
                        .tint(p.accent)
                    }

                    group("YOU", p: p) {
                        VStack(alignment: .leading, spacing: T.xs) {
                            Text("Name").font(.system(size: T.body)).foregroundStyle(p.ink)
                            TextField("", text: $settings.name, prompt:
                                Text("what should it call you?").foregroundStyle(p.inkFaint))
                                .font(.system(size: T.body))
                                .foregroundStyle(p.ink)
                                .textFieldStyle(.plain)
                            Rectangle().fill(p.hairline).frame(height: 1)
                        }
                    }

                    group("CHARACTER", p: p) {
                        VStack(alignment: .leading, spacing: T.sm) {
                            Text("What should SlyOS know about you? Tone, work, people who matter — "
                                 + "anything that makes its answers sound like you.")
                                .font(.system(size: T.caption)).foregroundStyle(p.inkFaint)
                                .fixedSize(horizontal: false, vertical: true)
                            CharacterEditor(palette: p)
                        }
                    }

                    group("ABOUT YOU", p: p) {
                        VStack(alignment: .leading, spacing: T.sm) {
                            Text("All optional. Everything here feeds your brain, so SlyOS knows who "
                                 + "it is speaking for.")
                                .font(.system(size: T.caption)).foregroundStyle(p.inkFaint)
                                .fixedSize(horizontal: false, vertical: true)
                            ForEach(SlyProfile.personalFields, id: \.key) { f in
                                ProfileFieldRow(key: f.key, label: f.label, palette: p)
                            }
                        }
                    }

                    group("CONTACT DETAILS", p: p) {
                        VStack(alignment: .leading, spacing: T.sm) {
                            Text("Used verbatim in signatures, letterheads and forms — so a document "
                                 + "SlyOS writes for you carries your real details, not a guess.")
                                .font(.system(size: T.caption)).foregroundStyle(p.inkFaint)
                                .fixedSize(horizontal: false, vertical: true)
                            ForEach(SlyProfile.contactFields, id: \.key) { f in
                                ProfileFieldRow(key: f.key, label: f.label, palette: p)
                            }
                        }
                    }

                    group("VOICE", p: p) {
                        Toggle(isOn: $settings.voiceOnHold) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Hold the brain to talk")
                                    .font(.system(size: T.body)).foregroundStyle(p.ink)
                                Text("Press and hold the centre button for three seconds.")
                                    .font(.system(size: T.caption)).foregroundStyle(p.inkFaint)
                            }
                        }
                        .tint(p.accent)
                    }

                    group("INTELLIGENCE", p: p) {
                        VStack(alignment: .leading, spacing: T.sm) {
                            Text(router.isConfigured
                                 ? "SlyOS will use the best of these you've set up, and fall back to the next if one fails."
                                 : "SlyOS can't answer anything until one of these has a key. Groq, Gemini, Cerebras and Mistral all have free tiers.")
                                .font(.system(size: T.caption)).foregroundStyle(p.inkFaint)
                                .fixedSize(horizontal: false, vertical: true)

                            ForEach(ModelRouter.Provider.allCases.sorted { $0.isFree && !$1.isFree }) { provider in
                                KeyCard(provider: provider, palette: p)
                            }
                        }
                    }

                    group("IMPORT", p: p) {
                        VStack(alignment: .leading, spacing: 0) {
                            Text("Everything imported stays on this phone.")
                                .font(.system(size: T.caption)).foregroundStyle(p.inkFaint)
                            ForEach(Importers.Source.allCases) { source in
                                ImportRow(source: source, palette: p)
                            }
                        }
                    }

                    group("BRAIN", p: p) {
                        VStack(alignment: .leading, spacing: T.sm) {
                            HStack {
                                Text("Stored").font(.system(size: T.body)).foregroundStyle(p.ink)
                                Spacer()
                                Text(brainCount.formatted())
                                    .font(.system(size: T.body)).foregroundStyle(p.accent)
                            }
                            ForEach(sources, id: \.0) { name, n in
                                HStack {
                                    Text(name)
                                        .font(.system(size: T.small)).foregroundStyle(p.inkSoft)
                                    Spacer()
                                    Text(n.formatted())
                                        .font(.system(size: T.small)).foregroundStyle(p.inkFaint)
                                }
                            }
                            if sources.isEmpty {
                                Text("Nothing imported yet.")
                                    .font(.system(size: T.small)).foregroundStyle(p.inkFaint)
                            }
                        }
                    }
                }
                .padding(T.md)
            }
            .background(p.bg.ignoresSafeArea())
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }.tint(p.accent)
                }
            }
        }
        .environment(\.palette, p)
        .preferredColorScheme(settings.dark ? .dark : .light)
        .task {
            brainCount = SlyStore.shared.count()
            sources = SlyStore.shared.countsBySource()
        }
    }

    @ViewBuilder
    private func group<Content: View>(_ label: String, p: Palette,
                                      @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: T.sm) {
            Text(label)
                .font(.system(size: T.small, weight: .bold))
                .tracking(2)
                .foregroundStyle(p.inkFaint)
            content()
        }
    }
}

/// One profile field. Each owns its editing state, so typing in one does not rebuild the others.
private struct ProfileFieldRow: View {
    let key: String
    let label: String
    let palette: Palette

    @State private var value = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label).font(.system(size: T.caption)).foregroundStyle(palette.inkFaint)
            TextField("", text: $value, prompt:
                Text("—").foregroundStyle(palette.inkFaint))
                .font(.system(size: T.body))
                .foregroundStyle(palette.ink)
                .textFieldStyle(.plain)
                // Written on every change rather than only on Return: tapping straight from one
                // field to the next would otherwise discard what was just typed.
                .onChange(of: value) { _, new in SlyProfile.shared.setValue(new, for: key) }
            Rectangle().fill(palette.hairline).frame(height: 1)
        }
        .padding(.vertical, 2)
        .onAppear { value = SlyProfile.shared.value(key) }
    }
}

/// The free-text character block.
private struct CharacterEditor: View {
    let palette: Palette
    @State private var text = ""

    var body: some View {
        TextEditor(text: $text)
            .font(.system(size: T.body))
            .foregroundStyle(palette.ink)
            .scrollContentBackground(.hidden)
            .frame(minHeight: 140)
            .padding(T.sm)
            .background(RoundedRectangle(cornerRadius: 14).fill(palette.bgElevated))
            .onChange(of: text) { _, new in SlyProfile.shared.character = new }
            .onAppear { text = SlyProfile.shared.character }
    }
}


/// Sign up, sign in, and sync. Matches the cross-client contract in ACCOUNT_AND_SYNC.md, so the
/// same account carries the same brain between this app and the Android one.
private struct AccountSection: View {
    let palette: Palette

    @State private var supabase = SupabaseClient.shared
    @State private var email = ""
    @State private var password = ""
    @State private var busy = false
    @State private var message: String?
    @State private var isError = false

    var body: some View {
        VStack(alignment: .leading, spacing: T.sm) {
            if !supabase.isConfigured {
                Text("Accounts aren't set up in this build. Add SupabaseURL and SupabaseAnonKey to "
                     + "the project's Info.plist keys.")
                    .font(.system(size: T.caption)).foregroundStyle(palette.inkFaint)
                    .fixedSize(horizontal: false, vertical: true)
            } else if supabase.isSignedIn {
                signedIn
            } else {
                signedOut
            }

            if let message {
                Text(message)
                    .font(.system(size: T.caption))
                    .foregroundStyle(isError ? palette.danger : palette.good)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private var signedIn: some View {
        VStack(alignment: .leading, spacing: T.sm) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(supabase.email ?? "Signed in")
                        .font(.system(size: T.body)).foregroundStyle(palette.ink)
                    Text(syncLine)
                        .font(.system(size: T.caption)).foregroundStyle(palette.inkFaint)
                }
                Spacer()
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 16)).foregroundStyle(palette.good)
            }

            HStack(spacing: T.sm) {
                Button {
                    Task { await supabase.sync() }
                } label: {
                    Text(supabase.syncing ? "Syncing…" : "Back up now")
                        .font(.system(size: T.small, weight: .medium))
                        .foregroundStyle(palette.ink)
                        .padding(.horizontal, T.md).padding(.vertical, 9)
                        .background(Capsule().fill(palette.accent))
                }
                .disabled(supabase.syncing)

                Button("Sign out") { supabase.signOut() }
                    .font(.system(size: T.small))
                    .foregroundStyle(palette.inkFaint)
                Spacer()
            }
        }
    }

    private var syncLine: String {
        if let error = supabase.lastError { return error }
        guard let last = supabase.lastSync else { return "Not backed up yet" }
        return "Backed up \(last.formatted(.relative(presentation: .named)))"
    }

    private var signedOut: some View {
        VStack(alignment: .leading, spacing: T.sm) {
            Text("An account backs your brain up and carries it to your other devices. Same account "
                 + "as the Android app.")
                .font(.system(size: T.caption)).foregroundStyle(palette.inkFaint)
                .fixedSize(horizontal: false, vertical: true)

            field("Email", text: $email, secure: false)
            field("Password", text: $password, secure: true)

            HStack(spacing: T.sm) {
                Button { run(signingUp: false) } label: {
                    Text("Sign in")
                        .font(.system(size: T.small, weight: .medium))
                        .foregroundStyle(palette.ink)
                        .padding(.horizontal, T.md).padding(.vertical, 9)
                        .background(Capsule().fill(palette.accent))
                }
                Button { run(signingUp: true) } label: {
                    Text("Create account")
                        .font(.system(size: T.small))
                        .foregroundStyle(palette.ink)
                        .padding(.horizontal, T.md).padding(.vertical, 9)
                        .background(Capsule().fill(palette.accent.opacity(0.22)))
                }
                Spacer()
            }
            .disabled(busy || email.isEmpty || password.isEmpty)
        }
    }

    private func field(_ label: String, text: Binding<String>, secure: Bool) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label).font(.system(size: T.caption)).foregroundStyle(palette.inkFaint)
            Group {
                if secure { SecureField("", text: text) } else { TextField("", text: text) }
            }
            .font(.system(size: T.body))
            .foregroundStyle(palette.ink)
            .textFieldStyle(.plain)
            .autocorrectionDisabled()
            .textInputAutocapitalization(.never)
            .keyboardType(secure ? .default : .emailAddress)
            Rectangle().fill(palette.hairline).frame(height: 1)
        }
    }

    private func run(signingUp: Bool) {
        busy = true; message = nil
        Task {
            do {
                if signingUp {
                    try await SupabaseClient.shared.signUp(email: email, password: password)
                } else {
                    try await SupabaseClient.shared.signIn(email: email, password: password)
                }
                password = ""
                isError = false
                message = signingUp ? "Account created." : nil
                // First sign-in on a device should pull the brain down without being asked.
                await SupabaseClient.shared.sync()
            } catch {
                isError = true
                message = error.localizedDescription
            }
            busy = false
        }
    }
}
