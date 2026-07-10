import AppKit
import Foundation

let repoRoot = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
let assetCatalogRoot = repoRoot.appendingPathComponent("platforms/apple/SlyOSNative/Assets.xcassets")
let assetCatalog = assetCatalogRoot.appendingPathComponent("AppIcon.appiconset")
let macIconset = repoRoot.appendingPathComponent("platforms/apple/SlyOSNative/Resources/SlyOS.iconset")
let webIcons = repoRoot.appendingPathComponent("platforms/desktop-shell/public/icons")

try? FileManager.default.removeItem(at: assetCatalog)
try? FileManager.default.removeItem(at: macIconset)
try FileManager.default.createDirectory(at: assetCatalogRoot, withIntermediateDirectories: true)
try FileManager.default.createDirectory(at: assetCatalog, withIntermediateDirectories: true)
try FileManager.default.createDirectory(at: macIconset, withIntermediateDirectories: true)
try FileManager.default.createDirectory(at: webIcons, withIntermediateDirectories: true)

let iosImages: [(idiom: String, scale: String, size: String, pixels: Int, filename: String)] = [
    ("iphone", "2x", "20x20", 40, "iphone-notification-20@2x.png"),
    ("iphone", "3x", "20x20", 60, "iphone-notification-20@3x.png"),
    ("iphone", "2x", "29x29", 58, "iphone-settings-29@2x.png"),
    ("iphone", "3x", "29x29", 87, "iphone-settings-29@3x.png"),
    ("iphone", "2x", "40x40", 80, "iphone-spotlight-40@2x.png"),
    ("iphone", "3x", "40x40", 120, "iphone-spotlight-40@3x.png"),
    ("iphone", "2x", "60x60", 120, "iphone-app-60@2x.png"),
    ("iphone", "3x", "60x60", 180, "iphone-app-60@3x.png"),
    ("ipad", "1x", "20x20", 20, "ipad-notification-20@1x.png"),
    ("ipad", "2x", "20x20", 40, "ipad-notification-20@2x.png"),
    ("ipad", "1x", "29x29", 29, "ipad-settings-29@1x.png"),
    ("ipad", "2x", "29x29", 58, "ipad-settings-29@2x.png"),
    ("ipad", "1x", "40x40", 40, "ipad-spotlight-40@1x.png"),
    ("ipad", "2x", "40x40", 80, "ipad-spotlight-40@2x.png"),
    ("ipad", "1x", "76x76", 76, "ipad-app-76@1x.png"),
    ("ipad", "2x", "76x76", 152, "ipad-app-76@2x.png"),
    ("ipad", "2x", "83.5x83.5", 167, "ipad-pro-app-83.5@2x.png"),
    ("ios-marketing", "1x", "1024x1024", 1024, "ios-marketing-1024.png"),
    ("mac", "1x", "16x16", 16, "mac-16@1x.png"),
    ("mac", "2x", "16x16", 32, "mac-16@2x.png"),
    ("mac", "1x", "32x32", 32, "mac-32@1x.png"),
    ("mac", "2x", "32x32", 64, "mac-32@2x.png"),
    ("mac", "1x", "128x128", 128, "mac-128@1x.png"),
    ("mac", "2x", "128x128", 256, "mac-128@2x.png"),
    ("mac", "1x", "256x256", 256, "mac-256@1x.png"),
    ("mac", "2x", "256x256", 512, "mac-256@2x.png"),
    ("mac", "1x", "512x512", 512, "mac-512@1x.png"),
    ("mac", "2x", "512x512", 1024, "mac-512@2x.png")
]

for image in iosImages {
    try writeIcon(size: image.pixels, to: assetCatalog.appendingPathComponent(image.filename))
}

let iconsetImages: [(Int, String)] = [
    (16, "icon_16x16.png"),
    (32, "icon_16x16@2x.png"),
    (32, "icon_32x32.png"),
    (64, "icon_32x32@2x.png"),
    (128, "icon_128x128.png"),
    (256, "icon_128x128@2x.png"),
    (256, "icon_256x256.png"),
    (512, "icon_256x256@2x.png"),
    (512, "icon_512x512.png"),
    (1024, "icon_512x512@2x.png")
]

for (pixels, filename) in iconsetImages {
    try writeIcon(size: pixels, to: macIconset.appendingPathComponent(filename))
}

try writeIcon(size: 192, to: webIcons.appendingPathComponent("slyos-icon-192.png"))
try writeIcon(size: 512, to: webIcons.appendingPathComponent("slyos-icon-512.png"))
try writeIcon(size: 512, to: webIcons.appendingPathComponent("slyos-maskable-512.png"), maskable: true)

let contents: [String: Any] = [
    "images": iosImages.map { image in
        [
            "idiom": image.idiom,
            "scale": image.scale,
            "size": image.size,
            "filename": image.filename
        ]
    },
    "info": [
        "author": "xcode",
        "version": 1
    ]
]

let contentsData = try JSONSerialization.data(withJSONObject: contents, options: [.prettyPrinted, .sortedKeys])
try contentsData.write(to: assetCatalog.appendingPathComponent("Contents.json"))

let rootContentsData = try JSONSerialization.data(
    withJSONObject: ["info": ["author": "xcode", "version": 1]],
    options: [.prettyPrinted, .sortedKeys]
)
try rootContentsData.write(to: assetCatalogRoot.appendingPathComponent("Contents.json"))

print("Generated SlyOS native and web icons.")

func writeIcon(size: Int, to url: URL, maskable: Bool = false) throws {
    guard let bitmap = NSBitmapImageRep(
        bitmapDataPlanes: nil,
        pixelsWide: size,
        pixelsHigh: size,
        bitsPerSample: 8,
        samplesPerPixel: 4,
        hasAlpha: true,
        isPlanar: false,
        colorSpaceName: .deviceRGB,
        bitmapFormat: [.alphaFirst],
        bytesPerRow: 0,
        bitsPerPixel: 0
    ) else {
        throw NSError(domain: "SlyOSIcon", code: 1, userInfo: [NSLocalizedDescriptionKey: "Could not create bitmap"])
    }

    bitmap.size = NSSize(width: size, height: size)
    NSGraphicsContext.saveGraphicsState()
    let context = NSGraphicsContext(bitmapImageRep: bitmap)
    context?.shouldAntialias = true
    NSGraphicsContext.current = context
    drawIcon(in: NSRect(x: 0, y: 0, width: size, height: size), maskable: maskable)
    NSGraphicsContext.restoreGraphicsState()

    guard let data = bitmap.representation(using: .png, properties: [:]) else {
        throw NSError(domain: "SlyOSIcon", code: 1, userInfo: [NSLocalizedDescriptionKey: "Could not create PNG"])
    }
    try data.write(to: url)
}

func drawIcon(in rect: NSRect, maskable: Bool) {
    NSColor(red: 0.957, green: 0.937, blue: 0.902, alpha: 1).setFill()
    roundedRect(rect, radius: maskable ? rect.width * 0.18 : rect.width * 0.22).fill()

    NSColor(red: 0.965, green: 0.851, blue: 0.784, alpha: 1).setFill()
    circle(rect, radius: 0.305).fill()

    NSColor(red: 0.925, green: 0.373, blue: 0.165, alpha: 1).setFill()
    circle(rect, radius: 0.23).fill()

    let stroke = NSColor(red: 1.0, green: 0.973, blue: 0.937, alpha: 1)
    stroke.setStroke()

    let lineWidth = max(1.5, rect.width * 0.047)
    let coreOuter = NSRect(
        x: rect.midX - rect.width * 0.117,
        y: rect.midY - rect.height * 0.117,
        width: rect.width * 0.234,
        height: rect.height * 0.234
    )
    let coreInner = NSRect(
        x: rect.midX - rect.width * 0.051,
        y: rect.midY - rect.height * 0.051,
        width: rect.width * 0.102,
        height: rect.height * 0.102
    )

    strokePath(roundedRect(coreOuter, radius: rect.width * 0.019), width: lineWidth)
    strokePath(roundedRect(coreInner, radius: rect.width * 0.01), width: lineWidth * 0.82)

    let offsets: [CGFloat] = [-0.066, 0, 0.066]
    for offset in offsets {
        drawLine(from: point(rect, -0.156, offset), to: point(rect, -0.227, offset), width: lineWidth)
        drawLine(from: point(rect, 0.156, offset), to: point(rect, 0.227, offset), width: lineWidth)
        drawLine(from: point(rect, offset, -0.156), to: point(rect, offset, -0.227), width: lineWidth)
        drawLine(from: point(rect, offset, 0.156), to: point(rect, offset, 0.227), width: lineWidth)
    }
}

func roundedRect(_ rect: NSRect, radius: CGFloat) -> NSBezierPath {
    NSBezierPath(roundedRect: rect, xRadius: radius, yRadius: radius)
}

func circle(_ rect: NSRect, radius: CGFloat) -> NSBezierPath {
    let diameter = rect.width * radius * 2
    return NSBezierPath(ovalIn: NSRect(x: rect.midX - diameter / 2, y: rect.midY - diameter / 2, width: diameter, height: diameter))
}

func point(_ rect: NSRect, _ x: CGFloat, _ y: CGFloat) -> NSPoint {
    NSPoint(x: rect.midX + rect.width * x, y: rect.midY + rect.height * y)
}

func drawLine(from start: NSPoint, to end: NSPoint, width: CGFloat) {
    let path = NSBezierPath()
    path.lineCapStyle = .round
    path.lineJoinStyle = .round
    path.lineWidth = width
    path.move(to: start)
    path.line(to: end)
    path.stroke()
}

func strokePath(_ path: NSBezierPath, width: CGFloat) {
    path.lineCapStyle = .round
    path.lineJoinStyle = .round
    path.lineWidth = width
    path.stroke()
}
