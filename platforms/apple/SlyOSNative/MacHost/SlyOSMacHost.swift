import Cocoa
import WebKit

final class SlyOSWindow: NSWindow {
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { true }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    private var window: NSWindow?
    private var webView: WKWebView?

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.regular)
        NSApp.mainMenu = makeMenu()

        let configuration = WKWebViewConfiguration()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        configuration.websiteDataStore = .default()

        let screenFrame = NSScreen.main?.frame ?? NSRect(x: 0, y: 0, width: 1440, height: 900)
        let contentBounds = NSRect(origin: .zero, size: screenFrame.size)
        let container = NSView(frame: contentBounds)
        container.wantsLayer = true
        container.layer?.backgroundColor = NSColor(red: 0.957, green: 0.937, blue: 0.902, alpha: 1).cgColor

        let webView = WKWebView(frame: contentBounds, configuration: configuration)
        webView.setValue(false, forKey: "drawsBackground")
        webView.translatesAutoresizingMaskIntoConstraints = false
        container.addSubview(webView)
        NSLayoutConstraint.activate([
            webView.leadingAnchor.constraint(equalTo: container.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: container.trailingAnchor),
            webView.topAnchor.constraint(equalTo: container.topAnchor),
            webView.bottomAnchor.constraint(equalTo: container.bottomAnchor)
        ])
        self.webView = webView

        let window = SlyOSWindow(
            contentRect: screenFrame,
            styleMask: [.borderless, .resizable],
            backing: .buffered,
            defer: false
        )
        window.title = "SlyOS"
        window.titleVisibility = .hidden
        window.titlebarAppearsTransparent = true
        window.backgroundColor = NSColor(red: 0.957, green: 0.937, blue: 0.902, alpha: 1)
        window.isOpaque = true
        window.isReleasedWhenClosed = false
        window.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary, .ignoresCycle]
        window.contentView = container
        window.setFrame(screenFrame, display: true)
        window.level = NSWindow.Level(rawValue: Int(CGWindowLevelForKey(.screenSaverWindow)))
        window.makeKeyAndOrderFront(nil)
        window.orderFrontRegardless()
        self.window = window

        NSApp.presentationOptions = [.autoHideDock, .autoHideMenuBar]
        loadBundledApp(into: webView)
        DispatchQueue.main.async {
            window.makeKeyAndOrderFront(nil)
            window.orderFrontRegardless()
            NSRunningApplication.current.activate(options: [.activateAllWindows])
        }
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        true
    }

    private func loadBundledApp(into webView: WKWebView) {
        guard
            let rawIndexUrl = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "WebApp"),
            let rootUrl = Bundle.main.url(forResource: "WebApp", withExtension: nil)
        else {
            webView.loadHTMLString(
                "<main style='font:17px -apple-system;padding:32px'>Missing bundled SlyOS WebApp resources.</main>",
                baseURL: nil
            )
            return
        }
        let indexUrl = appendingNativeQuery(to: rawIndexUrl)
        webView.loadFileURL(indexUrl, allowingReadAccessTo: rootUrl)
    }

    private func appendingNativeQuery(to url: URL) -> URL {
        guard var components = URLComponents(url: url, resolvingAgainstBaseURL: false) else {
            return url
        }
        components.queryItems = [
            URLQueryItem(name: "native", value: "macos"),
            URLQueryItem(name: "screen", value: "home")
        ]
        return components.url ?? url
    }

    private func makeMenu() -> NSMenu {
        let mainMenu = NSMenu()
        let appMenuItem = NSMenuItem()
        let appMenu = NSMenu()
        appMenu.addItem(
            NSMenuItem(
                title: "Quit SlyOS",
                action: #selector(NSApplication.terminate(_:)),
                keyEquivalent: "q"
            )
        )
        appMenuItem.submenu = appMenu
        mainMenu.addItem(appMenuItem)
        return mainMenu
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.run()
