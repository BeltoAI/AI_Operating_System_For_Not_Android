import SwiftUI
import WebKit

@main
struct SlyOSNativeApp: App {
    var body: some Scene {
        WindowGroup {
            SlyOSWebShell()
                .ignoresSafeArea()
        }
        #if os(macOS)
        .windowStyle(.hiddenTitleBar)
        #endif
    }
}

struct SlyOSWebShell {
    fileprivate func webViewConfiguration() -> WKWebViewConfiguration {
        let configuration = WKWebViewConfiguration()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        configuration.websiteDataStore = .default()
        return configuration
    }

    fileprivate func loadBundledApp(into webView: WKWebView) {
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
        #if os(macOS)
        let platform = "macos"
        #else
        let platform = "ios"
        #endif
        components.queryItems = [
            URLQueryItem(name: "native", value: platform),
            URLQueryItem(name: "screen", value: "setup")
        ]
        return components.url ?? url
    }
}

#if os(iOS)
extension SlyOSWebShell: UIViewRepresentable {
    func makeUIView(context: Context) -> WKWebView {
        let webView = WKWebView(frame: .zero, configuration: webViewConfiguration())
        webView.isOpaque = false
        webView.backgroundColor = UIColor(red: 0.957, green: 0.937, blue: 0.902, alpha: 1)
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        loadBundledApp(into: webView)
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}
}
#elseif os(macOS)
extension SlyOSWebShell: NSViewRepresentable {
    func makeNSView(context: Context) -> WKWebView {
        let webView = WKWebView(frame: .zero, configuration: webViewConfiguration())
        webView.setValue(false, forKey: "drawsBackground")
        loadBundledApp(into: webView)
        return webView
    }

    func updateNSView(_ nsView: WKWebView, context: Context) {}
}
#endif
