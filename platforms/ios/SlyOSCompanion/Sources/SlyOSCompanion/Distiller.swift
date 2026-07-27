import Foundation

/// Turning imported material into things the brain actually knows.
///
/// Importing is not learning. Fifty thousand WhatsApp lines make retrieval *possible*, but nobody's
/// commitments, decisions or standing preferences are stated in a form a keyword search can find:
/// "yeah Tuesday works" is a commitment, and it contains none of the words anyone would search for.
/// Android runs the same pass nightly, which is why its answers know things no single message says.
///
/// Two passes, because they answer different questions:
///
/// * **Facts** — what is true about the owner's life and the people in it.
/// * **Self** — the owner's own positions, preferences and boundaries, distilled from what *they*
///   wrote. This is what lets a draft take a stance rather than hedge, and it can only come from
///   their own half of a conversation.
enum Distiller {

    private static let factsKey = "brain.facts"
    private static let lastRunKey = "brain.facts.lastRun"
    /// Enough to be useful, few enough to stay inside the profile budget.
    private static let maxFacts = 120

    // MARK: - Reading

    static var facts: [String] {
        SharedContainer.defaults.stringArray(forKey: factsKey) ?? []
    }

    /// The learned facts, for the profile block.
    static func block() -> String {
        let learned = facts
        guard !learned.isEmpty else { return "" }
        return "\n\nWhat I've learned about you from your own history:\n"
            + learned.prefix(60).map { "· \($0)" }.joined(separator: "\n")
    }

    /// Add a fact, unless something near enough is already known.
    ///
    /// Deduped on normalised text rather than exactly: the same fact distilled a week apart comes
    /// back with different punctuation and a different verb tense every time, and a list that
    /// accumulates six phrasings of "he has three dogs" pushes out everything else.
    @discardableResult
    static func learn(_ raw: String) -> Bool {
        let fact = raw.trimmingCharacters(in: .whitespacesAndNewlines)
            .trimmingCharacters(in: CharacterSet(charactersIn: "-•*· "))
        guard fact.count > 12, fact.count < 300 else { return false }

        var current = facts
        let key = normalise(fact)
        guard !current.contains(where: { normalise($0) == key }) else { return false }

        current.append(fact)
        if current.count > maxFacts { current.removeFirst(current.count - maxFacts) }
        SharedContainer.defaults.set(current, forKey: factsKey)

        // Also into the brain proper, so recall can surface it against a question and it survives a
        // backup. The defaults copy is the fast path for the profile block; this is the durable one.
        SlyStore.shared.insert(kind: "fact", title: "", body: fact, source: "Learned")
        return true
    }

    static func forget(_ fact: String) {
        SharedContainer.defaults.set(facts.filter { $0 != fact }, forKey: factsKey)
    }

    private static func normalise(_ s: String) -> String {
        s.lowercased()
            .components(separatedBy: CharacterSet.alphanumerics.inverted)
            .filter { !$0.isEmpty }
            .joined(separator: " ")
    }

    // MARK: - Running

    /// Distil once a day, at most.
    ///
    /// Called when the app comes to the foreground rather than from a background task: iOS decides
    /// when background work runs and frequently decides never, so a feature that only works in the
    /// background is a feature that mostly does not work.
    @discardableResult
    static func runIfDue(force: Bool = false) async -> Int {
        let last = SharedContainer.defaults.double(forKey: lastRunKey)
        let dayAgo = Date.now.timeIntervalSince1970 - 86_400
        guard force || last < dayAgo else { return 0 }
        guard ModelRouter.shared.isConfigured else { return 0 }

        SharedContainer.defaults.set(Date.now.timeIntervalSince1970, forKey: lastRunKey)
        return await run()
    }

    /// Distil now. Returns how many genuinely new facts were learned.
    static func run(limit: Int = 150) async -> Int {
        let recent = SlyStore.shared.recent(limit: limit)
            .filter { $0.kind != "fact" }
        guard recent.count >= 5 else { return 0 }

        // Their half and everyone else's, kept apart. Mixed together, the model attributes other
        // people's opinions to the owner — the same failure that once told the owner his wife's
        // birthday was his own.
        let theirs = recent.filter { $0.source.contains("(sent)") || $0.source == "Home" }
        let all = recent

        var learned = 0
        if let facts = await distil(all, prompt: Self.factsPrompt) {
            learned += facts.filter { learn($0) }.count
        }
        if theirs.count >= 5, let self_ = await distil(theirs, prompt: Self.selfPrompt) {
            learned += self_.filter { learn($0) }.count
        }
        return learned
    }

    private static func distil(_ memories: [Memory], prompt: String) async -> [String]? {
        let corpus = memories.prefix(150).map { m -> String in
            let who = m.person.isEmpty ? "" : "\(m.person): "
            return "[\(m.date.formatted(date: .abbreviated, time: .omitted))] \(who)"
                + m.body.trimmingCharacters(in: .whitespacesAndNewlines).prefix(300)
        }.joined(separator: "\n")
        guard corpus.count > 200 else { return nil }

        do {
            // The cheap tier deliberately: this runs unattended over a large corpus, and the output
            // is a list of short statements rather than anything that needs the heavy model.
            let reply = try await AgentClient.complete(
                system: prompt + Untrusted.clause, user: corpus, tier: .cheap)
            return reply.components(separatedBy: .newlines)
                .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                .filter { !$0.isEmpty }
        } catch {
            return nil
        }
    }

    private static let factsPrompt = """
        Below is a slice of one person's own message history. Write down the durable facts it \
        establishes — things that will still be true next month.

        Rules:
        · One fact per line. No numbering, no bullets, no preamble, no closing summary.
        · Name people explicitly. "His sister Ana is a nurse in Valencia", never "his sister is a nurse".
        · Include commitments and decisions with their date when the text gives one: "Told Carlos he \
        would have the deck ready by 14 March".
        · Only what the text actually says. If it is implied rather than stated, leave it out — an \
        invented fact is worse than a missing one, because it will be repeated back with confidence.
        · Skip small talk, greetings, logistics that have already happened, and anything true only \
        for a single day.
        · At most 20 lines. If there is nothing durable in it, write nothing at all.
        """

    private static let selfPrompt = """
        Below are messages this person wrote themselves. Write down their own positions — what they \
        want, what they refuse, how they work, what they consistently do.

        Rules:
        · One per line. No numbering, no bullets, no preamble.
        · Write them about the person, in the third person: "Turns down calls before 10am", \
        "Prefers to be sent a document rather than a summary of it".
        · Preferences, boundaries, working habits, standing positions. Not events, not facts about \
        other people.
        · Only what is demonstrated repeatedly or stated outright. A single offhand remark is not a \
        position.
        · At most 15 lines. If nothing is demonstrated, write nothing.
        """
}
