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
