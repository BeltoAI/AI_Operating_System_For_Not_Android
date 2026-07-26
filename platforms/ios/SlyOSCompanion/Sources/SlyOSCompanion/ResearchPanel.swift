import SwiftUI

/// Research — a longer, harder answer than Home gives.
///
/// Same brain, same grounding, but routed to the heavy tier and told to actually think. Findings
/// are written back into memory, so what you learned today is available to every answer tomorrow.
struct ResearchPanel: View {
    @Environment(\.palette) private var p

    @State private var question = ""
    @State private var finding = ""
    @State private var working = false
    @State private var failure: String?
    @State private var past: [Memory] = []
    @FocusState private var focused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header
            askRow

            if working {
                VStack { Spacer(); SlyWaiting("digging", orbit: 34); Spacer() }.frame(maxWidth: .infinity)
            } else if let failure {
                message(failure, colour: p.danger)
            } else if !finding.isEmpty {
                findingView
            } else if past.isEmpty {
                emptyState
            } else {
                history
            }

            Spacer(minLength: 0)
        }
        .padding(.horizontal, T.md)
        .task { past = SlyStore.shared.search("research", limit: 20) }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: T.xs) {
            Heading("Research")
            Text("A longer answer, thought through — and kept.")
                .font(.system(size: T.body)).foregroundStyle(p.inkFaint)
        }
        .padding(.top, T.md)
    }

    private var askRow: some View {
        HStack(spacing: T.sm) {
            TextField("", text: $question, prompt:
                Text("what's worth digging into?").foregroundStyle(p.inkFaint))
                .font(.system(size: T.body))
                .foregroundStyle(p.ink)
                .textFieldStyle(.plain)
                .focused($focused)
                .submitLabel(.go)
                .onSubmit(run)
                .padding(.horizontal, T.md).padding(.vertical, 12)
                .background(RoundedRectangle(cornerRadius: 12).fill(p.bgElevated.opacity(0.5)))

            Button(action: run) {
                Text(working ? "…" : "Dig")
                    .font(.system(size: T.body)).foregroundStyle(p.ink)
                    .frame(minWidth: 26)
                    .padding(.horizontal, T.lg).padding(.vertical, 12)
                    .background(Capsule().fill(p.accent))
            }
            .fixedSize()
            .disabled(working || question.trimmingCharacters(in: .whitespaces).isEmpty)
        }
        .padding(.top, T.md)
    }

    private var findingView: some View {
        VStack(alignment: .leading, spacing: T.sm) {
            Text("FINDING")
                .font(.system(size: T.small, weight: .bold)).tracking(2)
                .foregroundStyle(p.inkFaint)
                .padding(.top, T.lg)
            ScrollView { AnswerView(text: finding) }
                .scrollIndicators(.hidden)
        }
    }

    private var history: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("EARLIER")
                .font(.system(size: T.small, weight: .bold)).tracking(2)
                .foregroundStyle(p.inkFaint)
                .padding(.top, T.lg).padding(.bottom, T.sm)
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0) {
                    ForEach(past) { m in
                        Button {
                            question = m.title
                            finding = m.body
                        } label: {
                            MemoryRow(memory: m)
                        }
                        Hairline().opacity(0.6)
                    }
                }
            }
            .scrollIndicators(.hidden)
        }
    }

    private var emptyState: some View {
        VStack(alignment: .leading, spacing: T.sm) {
            Text("Nothing yet.")
                .font(.system(size: 28)).foregroundStyle(p.ink)
                .padding(.top, T.lg)
            Text("Ask something that deserves more than a one-line answer. Whatever comes back is "
                 + "kept, so it feeds every answer after it.")
                .font(.system(size: T.body)).foregroundStyle(p.inkFaint)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func message(_ s: String, colour: Color) -> some View {
        Text(s).font(.system(size: T.body)).foregroundStyle(colour)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.top, T.lg)
    }

    private func centred(_ s: String) -> some View {
        VStack { Spacer(); Text(s).font(.system(size: T.body)).foregroundStyle(p.inkFaint); Spacer() }
            .frame(maxWidth: .infinity)
    }

    private func run() {
        let q = question.trimmingCharacters(in: .whitespaces)
        guard !q.isEmpty else { return }
        working = true; failure = nil; finding = ""; focused = false

        Task {
            do {
                let context = AgentClient.corpus(for: q)
                let system = """
                    You are SlyOS doing research for its owner. Go deeper than a chat reply: lay out \
                    what is actually true, what follows from it, and what the owner should do. Be \
                    concrete and specific. No preamble, no restating the question.

                    Where the owner's own memories are given below, they are fact — use them and \
                    refer to people by name. Where you are reasoning beyond them, say so plainly \
                    rather than presenting a guess as a finding.
                    """
                let user = context.isEmpty ? q : "WHAT YOU KNOW:\n\(context)\n\nRESEARCH: \(q)"

                // Heavy tier: this is the one place where a slower, better answer is the point.
                let result = try await AgentClient.complete(system: system, user: user, tier: .heavy)
                finding = result
                SlyStore.shared.insert(kind: "paper", title: q, body: result, source: "Research")
                past = SlyStore.shared.search("research", limit: 20)
            } catch {
                failure = error.localizedDescription
            }
            working = false
        }
    }
}
