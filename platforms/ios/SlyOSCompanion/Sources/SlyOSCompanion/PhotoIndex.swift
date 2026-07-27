import Foundation
import Photos
import UIKit
import Vision

/// Photos, understood and made findable — ported from Android's `PhotoIndex`.
///
/// On a phone this is the largest body of the owner's own life by a wide margin, and until now the
/// brain could not see a single frame of it. "Find the photo of the parking receipt", "what was the
/// wifi password on that sign", "when did I last see Carlos" — all answerable from a library nobody
/// was reading.
///
/// **Entirely on-device.** Vision does classification, text, faces and barcodes locally, so this
/// costs nothing, needs no API key, and no photograph ever leaves the phone. That last part is not
/// a footnote: an app that uploads someone's camera roll to a model provider is a different product
/// with a different privacy story, and not one worth selling.
///
/// Results go into the ordinary brain rather than a table of their own. A photo whose text is in
/// `SlyStore` is found by keyword search, ranked by the same bm25, embedded by the same worker and
/// recalled by the same context builder — where a private table would need every one of those
/// rebuilt against it.
enum PhotoIndex {

    private static let watermarkKey = "photos.watermark"
    private static let countKey = "photos.indexed"

    /// How many photographs the brain has read.
    static var count: Int { SharedContainer.defaults.integer(forKey: countKey) }

    /// Whether the library can be read at all.
    static var isAuthorised: Bool {
        let status = PHPhotoLibrary.authorizationStatus(for: .readWrite)
        return status == .authorized || status == .limited
    }

    // MARK: - Indexing

    /// Read newly-taken photographs into the brain, within a time budget.
    ///
    /// Time-budgeted rather than count-budgeted, for the reason Android's embedding worker had to
    /// be rewritten: a fixed count against a library of forty thousand photographs is a job that
    /// never finishes, and one that runs "300 every fifteen minutes" takes a day and a half before
    /// it is any use. A budget in seconds does whatever it can in the time available and picks up
    /// exactly where it stopped.
    @discardableResult
    static func indexRecent(seconds: TimeInterval = 20) async -> Int {
        guard isAuthorised else { return 0 }

        let deadline = Date.now.addingTimeInterval(seconds)
        let since = SharedContainer.defaults.double(forKey: watermarkKey)
        let watermark = since > 0 ? Date(timeIntervalSince1970: since)
                                  : Calendar.current.date(byAdding: .month, value: -6, to: .now)!

        let options = PHFetchOptions()
        options.predicate = NSPredicate(format: "creationDate > %@ AND mediaType == %d",
                                        watermark as NSDate, PHAssetMediaType.image.rawValue)
        options.sortDescriptors = [NSSortDescriptor(key: "creationDate", ascending: true)]
        let assets = PHAsset.fetchAssets(with: options)
        guard assets.count > 0 else { return 0 }

        var read = 0
        var newest = watermark

        for index in 0..<assets.count {
            if Date.now > deadline { break }
            let asset = assets.object(at: index)
            guard let image = await load(asset) else { continue }

            if let memory = await describe(image, asset: asset) {
                SlyStore.shared.insert(kind: "photo", title: memory.title, body: memory.body,
                                       source: "Photos", date: asset.creationDate ?? .now)
                read += 1
            }
            // Advanced even when a photo yields nothing worth keeping — otherwise every run starts
            // again on the same blank sky and never reaches the receipt behind it.
            if let taken = asset.creationDate, taken > newest { newest = taken }
        }

        SharedContainer.defaults.set(newest.timeIntervalSince1970, forKey: watermarkKey)
        SharedContainer.defaults.set(count + read, forKey: countKey)
        return read
    }

    // MARK: - Understanding one photograph

    /// What is worth remembering about a photograph, or nothing.
    ///
    /// Most of a camera roll is not worth a row. A photograph with no text, no recognisable subject
    /// above threshold and no faces is a sunset — indexing it as "outdoor, sky" makes recall worse,
    /// not better, because it dilutes every honest match.
    private static func describe(_ image: UIImage, asset: PHAsset) async -> (title: String, body: String)? {
        guard let cgImage = image.cgImage else { return nil }
        let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])

        let text = VNRecognizeTextRequest()
        text.recognitionLevel = .accurate
        text.usesLanguageCorrection = true
        let classify = VNClassifyImageRequest()
        let faces = VNDetectFaceRectanglesRequest()
        let barcodes = VNDetectBarcodesRequest()

        try? handler.perform([text, classify, faces, barcodes])

        let words = (text.results ?? [])
            .compactMap { $0.topCandidates(1).first?.string }
            .joined(separator: " ")
            .trimmingCharacters(in: .whitespacesAndNewlines)

        // 0.7 rather than a lower bar on purpose: Vision returns a thousand labels per image with a
        // confidence for each, and everything below this is the classifier hedging.
        let labels = (classify.results ?? [])
            .filter { $0.confidence > 0.7 }
            .prefix(6)
            .map { $0.identifier.replacingOccurrences(of: "_", with: " ") }

        let people = faces.results?.count ?? 0
        let codes = (barcodes.results ?? []).compactMap { $0.payloadStringValue }

        // Text is what makes a photograph findable — a receipt, a sign, a whiteboard, a screenshot.
        // Without any, it has to earn its row on subject alone.
        guard words.count > 8 || !labels.isEmpty || people > 0 || !codes.isEmpty else { return nil }

        var parts: [String] = []
        if !labels.isEmpty { parts.append(labels.joined(separator: ", ")) }
        if people > 0 { parts.append(people == 1 ? "1 person" : "\(people) people") }
        if !codes.isEmpty { parts.append("code: " + codes.joined(separator: " ")) }
        if !words.isEmpty { parts.append("text in it: \(words.prefix(1_200))") }

        var title = labels.first ?? "Photo"
        if people > 0 && labels.isEmpty { title = "Photo of \(people == 1 ? "someone" : "people")" }
        if let place = asset.location { parts.append(placeLine(place)) }

        return (title: title, body: parts.joined(separator: " · "))
    }

    private static func placeLine(_ location: CLLocation) -> String {
        // Coordinates, not a lookup. Reverse geocoding every photograph would be thousands of
        // network calls for a library, and Apple rate-limits it into uselessness well before that.
        String(format: "taken at %.4f, %.4f", location.coordinate.latitude,
               location.coordinate.longitude)
    }

    /// A version small enough for Vision to be quick on and large enough for text to survive.
    private static func load(_ asset: PHAsset) async -> UIImage? {
        await withCheckedContinuation { continuation in
            let options = PHImageRequestOptions()
            options.isSynchronous = false
            options.deliveryMode = .highQualityFormat
            options.resizeMode = .exact
            // Local only. Pulling a library down from iCloud would burn the owner's data allowance
            // on a background job they never asked for.
            options.isNetworkAccessAllowed = false

            PHImageManager.default().requestImage(
                for: asset,
                targetSize: CGSize(width: 1_600, height: 1_600),
                contentMode: .aspectFit,
                options: options
            ) { image, _ in continuation.resume(returning: image) }
        }
    }

    // MARK: - Asking for access

    @discardableResult
    static func requestAccess() async -> Bool {
        let status = await PHPhotoLibrary.requestAuthorization(for: .readWrite)
        return status == .authorized || status == .limited
    }

    /// Forget everything read from the library, so the owner can genuinely undo this.
    static func forget() {
        SlyStore.shared.deleteBySource("Photos")
        SharedContainer.defaults.removeObject(forKey: watermarkKey)
        SharedContainer.defaults.removeObject(forKey: countKey)
    }
}
