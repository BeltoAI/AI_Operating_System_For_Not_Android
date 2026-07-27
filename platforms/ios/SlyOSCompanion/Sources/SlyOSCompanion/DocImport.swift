import Foundation
import PDFKit
import UniformTypeIdentifiers
import Vision
import UIKit

/// Reading documents into the brain.
///
/// Android could already do this and iOS could not accept a PDF at all — the file picker was
/// `matching: .images`. A contract you cannot ask about is a file, not a memory.
///
/// Text is stored in **pages, not one blob**. A forty-page contract as a single row wins every
/// search and then floods the context window with thirty-nine pages nobody asked about; per-page
/// rows let recall return the clause that actually matters.
enum DocImport {

    /// Everything worth accepting. PDFs and plain text are read directly; images go through OCR.
    static let acceptedTypes: [UTType] = [
        .pdf, .plainText, .rtf, .commaSeparatedText, .text,
        .image, .jpeg, .png,
        UTType("com.microsoft.word.doc") ?? .data,
        UTType("org.openxmlformats.wordprocessingml.document") ?? .data,
        .data
    ]

    struct Result {
        let name: String
        let pages: Int
        let characters: Int
        var failed: String?
    }

    /// Read a file and put it in the brain.
    static func read(_ url: URL) async -> Result {
        // Files picked from another app are security-scoped; without this the read fails with a
        // permission error that reads like a corrupt file.
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }

        let name = url.deletingPathExtension().lastPathComponent
        let ext = url.pathExtension.lowercased()

        var pages: [String] = []

        switch ext {
        case "pdf":
            pages = await readPDF(url, name: name)
        case "png", "jpg", "jpeg", "heic", "heif", "tiff":
            if let data = try? Data(contentsOf: url), let image = UIImage(data: data) {
                let text = await LookMode.text(in: image)
                if !text.isEmpty { pages = [text] }
            }
        default:
            // Everything else that is really text — txt, csv, md, rtf, json.
            if let data = try? Data(contentsOf: url) {
                let text = String(decoding: data, as: UTF8.self)
                // A binary file decoded as UTF-8 is mostly replacement characters; storing that
                // would poison search with noise that matches nothing and reads as gibberish.
                let junk = text.filter { $0 == "\u{FFFD}" }.count
                if !text.isEmpty && Double(junk) / Double(max(1, text.count)) < 0.1 {
                    pages = chunk(text)
                }
            }
        }

        let usable = pages.filter { $0.trimmingCharacters(in: .whitespacesAndNewlines).count > 20 }
        guard !usable.isEmpty else {
            return Result(name: name, pages: 0, characters: 0,
                          failed: "Couldn't read any text out of \(url.lastPathComponent). "
                                + "If it's a scan, try Look → Scan doc instead.")
        }

        let memories = usable.enumerated().map { index, text in
            Memory(kind: "doc",
                   person: "",
                   // The page number lives in the title so a recalled clause can be cited.
                   title: usable.count > 1 ? "\(name) — p\(index + 1)" : name,
                   body: text,
                   source: "Document",
                   date: Date())
        }
        SlyStore.shared.insertMany(memories)

        return Result(name: name, pages: usable.count,
                      characters: usable.reduce(0) { $0 + $1.count })
    }

    /// PDF text, page by page.
    ///
    /// `PDFKit` is built in, so unlike Android — which needed PDFBox — this costs nothing. A page
    /// with no extractable text is a scan, and those are sent through OCR rather than skipped.
    private static func readPDF(_ url: URL, name: String) async -> [String] {
        guard let document = PDFDocument(url: url) else { return [] }
        var pages: [String] = []

        for index in 0..<document.pageCount {
            guard let page = document.page(at: index) else { continue }
            let text = page.string?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""

            if text.count > 20 {
                pages.append(text)
            } else {
                // A scanned page: render it and read it the way Look reads a photograph.
                let bounds = page.bounds(for: .mediaBox)
                let renderer = UIGraphicsImageRenderer(size: bounds.size)
                let image = renderer.image { ctx in
                    UIColor.white.setFill()
                    ctx.fill(bounds)
                    ctx.cgContext.translateBy(x: 0, y: bounds.height)
                    ctx.cgContext.scaleBy(x: 1, y: -1)
                    page.draw(with: .mediaBox, to: ctx.cgContext)
                }
                let read = await LookMode.text(in: image)
                if read.count > 20 { pages.append(read) }
            }
        }
        return pages
    }

    /// Split long plain text on paragraph boundaries.
    ///
    /// Cutting mid-sentence at a fixed length produces chunks that begin and end nowhere, and both
    /// keyword and semantic search do badly with them.
    private static func chunk(_ text: String, target: Int = 2_000) -> [String] {
        let paragraphs = text.components(separatedBy: "\n\n")
        var out: [String] = []
        var current = ""

        for paragraph in paragraphs {
            if current.count + paragraph.count > target, !current.isEmpty {
                out.append(current)
                current = paragraph
            } else {
                current += (current.isEmpty ? "" : "\n\n") + paragraph
            }
        }
        if !current.isEmpty { out.append(current) }
        return out
    }
}
