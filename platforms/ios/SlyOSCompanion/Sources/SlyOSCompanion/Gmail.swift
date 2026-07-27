import Foundation

/// Sending mail as the owner, through their own Gmail account.
///
/// Uses the `gmail.send` scope already granted at sign-in. Every send is recorded in the outbox by
/// the caller, because a message that left the phone must be checkable afterwards.
enum Gmail {

    /// Send a plain-text message.
    ///
    /// Gmail's API takes a whole RFC 2822 message base64url-encoded, not a set of fields — so the
    /// headers are built by hand. Subject is RFC 2047 encoded, or a non-ASCII subject arrives as
    /// mojibake in the recipient's inbox.
    /// Send mail, optionally with files attached.
    ///
    /// Attachments matter more than they look: SlyOS can build a PDF, and until now the only thing
    /// it could do with one was hand it to the iOS share sheet. "Make the invoice and send it to
    /// Carlos" stopped halfway, at exactly the point the work became useful.
    private static func mimeType(for url: URL) -> String {
        switch url.pathExtension.lowercased() {
        case "pdf":  "application/pdf"
        case "png":  "image/png"
        case "jpg", "jpeg": "image/jpeg"
        case "csv":  "text/csv"
        case "txt":  "text/plain"
        case "html": "text/html"
        default:     "application/octet-stream"
        }
    }

    static func send(to: String, subject: String, body: String,
                     attachments: [URL] = []) async throws {
        let token = try await GoogleAuth.shared.accessToken()

        // RFC 2047 for the subject, so an accent or an emoji does not arrive as mojibake.
        let encodedSubject = "=?UTF-8?B?" + Data(subject.utf8).base64EncodedString() + "?="

        let raw: String
        if attachments.isEmpty {
            raw = """
                To: \(to)\r
                Subject: \(encodedSubject)\r
                MIME-Version: 1.0\r
                Content-Type: text/plain; charset=UTF-8\r
                \r
                \(body)
                """
        } else {
            // multipart/mixed. The boundary must appear nowhere in the content, hence a UUID.
            let boundary = "slyos-\(UUID().uuidString)"
            var message = """
                To: \(to)\r
                Subject: \(encodedSubject)\r
                MIME-Version: 1.0\r
                Content-Type: multipart/mixed; boundary="\(boundary)"\r
                \r
                --\(boundary)\r
                Content-Type: text/plain; charset=UTF-8\r
                \r
                \(body)\r
                """

            for url in attachments {
                guard let data = try? Data(contentsOf: url) else { continue }
                let name = url.lastPathComponent
                // Base64 bodies must be wrapped at 76 characters — some servers reject longer
                // lines outright, and others silently truncate the attachment.
                let encoded = data.base64EncodedString(options: [.lineLength76Characters,
                                                                .endLineWithCarriageReturn])
                message += """
                    \r
                    --\(boundary)\r
                    Content-Type: \(mimeType(for: url)); name="\(name)"\r
                    Content-Transfer-Encoding: base64\r
                    Content-Disposition: attachment; filename="\(name)"\r
                    \r
                    \(encoded)\r
                    """
            }
            message += "\r\n--\(boundary)--"
            raw = message
        }

        // base64url, and Gmail rejects the standard alphabet.
        let encoded = Data(raw.utf8).base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")

        var req = URLRequest(url: URL(string: "https://gmail.googleapis.com/gmail/v1/users/me/messages/send")!)
        req.httpMethod = "POST"
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.timeoutInterval = 30
        req.httpBody = try JSONSerialization.data(withJSONObject: ["raw": encoded])

        let (data, response) = try await URLSession.shared.data(for: req)
        let code = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(code) else {
            throw GoogleCalendar.CalendarError.api(code, String(data: data, encoding: .utf8) ?? "")
        }
    }
}
