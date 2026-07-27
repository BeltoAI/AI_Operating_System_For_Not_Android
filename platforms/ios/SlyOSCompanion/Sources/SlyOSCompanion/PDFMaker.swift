import Foundation
import UIKit
import CoreText

/// Turning what SlyOS wrote into a PDF you can send someone.
///
/// Shared rather than living inside the Zenodo publisher, because a PDF is useful on its own — a
/// proposal, a brief, a paper — and the paginating logic is the part worth getting right once.
enum PDFMaker {

    /// A4 at 72dpi.
    private static let page = CGRect(x: 0, y: 0, width: 595, height: 842)
    private static let margin: CGFloat = 56

    /// Render markdown-ish text as a paginated PDF.
    ///
    /// Core Text rather than a single draw call: a long document rendered in one pass silently
    /// becomes one page with everything past the first screenful missing.
    static func make(title: String, body: String, author: String = "") -> Data {
        let text = NSMutableAttributedString()

        text.append(NSAttributedString(string: title + "\n", attributes: [
            .font: UIFont.systemFont(ofSize: 24, weight: .semibold),
            .foregroundColor: UIColor(red: 0.91, green: 0.39, blue: 0.17, alpha: 1)   // brand accent
        ]))
        if !author.isEmpty {
            text.append(NSAttributedString(string: author + "\n", attributes: [
                .font: UIFont.systemFont(ofSize: 11),
                .foregroundColor: UIColor.darkGray
            ]))
        }
        text.append(NSAttributedString(string: "\n"))

        // Headings and bullets get their own weight, so the PDF reads like a document rather than a
        // transcript.
        for line in body.split(separator: "\n", omittingEmptySubsequences: false) {
            let raw = String(line)
            let trimmed = raw.trimmingCharacters(in: .whitespaces)

            if let m = trimmed.firstMatch(#"^#{1,6}\s+(.*)$"#) {
                text.append(NSAttributedString(string: "\n" + m[1] + "\n", attributes: [
                    .font: UIFont.systemFont(ofSize: 14, weight: .semibold)
                ]))
            } else if let m = trimmed.firstMatch(#"^[-•*]\s+(.*)$"#) {
                text.append(NSAttributedString(string: "  •  " + m[1] + "\n", attributes: [
                    .font: UIFont.systemFont(ofSize: 11)
                ]))
            } else {
                text.append(NSAttributedString(string: raw + "\n", attributes: [
                    .font: UIFont.systemFont(ofSize: 11)
                ]))
            }
        }

        let framesetter = CTFramesetterCreateWithAttributedString(text)
        return UIGraphicsPDFRenderer(bounds: page).pdfData { ctx in
            var start = 0
            let total = text.length
            repeat {
                ctx.beginPage()
                guard let cg = UIGraphicsGetCurrentContext() else { break }
                // Core Text draws bottom-up; flipping keeps the page the right way round.
                cg.textMatrix = .identity
                cg.translateBy(x: 0, y: page.height)
                cg.scaleBy(x: 1, y: -1)

                let path = CGPath(rect: page.insetBy(dx: margin, dy: margin), transform: nil)
                let frame = CTFramesetterCreateFrame(framesetter, CFRange(location: start, length: 0),
                                                     path, nil)
                CTFrameDraw(frame, cg)
                let visible = CTFrameGetVisibleStringRange(frame)
                // No progress means nothing more will ever fit — stopping avoids an endless file.
                if visible.length == 0 { break }
                start += visible.length
            } while start < total
        }
    }

    /// Write it somewhere the share sheet can reach.
    static func write(title: String, body: String, author: String = "") throws -> URL {
        let safe = title.replacingOccurrences(of: "[^A-Za-z0-9 _-]", with: "",
                                              options: .regularExpression)
        let name = (safe.isEmpty ? "document" : String(safe.prefix(60))) + ".pdf"
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(name)
        try make(title: title, body: body, author: author).write(to: url)
        return url
    }
}
