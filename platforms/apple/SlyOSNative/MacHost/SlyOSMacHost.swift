import Cocoa
import ApplicationServices
import WebKit

final class SlyOSWindow: NSWindow {
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { true }
}

final class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKScriptMessageHandler {
    private var window: NSWindow?
    private var webView: WKWebView?
    private var deviceAgent: Process?
    private var agentLogHandle: FileHandle?
    private var agentRestartCount = 0
    private var terminating = false

    func applicationDidFinishLaunching(_ notification: Notification) {
        logLocal("host.start")
        logLocal("permissions.main screen=\(CGPreflightScreenCaptureAccess()) accessibility=\(AXIsProcessTrusted())")
        NSApp.setActivationPolicy(.regular)
        NSApp.mainMenu = makeMenu()
        startDeviceAgent()

        let configuration = WKWebViewConfiguration()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        configuration.websiteDataStore = .default()
        configuration.userContentController.add(self, name: "slyosLog")
        configuration.userContentController.add(self, name: "slyosPermissions")
        configuration.userContentController.addUserScript(
            WKUserScript(
                source: """
                (() => {
                  const report = (kind, value) => {
                    const detail = `${kind}: ${String(value)}`;
                    window.__slyosLastError = detail;
                    try { window.webkit.messageHandlers.slyosLog.postMessage(detail); } catch (_) {}
                  };
                  window.addEventListener('error', event => report('error', `${event.message} @ ${event.filename}:${event.lineno}:${event.colno}`));
                  window.addEventListener('unhandledrejection', event => report('rejection', event.reason?.stack || event.reason));
                  window.slyosRequestMacPermissions = () => {
                    try { window.webkit.messageHandlers.slyosPermissions.postMessage('all'); } catch (_) {}
                  };
                })();
                """,
                injectionTime: .atDocumentStart,
                forMainFrameOnly: true
            )
        )

        let screenFrame = NSScreen.main?.frame ?? NSRect(x: 0, y: 0, width: 1440, height: 900)
        let contentBounds = NSRect(origin: .zero, size: screenFrame.size)
        let container = NSView(frame: contentBounds)
        container.wantsLayer = true
        container.layer?.backgroundColor = NSColor(red: 0.957, green: 0.937, blue: 0.902, alpha: 1).cgColor

        let webView = WKWebView(frame: contentBounds, configuration: configuration)
        webView.setValue(false, forKey: "drawsBackground")
        webView.navigationDelegate = self
        if #available(macOS 13.3, *) {
            webView.isInspectable = true
        }
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
        window.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary]
        window.contentView = container
        window.setFrame(screenFrame, display: true)
        window.level = .normal
        window.makeKeyAndOrderFront(nil)
        window.orderFrontRegardless()
        self.window = window

        applySlyOSPresentation()
        loadBundledApp(into: webView)
        DispatchQueue.main.async {
            self.showWindow()
        }
    }

    func applicationDidBecomeActive(_ notification: Notification) {
        showWindow()
        publishPermissionStatus(label: "active")
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        showWindow()
        return true
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        true
    }

    func applicationWillTerminate(_ notification: Notification) {
        terminating = true
        logLocal("host.stop")
        webView?.configuration.userContentController.removeScriptMessageHandler(forName: "slyosLog")
        webView?.configuration.userContentController.removeScriptMessageHandler(forName: "slyosPermissions")
        deviceAgent?.terminate()
        deviceAgent = nil
        try? agentLogHandle?.close()
        agentLogHandle = nil
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        if message.name == "slyosPermissions" {
            requestMacPermissions()
            return
        }
        NSLog("SlyOS web: %@", String(describing: message.body))
        logLocal("web \(String(describing: message.body))")
    }

    private func requestMacPermissions() {
        let screen = CGPreflightScreenCaptureAccess() || CGRequestScreenCaptureAccess()
        let accessibilityOptions = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary
        let accessibility = AXIsProcessTrustedWithOptions(accessibilityOptions)
        logLocal("permissions.requested screen=\(screen) accessibility=\(accessibility)")
        for delay in [0.5, 2.0, 5.0] {
            DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
                self?.publishPermissionStatus(label: "request-\(delay)s")
            }
        }
    }

    private func publishPermissionStatus(label: String) {
        let screen = CGPreflightScreenCaptureAccess()
        let accessibility = AXIsProcessTrusted()
        logLocal("permissions.\(label) screen=\(screen) accessibility=\(accessibility)")
        let script = """
        window.dispatchEvent(new CustomEvent('slyos-mac-permissions-changed', {
          detail: { screenRecording: \(screen ? "true" : "false"), accessibility: \(accessibility ? "true" : "false") }
        }));
        """
        webView?.evaluateJavaScript(script)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        for delay in [0.0, 2.0, 5.0, 12.0] {
            DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self, weak webView] in
                guard let self, let webView else { return }
                self.sampleWebHealth(webView, label: "after-\(Int(delay))s")
            }
        }
    }

    private func sampleWebHealth(_ webView: WKWebView, label: String) {
        let script = """
        (() => {
          try {
            const memory = JSON.parse(localStorage.getItem('slyos:memory') || '[]');
            const diagnostics = JSON.parse(localStorage.getItem('slyos:diagnostics') || '[]');
            return JSON.stringify({
              readyState: document.readyState,
              href: location.href,
              appChildren: document.querySelector('#app')?.childElementCount ?? -1,
              appHtmlLength: document.querySelector('#app')?.innerHTML?.length ?? -1,
              bodyText: document.body?.innerText?.slice(0, 240) ?? '',
              screen: window.__slyosScreen || '',
              lastError: window.__slyosLastError || '',
              memoryCount: Array.isArray(memory) ? memory.length : -1,
              diagnosticCount: Array.isArray(diagnostics) ? diagnostics.length : -1
            });
          } catch (error) {
            return JSON.stringify({ healthError: String(error), lastError: window.__slyosLastError || '' });
          }
        })()
        """
        webView.evaluateJavaScript(script) { result, error in
            if let error {
                NSLog("SlyOS DOM health check failed: %@", error.localizedDescription)
                self.logLocal("dom.\(label).error \(error.localizedDescription)")
            } else {
                NSLog("SlyOS DOM health: %@", String(describing: result ?? "nil"))
                self.logLocal("dom.\(label).ok \(String(describing: result ?? "nil"))")
            }
        }
    }

    private func showWindow() {
        guard let window else { return }
        applySlyOSPresentation()
        window.setFrame(NSScreen.main?.frame ?? window.frame, display: true)
        window.makeKeyAndOrderFront(nil)
        window.orderFrontRegardless()
        NSApp.activate(ignoringOtherApps: true)
    }

    private func applySlyOSPresentation() {
        NSApp.presentationOptions = [.hideDock, .hideMenuBar]
    }

    private func startDeviceAgent() {
        guard let executable = Bundle.main.executableURL?.deletingLastPathComponent().appendingPathComponent("SlyOSDeviceAgent") else {
            return
        }
        terminateStaleDeviceAgent(at: executable)
        let process = Process()
        process.executableURL = executable
        process.environment = ProcessInfo.processInfo.environment.merging([
            "SLYOS_AGENT_TOKEN": "slyos-local-dev",
            "SLYOS_ENABLE_DEVICE_CONTROL": "1",
            "SLYOS_ALLOWED_ROOTS": [
                FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Desktop").path,
                FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Documents").path,
                FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Downloads").path
            ].joined(separator: ":")
        ]) { _, bundled in bundled }
        process.terminationHandler = { [weak self, weak process] finished in
            guard let self else { return }
            self.logLocal("agent.stopped status=\(finished.terminationStatus) reason=\(finished.terminationReason.rawValue)")
            DispatchQueue.main.async {
                if let process, self.deviceAgent === process { self.deviceAgent = nil }
                guard !self.terminating, self.agentRestartCount < 3 else { return }
                self.agentRestartCount += 1
                self.logLocal("agent.restart attempt=\(self.agentRestartCount)")
                DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
                    self.startDeviceAgent()
                }
            }
        }
        let consoleUrl = diagnosticsDirectory().appendingPathComponent("device-agent-console.log")
        FileManager.default.createFile(atPath: consoleUrl.path, contents: nil)
        if let handle = try? FileHandle(forWritingTo: consoleUrl) {
            _ = try? handle.seekToEnd()
            process.standardOutput = handle
            process.standardError = handle
            agentLogHandle = handle
        } else {
            process.standardOutput = FileHandle.nullDevice
            process.standardError = FileHandle.nullDevice
        }
        do {
            try process.run()
            deviceAgent = process
            logLocal("agent.started pid=\(process.processIdentifier)")
        } catch {
            NSLog("SlyOS device agent failed to start: %@", error.localizedDescription)
            logLocal("agent.error \(error.localizedDescription)")
        }
    }

    private func terminateStaleDeviceAgent(at executable: URL) {
        let killer = Process()
        killer.executableURL = URL(fileURLWithPath: "/usr/bin/pkill")
        killer.arguments = ["-f", executable.path]
        killer.standardOutput = FileHandle.nullDevice
        killer.standardError = FileHandle.nullDevice
        do {
            try killer.run()
            killer.waitUntilExit()
            if killer.terminationStatus == 0 {
                logLocal("agent.stale-terminated")
                waitForStaleDeviceAgentToExit(at: executable)
            }
        } catch {
            logLocal("agent.stale-check-error \(error.localizedDescription)")
        }
    }

    private func waitForStaleDeviceAgentToExit(at executable: URL) {
        for _ in 0..<20 {
            let probe = Process()
            probe.executableURL = URL(fileURLWithPath: "/usr/bin/pgrep")
            probe.arguments = ["-f", executable.path]
            probe.standardOutput = FileHandle.nullDevice
            probe.standardError = FileHandle.nullDevice
            do {
                try probe.run()
                probe.waitUntilExit()
                if probe.terminationStatus != 0 { return }
            } catch {
                logLocal("agent.stale-wait-error \(error.localizedDescription)")
                return
            }
            Thread.sleep(forTimeInterval: 0.1)
        }
        logLocal("agent.stale-wait-timeout")
    }

    private func diagnosticsDirectory() -> URL {
        let url = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Library/Logs/SlyOS", isDirectory: true)
        try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }

    private func logLocal(_ message: String) {
        let url = diagnosticsDirectory().appendingPathComponent("host.log")
        let line = "\(ISO8601DateFormatter().string(from: Date())) \(message)\n"
        guard let data = line.data(using: .utf8) else { return }
        if !FileManager.default.fileExists(atPath: url.path) {
            FileManager.default.createFile(atPath: url.path, contents: data)
            return
        }
        guard let handle = try? FileHandle(forWritingTo: url) else { return }
        defer { try? handle.close() }
        _ = try? handle.seekToEnd()
        try? handle.write(contentsOf: data)
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
            URLQueryItem(name: "native", value: "macos")
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
