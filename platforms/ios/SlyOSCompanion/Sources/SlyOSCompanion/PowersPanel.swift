import SwiftUI

/// What SlyOS is worth to you, in numbers it can prove.
///
/// This was a storefront: a grid of cards with invented star ratings for features that could not be
/// bought, installed or tapped. It promised a shop and delivered a poster — and a fake rating is a
/// bad thing to show someone deciding whether to trust the app with their inbox.
///
/// Every figure here is counted at the moment it is drawn: rows in the brain, entries in the action
/// log, money summed from receipts. Nothing is estimated, nothing is cached, so nothing can drift
/// out of date or be quietly wrong.
///
/// The argument it makes is the product's whole argument: an assistant that starts from zero every
/// time is worth nothing, and this one holds *this much* of you and did *these things* — stated as
/// evidence rather than as a claim.
struct PowersPanel: View {
    @Environment(\.palette) private var p

    @State private var permissions = Permissions.shared
    @State private var router = ModelRouter.shared

    @State private var brainTotal = 0
    @State private var bySource: [(String, Int)] = []
    @State private var addedThisWeek = 0
    @State private var embedded = 0
    @State private var actions: [(String, Int)] = []
    @State private var devices: [String] = []
    @State private var facts = 0
    @State private var photos = 0
    @State private var drafts = 0
    @State private var receipts = 0
    @State private var spend = ""
    @State private var loading = true

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header
            ScrollView {
                VStack(alignment: .leading, spacing: T.lg) {
                    headline
                    if brainTotal > 0 { knows }
                    if !actions.isEmpty { did }
                    if devices.count > 1 { across }
                    switchOn
                }
                .padding(.top, T.md)
                .padding(.bottom, T.lg)
            }
            .scrollIndicators(.hidden)
        }
        .padding(.horizontal, T.md)
        .task { await refresh() }
    }

    // MARK: - Chrome

    private var header: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("your brain")
                .font(.custom(T.scriptFamily, size: 40))
                .foregroundStyle(p.ink)
            Text(loading ? "counting…" : "counted just now — none of this is estimated")
                .font(.system(size: T.small)).foregroundStyle(p.inkFaint)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.top, T.md)
    }

    /// The one number that is the product.
    private var headline: some View {
        VStack(alignment: .leading, spacing: T.xs) {
            Text(brainTotal.formatted())
                .font(.system(size: 56, weight: .light))
                .foregroundStyle(p.accent)
            Text(brainTotal == 0
                 ? "things remembered — import a chat export or read a document in, and this is where it shows"
                 : "things it remembers about you")
                .font(.system(size: T.body)).foregroundStyle(p.inkSoft)
                .fixedSize(horizontal: false, vertical: true)
            if addedThisWeek > 0 {
                Text("+\(addedThisWeek.formatted()) this week")
                    .font(.system(size: T.small)).foregroundStyle(p.good)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(18)
        .background(RoundedRectangle(cornerRadius: 18).fill(p.bgElevated))
    }

    // MARK: - Sections

    private var knows: some View {
        card("WHAT IT KNOWS") {
            VStack(alignment: .leading, spacing: 10) {
                ForEach(bySource.prefix(6), id: \.0) { name, n in
                    bar(name, n, of: bySource.first?.1 ?? 1)
                }
                if embedded > 0 || facts > 0 || photos > 0 || receipts > 0 {
                    Divider().overlay(p.hairline).padding(.vertical, 2)
                }
                if embedded > 0 {
                    stat("searchable by meaning",
                         "\(Int(Double(embedded) / Double(max(brainTotal, 1)) * 100))%",
                         detail: "the rest is still findable by keyword")
                }
                if facts > 0 {
                    stat("things it worked out about you", "\(facts)",
                         detail: "distilled from your history, not typed in")
                }
                if photos > 0 {
                    stat("photos read", photos.formatted(), detail: "on this phone — none uploaded")
                }
                if receipts > 0 {
                    stat("receipts tracked", spend.isEmpty ? "\(receipts)" : spend,
                         detail: "\(receipts) scanned this month")
                }
            }
        }
    }

    private var did: some View {
        card("WHAT IT DID FOR YOU") {
            VStack(alignment: .leading, spacing: 10) {
                ForEach(actions, id: \.0) { verb, n in
                    HStack {
                        Text(verb.capitalized)
                            .font(.system(size: T.body)).foregroundStyle(p.ink)
                        Spacer()
                        Text("\(n)")
                            .font(.system(size: T.body, weight: .medium)).foregroundStyle(p.accent)
                    }
                }
                if drafts > 0 {
                    Divider().overlay(p.hairline).padding(.vertical, 2)
                    stat("replies written in your voice", "\(drafts)",
                         detail: "each one you didn't start from nothing")
                }
            }
        }
    }

    /// Only once a second device has written to the brain — "1 device" is a statistic about nothing.
    private var across: some View {
        card("ONE BRAIN, \(devices.count) DEVICES") {
            VStack(alignment: .leading, spacing: 8) {
                ForEach(devices, id: \.self) { d in
                    HStack(spacing: 8) {
                        Image(systemName: "iphone").font(.system(size: 12)).foregroundStyle(p.accent)
                        Text(d).font(.system(size: T.body)).foregroundStyle(p.ink)
                        Spacer()
                        Text("\(Activity.recent(limit: 500, on: d).count)")
                            .font(.system(size: T.small)).foregroundStyle(p.inkFaint)
                    }
                }
                Text("Ask about any of them from any of them — \"what did I do on my Samsung "
                     + "yesterday?\"")
                    .font(.system(size: T.caption)).foregroundStyle(p.inkFaint)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private var switchOn: some View {
        let off = pending
        return Group {
            if off.isEmpty {
                card("EVERYTHING IS ON") {
                    Text("Every part of SlyOS this phone can run is running.")
                        .font(.system(size: T.small)).foregroundStyle(p.inkSoft)
                }
            } else {
                card("SWITCH ON") {
                    VStack(spacing: 12) {
                        ForEach(off, id: \.title) { SwitchOnRow(item: $0, palette: p) }
                    }
                }
            }
        }
    }

    // MARK: - Pieces

    @ViewBuilder
    private func card<Content: View>(_ label: String,
                                     @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: T.sm) {
            Text(label)
                .font(.system(size: T.small, weight: .bold)).tracking(2)
                .foregroundStyle(p.inkFaint)
            content()
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(16)
                .background(RoundedRectangle(cornerRadius: 18).fill(p.bgElevated))
        }
    }

    private func bar(_ name: String, _ n: Int, of top: Int) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack {
                Text(name).font(.system(size: T.small)).foregroundStyle(p.ink).lineLimit(1)
                Spacer()
                Text(n.formatted()).font(.system(size: T.small)).foregroundStyle(p.inkFaint)
            }
            GeometryReader { geo in
                RoundedRectangle(cornerRadius: 3).fill(p.accent.opacity(0.55))
                    .frame(width: max(3, geo.size.width * CGFloat(n) / CGFloat(max(top, 1))))
            }
            .frame(height: 5)
        }
    }

    private func stat(_ label: String, _ value: String, detail: String) -> some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 1) {
                Text(label).font(.system(size: T.small)).foregroundStyle(p.ink)
                Text(detail).font(.system(size: T.caption)).foregroundStyle(p.inkFaint)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 8)
            Text(value)
                .font(.system(size: T.small, weight: .medium)).foregroundStyle(p.accent).fixedSize()
        }
    }

    // MARK: - What is off

    struct Pending {
        let title: String
        let why: String
        let fix: Fix
    }

    enum Fix: Equatable {
        case permission(Permissions.Capability)
        case settings
    }

    private var pending: [Pending] {
        var out: [Pending] = []
        if !router.isConfigured {
            out.append(.init(title: "Add an AI key",
                             why: "nothing that needs a model can answer without one — Groq and Mistral are free",
                             fix: .settings))
        }
        if brainTotal == 0 {
            out.append(.init(title: "Feed it something",
                             why: "a WhatsApp or Instagram export, or a PDF — this is the whole product",
                             fix: .settings))
        }
        if permissions.state(.calendar) != .granted {
            out.append(.init(title: "Your calendar", why: "so it knows what's on before you ask",
                             fix: .permission(.calendar)))
        }
        if permissions.state(.camera) != .granted {
            out.append(.init(title: "The camera",
                             why: "read receipts and documents — works with no key at all",
                             fix: .permission(.camera)))
        }
        if permissions.state(.microphone) != .granted {
            out.append(.init(title: "The microphone", why: "talk to it, and take notes in a meeting",
                             fix: .permission(.microphone)))
        }
        if permissions.state(.reminders) != .granted {
            out.append(.init(title: "Reminders", why: "so a task you give it actually goes off",
                             fix: .permission(.reminders)))
        }
        if !GoogleAuth.shared.isConnected {
            out.append(.init(title: "Connect Google",
                             why: "mail drafts, real invitations with Meet links, documents, backup",
                             fix: .settings))
        }
        return out
    }

    // MARK: - Counting

    private func refresh() async {
        let store = SlyStore.shared
        brainTotal = store.count()
        // The self-test writes rows of its own; counting them as memories would flatter the number.
        bySource = store.countsBySource().filter { $0.0 != "SelfTest" }
        addedThisWeek = store.between(Date.now.addingTimeInterval(-7 * 86_400), .now,
                                      limit: 5_000).count
        embedded = VectorStore.shared.coverage(model: Embedder.available?.model).embedded

        // Counted by the verb the log line was written with, so the tally can never disagree with
        // what the row actually says.
        var counts: [String: Int] = [:]
        for row in Activity.recent(limit: 1_000) {
            for kind in ["created", "sent", "scanned", "imported", "saved", "scheduled", "asked"]
            where row.body.hasPrefix("You \(kind) ") {
                counts[kind, default: 0] += 1
            }
        }
        actions = counts.sorted { $0.value > $1.value }.map { ($0.key, $0.value) }
        devices = Activity.devices()

        facts = Distiller.facts.count
        photos = PhotoIndex.count
        drafts = DraftLog.shared.entries.count

        let ledger = Expenses.shared
        ledger.load()
        let month = Calendar.current.date(from:
            Calendar.current.dateComponents([.year, .month], from: .now)) ?? .now
        let (total, currency, _) = ledger.total(from: month,
                                                to: Calendar.current.date(byAdding: .month, value: 1,
                                                                          to: month) ?? .now)
        receipts = ledger.entries.filter { $0.date >= month }.count
        if total > 0 {
            let f = NumberFormatter(); f.numberStyle = .currency; f.currencyCode = currency
            spend = f.string(from: NSNumber(value: total)) ?? ""
        }
        loading = false
    }
}

/// One thing that is off, and the tap that turns it on.
private struct SwitchOnRow: View {
    let item: PowersPanel.Pending
    let palette: Palette
    @State private var showSettings = false

    var body: some View {
        Button {
            switch item.fix {
            case .permission(let capability):
                Task {
                    await Permissions.shared.request(capability)
                    // Refused once already: iOS never asks a second time, so the only route left is
                    // the Settings app. Without this the row is a button that does nothing.
                    if Permissions.shared.state(capability) != .granted {
                        Permissions.shared.openSettings()
                    }
                }
            case .settings:
                showSettings = true
            }
        } label: {
            HStack(alignment: .top, spacing: 10) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(item.title)
                        .font(.system(size: T.body, weight: .medium)).foregroundStyle(palette.ink)
                    Text(item.why)
                        .font(.system(size: T.caption)).foregroundStyle(palette.inkFaint)
                        .fixedSize(horizontal: false, vertical: true)
                        .multilineTextAlignment(.leading)
                }
                Spacer(minLength: 8)
                Image(systemName: "arrow.right.circle.fill")
                    .font(.system(size: 18)).foregroundStyle(palette.accent)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .sheet(isPresented: $showSettings) { SettingsPanel() }
    }
}
