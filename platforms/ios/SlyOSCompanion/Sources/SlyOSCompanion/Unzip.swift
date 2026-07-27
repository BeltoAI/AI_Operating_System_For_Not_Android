import Compression
import Foundation

/// Reading a .zip without a dependency.
///
/// Every service hands you your data as an archive — Instagram's is hundreds of `message_1.json`
/// files in nested per-conversation folders, LinkedIn's is a folder of CSVs — and iOS ships no API
/// that opens one. The file picker accepted `.zip` and the parser then read the raw archive bytes as
/// text, so choosing exactly the file the instructions told you to download reported "nothing
/// readable in that file".
///
/// Telling someone to unzip it first and pick the right JSON out of two hundred folders is not an
/// import feature, it is homework. So: a minimal reader for what these archives actually are —
/// stored or deflated entries, no encryption, no spanning.
enum Unzip {

    struct Entry {
        let path: String
        let data: Data

        var name: String { (path as NSString).lastPathComponent }
        var isDirectory: Bool { path.hasSuffix("/") }
    }

    enum ZipError: LocalizedError {
        case notAnArchive
        case unreadable

        var errorDescription: String? {
            switch self {
            case .notAnArchive: "That doesn't look like a zip file."
            case .unreadable:   "That archive couldn't be opened — it may be password-protected."
            }
        }
    }

    /// Every file in the archive whose name passes `keep`.
    ///
    /// Filtered during the walk rather than after: an Instagram export is mostly photos, and
    /// inflating a gigabyte of JPEGs to throw them away would use the memory the messages need.
    static func entries(of url: URL, keep: (String) -> Bool = { _ in true }) throws -> [Entry] {
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }

        guard let data = try? Data(contentsOf: url, options: .mappedIfSafe) else {
            throw ZipError.unreadable
        }
        return try entries(in: data, keep: keep)
    }

    static func entries(in data: Data, keep: (String) -> Bool = { _ in true }) throws -> [Entry] {
        let bytes = [UInt8](data)
        guard let eocd = endOfCentralDirectory(in: bytes) else { throw ZipError.notAnArchive }

        var out: [Entry] = []
        var offset = eocd.directoryOffset

        for _ in 0..<eocd.entryCount {
            guard offset + 46 <= bytes.count,
                  read32(bytes, offset) == 0x0201_4b50 else { break }

            let method = Int(read16(bytes, offset + 10))
            let compressedSize = Int(read32(bytes, offset + 20))
            let uncompressedSize = Int(read32(bytes, offset + 24))
            let nameLength = Int(read16(bytes, offset + 28))
            let extraLength = Int(read16(bytes, offset + 30))
            let commentLength = Int(read16(bytes, offset + 32))
            let localOffset = Int(read32(bytes, offset + 42))

            let nameStart = offset + 46
            guard nameStart + nameLength <= bytes.count else { break }
            let path = String(decoding: bytes[nameStart..<nameStart + nameLength], as: UTF8.self)

            offset = nameStart + nameLength + extraLength + commentLength

            // Skip directories, junk the exporters leave behind, and anything the caller doesn't
            // want — before paying to inflate it.
            guard !path.hasSuffix("/"),
                  !path.hasPrefix("__MACOSX/"),
                  !(path as NSString).lastPathComponent.hasPrefix("."),
                  keep(path) else { continue }

            if let payload = payload(bytes, localHeader: localOffset, method: method,
                                     compressed: compressedSize, uncompressed: uncompressedSize) {
                out.append(Entry(path: path, data: payload))
            }
        }
        return out
    }

    /// The bytes of one entry, inflated if it needs it.
    ///
    /// The central directory records the sizes, but the local header repeats the name and extra
    /// fields at *different* lengths — a reader that trusts the central directory's lengths here
    /// starts reading a few bytes into the data and inflates garbage.
    private static func payload(_ bytes: [UInt8], localHeader: Int, method: Int,
                                compressed: Int, uncompressed: Int) -> Data? {
        guard localHeader + 30 <= bytes.count,
              read32(bytes, localHeader) == 0x0403_4b50 else { return nil }

        let nameLength = Int(read16(bytes, localHeader + 26))
        let extraLength = Int(read16(bytes, localHeader + 28))
        let start = localHeader + 30 + nameLength + extraLength
        guard start + compressed <= bytes.count else { return nil }

        let raw = Data(bytes[start..<start + compressed])
        switch method {
        case 0:  return raw                                  // stored
        case 8:  return inflate(raw, expected: uncompressed)  // deflate
        default: return nil                                   // bzip2, lzma — no exporter emits these
        }
    }

    /// Raw DEFLATE. `COMPRESSION_ZLIB` is Apple's name for it and expects no zlib wrapper, which is
    /// exactly what a zip entry contains.
    private static func inflate(_ data: Data, expected: Int) -> Data? {
        // A zero uncompressed size means the real one is in a data descriptor after the payload;
        // a generous ceiling is cheaper than a second pass, and the decoder stops at the stream end.
        let capacity = expected > 0 ? expected : max(data.count * 8, 64 * 1024)
        var out = Data(count: capacity)

        let written = out.withUnsafeMutableBytes { destination -> Int in
            data.withUnsafeBytes { source -> Int in
                guard let dst = destination.bindMemory(to: UInt8.self).baseAddress,
                      let src = source.bindMemory(to: UInt8.self).baseAddress else { return 0 }
                return compression_decode_buffer(dst, capacity, src, data.count, nil, COMPRESSION_ZLIB)
            }
        }
        guard written > 0 else { return nil }
        return out.prefix(written)
    }

    // MARK: - Central directory

    private struct EOCD {
        let entryCount: Int
        let directoryOffset: Int
    }

    /// The end-of-central-directory record, found by scanning backwards.
    ///
    /// It is the last thing in the file *unless* there is a trailing comment, so its position is
    /// only ever discovered by looking for the signature — which is why zip readers scan.
    private static func endOfCentralDirectory(in bytes: [UInt8]) -> EOCD? {
        guard bytes.count >= 22 else { return nil }
        // 22 bytes minimum, plus a comment that cannot exceed 65,535.
        let earliest = max(0, bytes.count - 22 - 65_535)
        var index = bytes.count - 22

        while index >= earliest {
            if read32(bytes, index) == 0x0605_4b50 {
                return EOCD(entryCount: Int(read16(bytes, index + 10)),
                            directoryOffset: Int(read32(bytes, index + 16)))
            }
            index -= 1
        }
        return nil
    }

    // Little-endian, and bounds-checked: a truncated download is a normal thing to be handed, and
    // it must come back as "couldn't open that" rather than as a crash.
    private static func read16(_ b: [UInt8], _ i: Int) -> UInt16 {
        guard i + 1 < b.count else { return 0 }
        return UInt16(b[i]) | UInt16(b[i + 1]) << 8
    }

    private static func read32(_ b: [UInt8], _ i: Int) -> UInt32 {
        guard i + 3 < b.count else { return 0 }
        return UInt32(b[i]) | UInt32(b[i + 1]) << 8 | UInt32(b[i + 2]) << 16 | UInt32(b[i + 3]) << 24
    }
}
