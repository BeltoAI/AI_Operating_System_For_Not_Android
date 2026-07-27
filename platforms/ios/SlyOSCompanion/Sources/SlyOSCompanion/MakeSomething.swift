import Foundation

/// Turning "write me a proposal for Carlos" into a real Google Doc.
///
/// Two steps on purpose. The model writes the content grounded in the brain; a separate, dumb
/// parser turns that into the API's shape. Asking one model call to produce both prose and valid
/// Slides JSON gets you neither reliably.
enum MakeSomething {

    enum Kind: String, CaseIterable {
        case doc, sheet, slides, site, pdf

        /// What the owner's phrasing suggests they want.
        static func detect(in prompt: String) -> Kind? {
            let p = prompt.lowercased()
            // Site before deck: "landing page" contains neither, but "pitch site" contains both.
            if ["website", "landing page", "web page", "webpage", "site for", "a site"]
                .contains(where: p.contains) { return .site }
            if ["pdf", "one-pager", "onepager"].contains(where: p.contains) { return .pdf }
            if ["deck", "slides", "presentation", "pitch"].contains(where: p.contains) { return .slides }
            if ["sheet", "spreadsheet", "table", "budget", "tracker", "csv"].contains(where: p.contains) { return .sheet }
            if ["doc", "document", "letter", "proposal", "memo", "write up", "write-up", "report",
                "contract", "brief"].contains(where: p.contains) { return .doc }
            return nil
        }

        var noun: String {
            switch self {
            case .doc: "document"
            case .sheet: "spreadsheet"
            case .slides: "deck"
            case .site: "website"
            case .pdf: "PDF"
            }
        }
    }

    /// What was made and where to find it.
    struct Made {
        let title: String
        let url: String
        /// A local file, when the thing is a PDF rather than something hosted.
        var file: URL?
    }

    /// Make the thing and return where it lives.
    static func make(_ kind: Kind, from prompt: String) async throws -> Made {
        let context = await AgentClient.corpus(for: prompt)
        let profile = SlyProfile.shared.fullProfile(limit: 1_500)

        var system = """
            You are writing a \(kind.noun) for the owner, to be shared with other people. Write the \
            finished thing — no preamble, no "here is your document", no commentary.
            """
        system += format(for: kind)
        if !profile.isEmpty { system += "\n\nWHO YOU ARE WRITING AS:\n\(profile)" }
        if !context.isEmpty { system += "\n\nUse these facts from the owner's own records; they are true." }

        let user = context.isEmpty ? prompt : "WHAT YOU KNOW:\n\(context)\n\nWRITE: \(prompt)"
        let written = try await AgentClient.complete(system: system, user: user, tier: .standard)

        let title = firstLine(of: written, fallback: prompt)
        switch kind {
        case .doc:
            let made = try await GoogleWorkspace.createDoc(title: title,
                                                           body: strip(title, from: written))
            return Made(title: made.title, url: made.url)
        case .sheet:
            let made = try await GoogleWorkspace.createSheet(title: title, rows: table(from: written))
            return Made(title: made.title, url: made.url)
        case .slides:
            let made = try await GoogleWorkspace.createSlides(title: title,
                                                             slides: deck(from: written))
            return Made(title: made.title, url: made.url)
        case .site:
            // Live and rendering, not a file to deploy later.
            let published = try await SiteHost.publish(html: page(from: written), name: title)
            return Made(title: title, url: published.url)
        case .pdf:
            let file = try PDFMaker.write(title: title,
                                          body: strip(title, from: written),
                                          author: SlyProfile.shared.value("full_name"))
            return Made(title: title, url: file.absoluteString, file: file)
        }
    }

    private static func format(for kind: Kind) -> String {
        switch kind {
        case .doc:
            "\n\nFirst line is the title, alone. Then the document, using # for headings and - for "
            + "bullets. Nothing else."
        case .sheet:
            "\n\nFirst line is the title, alone. Then the table as CSV — the header row first, one "
            + "row per line, commas between cells. No explanation, no code fence."
        case .slides:
            "\n\nFirst line is the deck title, alone. Then one slide per block, separated by a line "
            + "containing only ---. Each block: the slide title on its first line, then its body. "
            + "Six slides at most, and keep bodies short enough to read from a back row."
        case .site:
            "\n\nFirst line is the page title, alone. Then a COMPLETE HTML document — doctype, head "
            + "with styles inline in a <style> tag, and body. No markdown, no code fence, no "
            + "explanation. It must render on its own with no external files, no CDN and no "
            + "JavaScript frameworks. Make it genuinely handsome: real typography, generous "
            + "spacing, and a layout that works on a phone."
        case .pdf:
            "\n\nFirst line is the title, alone. Then the document, using # for headings and - for "
            + "bullets. Nothing else."
        }
    }

    private static func firstLine(of text: String, fallback: String) -> String {
        let line = text.split(separator: "\n").first.map(String.init)?
            .trimmingCharacters(in: CharacterSet(charactersIn: "# *")) ?? ""
        return line.isEmpty ? String(fallback.prefix(60)) : String(line.prefix(90))
    }

    private static func strip(_ title: String, from text: String) -> String {
        var lines = text.split(separator: "\n", omittingEmptySubsequences: false).map(String.init)
        if let first = lines.first, first.contains(title) { lines.removeFirst() }
        return lines.joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// CSV into rows. Quoted cells are respected, because any real table has a comma in it
    /// somewhere and splitting naively silently shifts every column after it.
    private static func table(from text: String) -> [[String]] {
        text.split(separator: "\n").dropFirst()
            .map(String.init)
            .filter { !$0.trimmingCharacters(in: .whitespaces).isEmpty }
            .map { line in
                var cells: [String] = []
                var current = ""
                var inQuotes = false
                for ch in line {
                    if ch == "\"" { inQuotes.toggle() }
                    else if ch == ",", !inQuotes { cells.append(current.trimmingCharacters(in: .whitespaces)); current = "" }
                    else { current.append(ch) }
                }
                cells.append(current.trimmingCharacters(in: .whitespaces))
                return cells
            }
    }

    private static func deck(from text: String) -> [(title: String, body: String)] {
        text.components(separatedBy: "\n---").dropFirst()
            .compactMap { block in
                let lines = block.split(separator: "\n", omittingEmptySubsequences: false)
                    .map { $0.trimmingCharacters(in: .whitespaces) }
                    .filter { !$0.isEmpty }
                guard let head = lines.first else { return nil }
                return (title: head.trimmingCharacters(in: CharacterSet(charactersIn: "# *")),
                        body: lines.dropFirst().joined(separator: "\n"))
            }
    }
}


extension MakeSomething {
    /// Pull the HTML out of what the model wrote.
    ///
    /// Models fence code even when told not to, and prepend a sentence even when told not to. Taking
    /// from the first `<` to the last `>` survives both without needing them to comply.
    static func page(from written: String) -> String {
        let body = written.replacingOccurrences(of: "```html", with: "")
            .replacingOccurrences(of: "```", with: "")
        guard let start = body.firstIndex(of: "<"), let end = body.lastIndex(of: ">") else {
            // No markup at all — wrap the prose so something renders rather than failing.
            return "<!doctype html><meta charset=\"utf-8\">"
                + "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
                + "<body style=\"font:16px/1.6 -apple-system,system-ui,sans-serif;max-width:44rem;"
                + "margin:3rem auto;padding:0 1.25rem;color:#1A1714;background:#F4EFE6\">"
                + body.replacingOccurrences(of: "\n", with: "<br>") + "</body>"
        }
        return String(body[start...end])
    }
}
