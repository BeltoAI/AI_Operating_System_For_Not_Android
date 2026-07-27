import Foundation

/// Publishing a real, live website — ported from Android's `SiteHost`.
///
/// The point is a URL that renders in any browser, with **no account and no setup** for the owner.
/// A generated page that has to be deployed by hand is a text file with extra steps; a link you can
/// send someone is a product.
///
/// Hosting goes through a Belto-owned token baked into the build, so nobody signs up for anything.
/// If the owner has set their own Netlify or Vercel token it takes precedence, because a site in
/// their account is theirs to keep.
enum SiteHost {

    struct Published {
        let url: String
        let host: String
    }

    enum SiteError: LocalizedError {
        case notConfigured
        case tooShort
        case api(String, Int, String)

        var errorDescription: String? {
            switch self {
            case .notConfigured:
                "Site hosting isn't set up in this build — add a Netlify or Vercel token."
            case .tooShort:
                "There wasn't enough page to publish."
            case .api(let host, let code, let body):
                "\(host) refused it (\(code)): \(body.prefix(140))"
            }
        }
    }

    private static func token(_ key: String) -> String {
        Bundle.main.object(forInfoDictionaryKey: key) as? String ?? ""
    }

    static var isAvailable: Bool {
        !token("NetlifyToken").isEmpty || !token("VercelToken").isEmpty
    }

    /// Put an HTML page on the internet and return where it lives.
    static func publish(html: String, name: String = "site") async throws -> Published {
        guard html.count >= 40 else { throw SiteError.tooShort }

        let netlify = token("NetlifyToken")
        if !netlify.isEmpty {
            // Netlify first: a single-file deploy needs no build step and is live in seconds.
            if let url = try? await deployToNetlify(html: html, token: netlify) {
                return Published(url: url, host: "Netlify")
            }
            // Fall through rather than fail — a hosting outage should not lose the page.
        }

        let vercel = token("VercelToken")
        guard !vercel.isEmpty else { throw SiteError.notConfigured }
        let url = try await deployToVercel(html: html, name: name, token: vercel)
        return Published(url: url, host: "Vercel")
    }

    // MARK: - Netlify

    /// Netlify's ZIP deploy: create a site, then post a zip of the files.
    ///
    /// Done in one call with `Content-Type: application/zip` against `/api/v1/sites`, which creates
    /// and deploys together — fewer round trips and no half-made site left behind if the second
    /// call fails.
    private static func deployToNetlify(html: String, token: String) async throws -> String {
        let zip = try makeZip(files: ["index.html": Data(html.utf8)])

        var req = URLRequest(url: URL(string: "https://api.netlify.com/api/v1/sites")!)
        req.httpMethod = "POST"
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        req.setValue("application/zip", forHTTPHeaderField: "Content-Type")
        req.httpBody = zip
        req.timeoutInterval = 120

        let (data, response) = try await URLSession.shared.data(for: req)
        let code = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(code) else {
            throw SiteError.api("Netlify", code, String(data: data, encoding: .utf8) ?? "")
        }
        let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        guard let url = (json?["ssl_url"] as? String) ?? (json?["url"] as? String) else {
            throw SiteError.api("Netlify", code, "no url in reply")
        }
        return url
    }

    // MARK: - Vercel

    private static func deployToVercel(html: String, name: String, token: String) async throws -> String {
        let slug = name.lowercased()
            .replacingOccurrences(of: "[^a-z0-9-]", with: "-", options: .regularExpression)
            .trimmingCharacters(in: CharacterSet(charactersIn: "-"))

        var req = URLRequest(url: URL(string: "https://api.vercel.com/v13/deployments")!)
        req.httpMethod = "POST"
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.timeoutInterval = 120
        req.httpBody = try JSONSerialization.data(withJSONObject: [
            "name": slug.isEmpty ? "slyos-site" : String(slug.prefix(40)),
            "files": [["file": "index.html", "data": html]],
            "projectSettings": ["framework": NSNull()],
            "target": "production"
        ])

        let (data, response) = try await URLSession.shared.data(for: req)
        let code = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(code) else {
            throw SiteError.api("Vercel", code, String(data: data, encoding: .utf8) ?? "")
        }
        let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        guard let host = json?["url"] as? String else {
            throw SiteError.api("Vercel", code, "no url in reply")
        }
        return "https://\(host)"
    }

    // MARK: - Zip

    /// A minimal store-only ZIP.
    ///
    /// Foundation has no zip writer, and pulling in a library to compress one HTML file would be
    /// absurd. Store-only (no compression) is a valid ZIP that every unpacker accepts, and the file
    /// is a few kilobytes either way.
    private static func makeZip(files: [String: Data]) throws -> Data {
        var archive = Data()
        var central = Data()
        var offset: UInt32 = 0

        for (name, contents) in files {
            let nameBytes = Data(name.utf8)
            let crc = crc32(contents)

            func local() -> Data {
                var d = Data()
                d.append(contentsOf: [0x50, 0x4B, 0x03, 0x04])          // local file header
                d.append(le16(20)); d.append(le16(0)); d.append(le16(0)) // version, flags, method
                d.append(le16(0)); d.append(le16(0))                     // time, date
                d.append(le32(crc))
                d.append(le32(UInt32(contents.count)))                   // compressed
                d.append(le32(UInt32(contents.count)))                   // uncompressed
                d.append(le16(UInt16(nameBytes.count))); d.append(le16(0))
                d.append(nameBytes)
                d.append(contents)
                return d
            }

            let entry = local()
            archive.append(entry)

            central.append(contentsOf: [0x50, 0x4B, 0x01, 0x02])        // central directory
            central.append(le16(20)); central.append(le16(20))
            central.append(le16(0)); central.append(le16(0))
            central.append(le16(0)); central.append(le16(0))
            central.append(le32(crc))
            central.append(le32(UInt32(contents.count)))
            central.append(le32(UInt32(contents.count)))
            central.append(le16(UInt16(nameBytes.count)))
            central.append(le16(0)); central.append(le16(0))
            central.append(le16(0)); central.append(le16(0))
            central.append(le32(0))
            central.append(le32(offset))
            central.append(nameBytes)

            offset += UInt32(entry.count)
        }

        let centralOffset = UInt32(archive.count)
        archive.append(central)
        archive.append(contentsOf: [0x50, 0x4B, 0x05, 0x06])            // end of central directory
        archive.append(le16(0)); archive.append(le16(0))
        archive.append(le16(UInt16(files.count))); archive.append(le16(UInt16(files.count)))
        archive.append(le32(UInt32(central.count)))
        archive.append(le32(centralOffset))
        archive.append(le16(0))
        return archive
    }

    private static func le16(_ v: UInt16) -> Data { withUnsafeBytes(of: v.littleEndian) { Data($0) } }
    private static func le32(_ v: UInt32) -> Data { withUnsafeBytes(of: v.littleEndian) { Data($0) } }

    private static func crc32(_ data: Data) -> UInt32 {
        var table = [UInt32](repeating: 0, count: 256)
        for i in 0..<256 {
            var c = UInt32(i)
            for _ in 0..<8 { c = (c & 1) != 0 ? (0xEDB88320 ^ (c >> 1)) : (c >> 1) }
            table[i] = c
        }
        var crc: UInt32 = 0xFFFFFFFF
        for byte in data { crc = table[Int((crc ^ UInt32(byte)) & 0xFF)] ^ (crc >> 8) }
        return crc ^ 0xFFFFFFFF
    }
}
