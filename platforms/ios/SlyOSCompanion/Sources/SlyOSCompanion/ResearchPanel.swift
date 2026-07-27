import SwiftUI

/// Research — a library of papers, matching Compose `ResearchScreen`.
///
/// Not a chat box. The shape is: a mode row, a search field over what you have already written, and
/// the papers themselves. A paper is something you keep and come back to, which is why search sits
/// above the list rather than below a prompt.
struct ResearchPanel: View {
    @Environment(\.palette) private var p

    enum Mode: String, CaseIterable, Identifiable {
        case newPaper = "New paper"
        case chat = "Chat"

        var id: String { rawValue }

    }

    @State private var mode: Mode = .newPaper
    @State private var search = ""
    @State private var papers: [Memory] = []

    // New paper
    @State private var topic = ""
    @State private var finding = ""
    @State private var working = false
    @State private var failure: String?
    @State private var openPaper: Memory?
    @State private var composing = false
    @FocusState private var focused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header
            modeRow
            searchField

            Group {
                switch mode {
                case .newPaper: newPaperBody
                case .chat: ChatMode(palette: p)
                }
            }

            Spacer(minLength: 0)
        }
        .padding(.horizontal, T.md)
        .task { reload() }
        .sheet(item: $openPaper) { paper in PaperView(paper: paper) }
        .sheet(isPresented: $composing) {
            ComposePaper(palette: p) { subject in
                composing = false
                topic = subject
                write()
            }
        }
    }

    // MARK: - Chrome

    private var header: some View {
        VStack(alignment: .leading, spacing: T.xs) {
            Heading("Research")
            Text(subtitle)
                .font(.system(size: T.body)).foregroundStyle(p.inkFaint)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.top, T.md)
    }

    /// Names the model actually doing the work, as Android does — the reason a paper takes a minute
    /// is that it is running the heavy model, and saying so is better than an unexplained wait.
    private var subtitle: String {
        guard let provider = ModelRouter.shared.chain(tier: .heavy).first else {
            return "No model connected — add a key in Settings"
        }
        return "\(provider.label) · \(provider.model(for: .heavy))"
    }

    /// Four equal-width pills filling the row — Compose gives each `weight(1f)`, so they are never
    /// scrollable and never different sizes. Active is dark text on accent; inactive is ink on
    /// hairline, which is flatter than the elevated surface and keeps the active one dominant.
    private var modeRow: some View {
        HStack(spacing: 8) {
            ForEach(Mode.allCases) { m in
                let on = mode == m
                Button {
                    if m == .newPaper { composing = true } else { mode = m }
                } label: {
                    Text(m.rawValue)
                        .font(.system(size: T.small))
                        .foregroundStyle(on ? p.bgElevated : p.ink)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 10)
                        .background(Capsule().fill(on ? p.accent : p.hairline))
                }
            }
        }
        .padding(.top, T.md)
    }

    private var searchField: some View {
        TextField("", text: $search, prompt:
            Text("Search papers…").foregroundStyle(p.inkFaint))
            .font(.system(size: T.small))
            .foregroundStyle(p.ink)
            .textFieldStyle(.plain)
            .padding(.horizontal, 12).padding(.vertical, 10)
            .background(RoundedRectangle(cornerRadius: 10).fill(p.bgElevated))
            .padding(.top, 12)
            .onChange(of: search) { _, _ in reload() }
    }

    // MARK: - New paper

    @ViewBuilder
    private var newPaperBody: some View {
        if working {
            VStack { Spacer(); SlyWaiting("writing your paper", orbit: 34); Spacer() }
                .frame(maxWidth: .infinity)
        } else if let failure {
            Text(failure).font(.system(size: T.body)).foregroundStyle(p.danger)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, T.lg)
        } else if !finding.isEmpty {
            VStack(alignment: .leading, spacing: T.sm) {
                SectionHeader("PAPER").padding(.top, T.lg)
                ScrollView { AnswerView(text: finding) }.scrollIndicators(.hidden)
            }
        } else {
            VStack(alignment: .leading, spacing: 12) {
                if papers.isEmpty {
                    Text(search.isEmpty
                         ? "No papers yet. Tap New paper to write one."
                         : "No papers match “\(search)”.")
                        .font(.system(size: T.small)).foregroundStyle(p.inkFaint)
                } else {
                    paperList
                }
            }
            .padding(.top, 12)
        }
    }

    private var paperList: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 10) {
                ForEach(papers) { paper in
                    SlyCard(onOpen: { openPaper = paper },
                            onClose: { delete(paper) }) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(paper.title.isEmpty ? "Untitled paper" : paper.title)
                                .font(.system(size: T.body)).foregroundStyle(p.ink)
                                .lineLimit(2)
                            Text(paper.date.formatted(.dateTime.day().month(.abbreviated)))
                                .font(.system(size: T.caption)).foregroundStyle(p.accent)
                            Text(paper.body)
                                .font(.system(size: T.small)).foregroundStyle(p.inkSoft)
                                .lineLimit(3)
                        }
                        .padding(14)
                    }
                    .onTapGesture { openPaper = paper }
                }
            }
            .padding(.bottom, T.md)
        }
        .scrollIndicators(.hidden)
    }

    // MARK: - Work

    private func reload() {
        let all = SlyStore.shared.search("paper research", limit: 60)
            .filter { $0.kind == "paper" }
        papers = search.isEmpty
            ? all
            : all.filter {
                $0.title.localizedCaseInsensitiveContains(search)
                    || $0.body.localizedCaseInsensitiveContains(search)
            }
    }

    private func delete(_ paper: Memory) {
        SlyStore.shared.delete(id: paper.id)
        withAnimation { papers.removeAll { $0.id == paper.id } }
    }

    private func write() {
        let q = topic.trimmingCharacters(in: .whitespaces)
        guard !q.isEmpty else { return }
        working = true; failure = nil; finding = ""; focused = false

        Task {
            do {
                let context = await AgentClient.corpus(for: q)
                let system = """
                    You are SlyOS writing a paper for its owner. Go deeper than a chat reply: lay out \
                    what is actually true, what follows from it, and what the owner should do. Use \
                    headings and short paragraphs. Be concrete and specific. No preamble, no \
                    restating the question.

                    Where the owner's own memories are given below, they are fact — use them and \
                    refer to people by name. Where you are reasoning beyond them, say so plainly \
                    rather than presenting a guess as a finding.
                    """
                let user = context.isEmpty ? q : "WHAT YOU KNOW:\n\(context)\n\nWRITE ABOUT: \(q)"

                // Heavy tier: a paper is the one place a slower, better answer is the point.
                let result = try await AgentClient.complete(system: system, user: user, tier: .heavy)
                finding = result
                SlyStore.shared.insert(kind: "paper", title: q, body: result, source: "Research")
                topic = ""
                reload()
            } catch {
                failure = error.localizedDescription
            }
            working = false
        }
    }
}

/// A saved paper, full screen.
private struct PaperView: View {
    let paper: Memory
    @Environment(\.dismiss) private var dismiss
    @Environment(SlySettings.self) private var settings

    @State private var publishing = false
    @State private var note: String?
    @State private var isError = false
    @State private var confirming = false

    var body: some View {
        let p = Palette(dark: settings.dark)
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: T.md) {
                    Text(paper.title).font(.system(size: 26)).foregroundStyle(p.ink)
                    Text(paper.date.formatted(date: .abbreviated, time: .shortened))
                        .font(.system(size: T.caption)).foregroundStyle(p.inkFaint)
                    AnswerView(text: paper.body, showHero: false)

                    Divider().overlay(p.hairline).padding(.vertical, T.sm)

                    if publishing {
                        SlyWaiting("publishing to Zenodo")
                    } else if let note {
                        Text(note)
                            .font(.system(size: T.small))
                            .foregroundStyle(isError ? p.danger : p.good)
                            .fixedSize(horizontal: false, vertical: true)
                            .textSelection(.enabled)
                    }

                    if Zenodo.shared.isConfigured {
                        Button { confirming = true } label: {
                            Text("Publish to Zenodo")
                                .font(.system(size: T.small, weight: .medium))
                                .foregroundStyle(p.bgElevated)
                                .padding(.horizontal, T.lg).padding(.vertical, 11)
                                .background(Capsule().fill(p.accent))
                        }
                        .disabled(publishing)
                    } else {
                        Text("Add a Zenodo token in Settings to publish this with a real DOI.")
                            .font(.system(size: T.caption)).foregroundStyle(p.inkFaint)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .padding(T.md)
            }
            .alert("Publish this paper?", isPresented: $confirming) {
                Button("Cancel", role: .cancel) {}
                Button("Publish") { send() }
            } message: {
                Text("It gets a permanent DOI on zenodo.org under CC-BY. Publishing can't be undone.")
            }
            .background(p.bg.ignoresSafeArea())
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }.tint(p.accent)
                }
            }
        }
        .environment(\.palette, p)
        .preferredColorScheme(settings.dark ? .dark : .light)
    }

    private func send() {
        publishing = true; note = nil
        Task {
            do {
                let out = try await Zenodo.shared.publish(
                    title: paper.title,
                    body: paper.body,
                    author: SlyProfile.shared.value("full_name").isEmpty
                        ? SlySettings.shared.name : SlyProfile.shared.value("full_name"),
                    affiliation: SlyProfile.shared.value("occupation"),
                    publish: true)
                isError = false
                note = "Published — DOI \(out.doi)\n\(out.url)"
                Outbox.shared.record(what: "Published a paper",
                                     detail: "\(paper.title) — \(out.url)", outcome: "sent")
            } catch {
                isError = true
                note = error.localizedDescription
                Outbox.shared.record(what: "Publish failed",
                                     detail: error.localizedDescription, outcome: "failed")
            }
            publishing = false
        }
    }
}

/// Chat — a running conversation with the brain, kept in memory like everything else.
/// Chat — separate conversations that persist, mirroring the Android Chat screen.
///
/// It was one ephemeral list of turns held in `@State`: switching tabs lost the conversation, every
/// question reached the model with no memory of the one before it, and there was no way to keep two
/// subjects apart. All three are the same missing piece — somewhere to put a conversation.
private struct ChatMode: View {
    let palette: Palette

    @State private var store = ChatStore.shared
    @State private var input = ""
    @State private var working = false
    /// nil = the list of conversations; otherwise the one being read.
    @State private var openThread: Int64?
    @State private var renaming: Int64?
    @State private var newTitle = ""
    @FocusState private var focused: Bool

    var body: some View {
        Group {
            if let id = openThread, let thread = store.threads.first(where: { $0.id == id }) {
                conversation(thread)
            } else {
                library
            }
        }
        .padding(.top, T.md)
        .alert("Rename", isPresented: Binding(get: { renaming != nil },
                                              set: { if !$0 { renaming = nil } })) {
            TextField("Title", text: $newTitle)
            Button("Save") { if let id = renaming { store.rename(id, to: newTitle) }; renaming = nil }
            Button("Cancel", role: .cancel) { renaming = nil }
        }
    }

    // MARK: - The list

    private var library: some View {
        VStack(alignment: .leading, spacing: T.md) {
            Button {
                store.newThread()
                openThread = store.currentID
            } label: {
                Text("New chat")
                    .font(.system(size: T.small)).foregroundStyle(palette.bgElevated)
                    .frame(maxWidth: .infinity).padding(.vertical, 10)
                    .background(Capsule().fill(palette.accent))
            }

            if store.threads.isEmpty {
                Text("No conversations yet. A chat here keeps its own thread — Home stays one "
                     + "continuous conversation, these stay apart.")
                    .font(.system(size: T.body)).foregroundStyle(palette.inkFaint)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, T.sm)
                Spacer()
            } else {
                ScrollView {
                    LazyVStack(spacing: 0) {
                        ForEach(store.threads) { thread in
                            Button { openThread = thread.id; store.currentID = thread.id } label: {
                                row(thread)
                            }
                            Rectangle().fill(palette.hairline).frame(height: 1)
                        }
                    }
                }
                .scrollIndicators(.hidden)
            }
        }
    }

    private func row(_ thread: ChatStore.Thread) -> some View {
        HStack(spacing: T.sm) {
            VStack(alignment: .leading, spacing: 2) {
                Text(thread.displayTitle)
                    .font(.system(size: T.body)).foregroundStyle(palette.ink)
                    .lineLimit(1)
                Text("\(thread.turns.count) message\(thread.turns.count == 1 ? "" : "s") · "
                     + thread.updated.formatted(date: .abbreviated, time: .shortened))
                    .font(.system(size: T.small)).foregroundStyle(palette.inkFaint)
            }
            Spacer()
            Menu {
                Button("Rename") { newTitle = thread.title; renaming = thread.id }
                Button("Delete", role: .destructive) { store.delete(thread.id) }
            } label: {
                Image(systemName: "ellipsis").foregroundStyle(palette.inkSoft)
                    .frame(width: 32, height: 32)
            }
        }
        .padding(.vertical, T.sm)
        .contentShape(Rectangle())
    }

    // MARK: - One conversation

    private func conversation(_ thread: ChatStore.Thread) -> some View {
        VStack(alignment: .leading, spacing: T.sm) {
            HStack {
                Button { openThread = nil } label: {
                    Label(thread.displayTitle, systemImage: "chevron.left")
                        .font(.system(size: T.body)).foregroundStyle(palette.inkSoft)
                        .lineLimit(1)
                }
                Spacer()
            }

            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: T.md) {
                        ForEach(thread.turns) { turn in
                            if turn.role == "user" {
                                Text(turn.text)
                                    .font(.system(size: T.body)).foregroundStyle(palette.inkSoft)
                                    .frame(maxWidth: .infinity, alignment: .trailing)
                                    .id(turn.id)
                            } else {
                                AnswerView(text: turn.text).id(turn.id)
                            }
                        }
                        if working { SlyWaiting("thinking").id("waiting") }
                    }
                    .padding(.vertical, T.md)
                }
                .scrollIndicators(.hidden)
                // Follow the conversation down as it grows, rather than leaving the newest reply
                // below the fold where it reads as nothing having happened.
                .onChange(of: thread.turns.count) { _, _ in
                    withAnimation { proxy.scrollTo(thread.turns.last?.id, anchor: .bottom) }
                }
            }

            composer
        }
    }

    private var composer: some View {
        HStack(spacing: T.sm) {
            TextField("", text: $input, prompt:
                Text("say something").foregroundStyle(palette.inkFaint))
                .font(.system(size: T.body)).foregroundStyle(palette.ink)
                .textFieldStyle(.plain)
                .focused($focused)
                .submitLabel(.send)
                .onSubmit(send)
                .padding(.horizontal, T.md).padding(.vertical, 12)
                .background(RoundedRectangle(cornerRadius: 12).fill(palette.bgElevated.opacity(0.6)))
            Button(action: send) {
                Text("Send").font(.system(size: T.body)).foregroundStyle(.white)
                    .padding(.horizontal, T.lg).padding(.vertical, 12)
                    .background(Capsule().fill(palette.accent))
            }
            .fixedSize()
            .disabled(working || input.trimmingCharacters(in: .whitespaces).isEmpty)
        }
    }

    private func send() {
        let said = input.trimmingCharacters(in: .whitespaces)
        guard !said.isEmpty, let id = openThread else { return }
        input = ""; working = true

        // Read before appending, so the question is not handed back as its own history.
        store.currentID = id
        let history = store.context()
        store.append(role: "user", text: said)

        Task {
            let reply: String
            do { reply = try await AgentClient.ask(said, history: history) }
            catch { reply = error.localizedDescription }
            store.append(role: "assistant", text: reply)
            // The brain keeps it too — a conversation that only lives in the chat list is not part
            // of what SlyOS knows about you.
            SlyStore.shared.insert(kind: "note", title: said, body: reply, source: "Chat")
            working = false
        }
    }
}


/// Asking what the paper should be about — Compose switches into a dedicated "compose" mode for
/// this rather than squeezing a field into the library.
private struct ComposePaper: View {
    let palette: Palette
    let onWrite: (String) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var subject = ""
    @FocusState private var focused: Bool

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: T.md) {
                Text("What should the paper be about?")
                    .font(.system(size: 24)).foregroundStyle(palette.ink)
                    .fixedSize(horizontal: false, vertical: true)
                Text("It runs the heavy model against your brain, so give it something worth the wait.")
                    .font(.system(size: T.small)).foregroundStyle(palette.inkFaint)
                    .fixedSize(horizontal: false, vertical: true)

                TextEditor(text: $subject)
                    .font(.system(size: T.body))
                    .foregroundStyle(palette.ink)
                    .scrollContentBackground(.hidden)
                    .frame(minHeight: 120)
                    .padding(T.sm)
                    .background(RoundedRectangle(cornerRadius: 10).fill(palette.bgElevated))
                    .focused($focused)

                Button {
                    onWrite(subject.trimmingCharacters(in: .whitespacesAndNewlines))
                } label: {
                    Text("Write it")
                        .font(.system(size: T.small))
                        .foregroundStyle(palette.bgElevated)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .background(Capsule().fill(palette.accent))
                }
                .disabled(subject.trimmingCharacters(in: .whitespaces).isEmpty)

                Spacer()
            }
            .padding(T.md)
            .background(palette.bg.ignoresSafeArea())
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }.tint(palette.inkFaint)
                }
            }
        }
        .environment(\.palette, palette)
        .onAppear { focused = true }
    }
}
