import SwiftUI
@preconcurrency import WebKit
#if os(iOS)
import AVFoundation
import AppIntents
@preconcurrency import Contacts
@preconcurrency import EventKit
import UIKit
#if canImport(FoundationModels)
import FoundationModels
#endif
import Speech
#endif

@main
struct SlyOSNativeApp: App {
    var body: some Scene {
        WindowGroup {
            SlyOSWebShell()
                .ignoresSafeArea()
                #if os(iOS)
                .statusBarHidden(true)
                .persistentSystemOverlays(.hidden)
                #endif
        }
        #if os(macOS)
        .windowStyle(.hiddenTitleBar)
        #endif
    }
}

@MainActor
struct SlyOSWebShell {
    fileprivate func webViewConfiguration() -> WKWebViewConfiguration {
        let configuration = WKWebViewConfiguration()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        configuration.websiteDataStore = .default()
        #if os(iOS)
        configuration.allowsInlineMediaPlayback = true
        configuration.mediaTypesRequiringUserActionForPlayback = []
        #endif
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
            URLQueryItem(name: "native", value: platform)
        ]
        return components.url ?? url
    }
}

#if os(iOS)
extension SlyOSWebShell: UIViewRepresentable {
    final class Coordinator: NSObject, WKUIDelegate, WKNavigationDelegate, WKScriptMessageHandler {
        weak var webView: WKWebView?
        private let audioEngine = AVAudioEngine()
        private let recognizer = SFSpeechRecognizer(locale: Locale.current)
        private let contactStore = CNContactStore()
        private let eventStore = EKEventStore()
        private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
        private var recognitionTask: SFSpeechRecognitionTask?
        private var pendingPromptTimer: Timer?

        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            let payload = message.body as? [String: Any]
            if message.name == "slyosDevice" {
                handleDeviceAction(payload ?? [:])
                return
            }
            guard message.name == "slyosVoice" else { return }
            let action = payload?["action"] as? String ?? ""
            if action == "start" {
                requestSpeechAccessAndStart()
            } else if action == "stop" {
                stopListening()
            }
        }

        private func handleDeviceAction(_ payload: [String: Any]) {
            let requestId = payload["id"] as? String ?? UUID().uuidString
            let action = (payload["type"] as? String ?? "").lowercased()
            switch action {
            case "open_url":
                guard
                    let rawUrl = payload["url"] as? String,
                    let url = URL(string: rawUrl),
                    let scheme = url.scheme?.lowercased(),
                    ["http", "https", "mailto", "sms", "tel", "maps", "calshow"].contains(scheme)
                else {
                    sendDeviceResult(requestId, ok: false, message: "SlyOS blocked an invalid or unsupported URL.")
                    return
                }
                openNativeUrl(url, requestId: requestId, label: rawUrl)
            case "open_app":
                let app = (payload["app"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
                guard let route = nativeAppRoute(app), let url = URL(string: route) else {
                    sendDeviceResult(requestId, ok: false, message: "\(app.isEmpty ? "That app" : app) does not have an iOS handoff registered in SlyOS yet.")
                    return
                }
                openNativeUrl(url, requestId: requestId, label: app)
            case "set_clipboard":
                let text = payload["text"] as? String ?? ""
                UIPasteboard.general.string = text
                sendDeviceResult(requestId, ok: true, message: "Copied \(text.count) characters to the iPhone clipboard.")
            case "calendar_events":
                readCalendarEvents(payload, requestId: requestId)
            case "search_contacts":
                searchContacts(payload, requestId: requestId)
            case "create_calendar_event":
                createCalendarEvent(payload, requestId: requestId)
            case "reminder_items":
                readReminders(payload, requestId: requestId)
            case "create_reminder":
                createReminder(payload, requestId: requestId)
            case "run_shortcut":
                runShortcut(payload, requestId: requestId)
            case "export_file":
                exportFile(payload, requestId: requestId)
            case "device_status":
                readDeviceStatus(requestId: requestId)
            case "local_model_status":
                localModelStatus(requestId: requestId)
            case "local_model_generate":
                localModelGenerate(payload, requestId: requestId)
            case "wait":
                let rawMilliseconds = (payload["ms"] as? NSNumber)?.doubleValue ?? 300
                let milliseconds = min(10_000, max(50, rawMilliseconds))
                DispatchQueue.main.asyncAfter(deadline: .now() + milliseconds / 1_000) { [weak self] in
                    self?.sendDeviceResult(requestId, ok: true, message: "Waited \(Int(milliseconds)) ms.")
                }
            default:
                sendDeviceResult(requestId, ok: false, message: "The iPhone sandbox does not permit the \(action.isEmpty ? "requested" : action) device action.")
            }
        }

        private func nativeAppRoute(_ app: String) -> String? {
            let key = app.lowercased().replacingOccurrences(of: "  ", with: " ").trimmingCharacters(in: .whitespacesAndNewlines)
            let routes: [String: String] = [
                "safari": "https://www.google.com",
                "google": "https://www.google.com",
                "google chrome": "googlechrome://",
                "chrome": "googlechrome://",
                "notes": "mobilenotes://",
                "mail": "message://",
                "messages": "sms:",
                "phone": "tel:",
                "calendar": "calshow://",
                "maps": "maps://",
                "apple maps": "maps://",
                "youtube": "youtube://",
                "spotify": "spotify://",
                "shortcuts": "shortcuts://",
                "reminders": "x-apple-reminderkit://",
                "music": "music://",
                "settings": UIApplication.openSettingsURLString,
                "system settings": UIApplication.openSettingsURLString
            ]
            return routes[key]
        }

        private func openNativeUrl(_ url: URL, requestId: String, label: String) {
            UIApplication.shared.open(url, options: [:]) { [weak self] opened in
                self?.sendDeviceResult(
                    requestId,
                    ok: opened,
                    message: opened ? "Opened \(label) on iPhone." : "iOS could not open \(label). The app may not be installed."
                )
            }
        }

        private func readCalendarEvents(_ payload: [String: Any], requestId: String) {
            let startValue = payload["start"] as? String
            let endValue = payload["end"] as? String
            let limit = min(80, max(1, (payload["limit"] as? NSNumber)?.intValue ?? 40))
            eventStore.requestFullAccessToEvents { [weak self] granted, error in
                let permissionError = error?.localizedDescription
                Task { @MainActor [weak self] in
                    guard let self else { return }
                    guard granted else {
                        self.sendDeviceResult(requestId, ok: false, message: permissionError ?? "Calendar permission was not granted.")
                        return
                    }
                    let parser = ISO8601DateFormatter()
                    let start = startValue.flatMap(parser.date) ?? Date()
                    let fallbackEnd = Calendar.current.date(byAdding: .day, value: 7, to: start) ?? start.addingTimeInterval(604_800)
                    let end = endValue.flatMap(parser.date) ?? fallbackEnd
                    let predicate = self.eventStore.predicateForEvents(withStart: start, end: end, calendars: nil)
                    let formatter = ISO8601DateFormatter()
                    let events: [[String: String]] = self.eventStore.events(matching: predicate)
                        .sorted { $0.startDate < $1.startDate }
                        .prefix(limit)
                        .map { event in
                            [
                                "title": event.title ?? "Untitled event",
                                "start": formatter.string(from: event.startDate),
                                "end": formatter.string(from: event.endDate),
                                "location": event.location ?? "",
                                "calendar": event.calendar.title
                            ]
                        }
                    self.sendDeviceResult(
                        requestId,
                        ok: true,
                        message: "Read \(events.count) iPhone calendar event\(events.count == 1 ? "" : "s").",
                        result: ["events": events]
                    )
                }
            }
        }

        private func searchContacts(_ payload: [String: Any], requestId: String) {
            let query = (payload["query"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            guard !query.isEmpty else {
                sendDeviceResult(requestId, ok: false, message: "Add a contact name to search for.")
                return
            }
            let limit = min(30, max(1, (payload["limit"] as? NSNumber)?.intValue ?? 12))
            contactStore.requestAccess(for: .contacts) { [weak self] granted, error in
                let permissionError = error?.localizedDescription
                Task { @MainActor [weak self] in
                    guard let self else { return }
                    guard granted else {
                        self.sendDeviceResult(requestId, ok: false, message: permissionError ?? "Contacts permission was not granted.")
                        return
                    }
                    let keys: [CNKeyDescriptor] = [
                        CNContactFormatter.descriptorForRequiredKeys(for: .fullName),
                        CNContactOrganizationNameKey as CNKeyDescriptor,
                        CNContactPhoneNumbersKey as CNKeyDescriptor,
                        CNContactEmailAddressesKey as CNKeyDescriptor
                    ]
                    do {
                        let contacts = try self.contactStore.unifiedContacts(
                            matching: CNContact.predicateForContacts(matchingName: query),
                            keysToFetch: keys
                        ).prefix(limit).map { contact -> [String: Any] in
                            [
                                "name": CNContactFormatter.string(from: contact, style: .fullName) ?? "Unnamed contact",
                                "organization": contact.organizationName,
                                "phones": contact.phoneNumbers.map { $0.value.stringValue },
                                "emails": contact.emailAddresses.map { String($0.value) }
                            ]
                        }
                        self.sendDeviceResult(
                            requestId,
                            ok: true,
                            message: "Found \(contacts.count) matching iPhone contact\(contacts.count == 1 ? "" : "s").",
                            result: ["contacts": Array(contacts)]
                        )
                    } catch {
                        self.sendDeviceResult(requestId, ok: false, message: error.localizedDescription)
                    }
                }
            }
        }

        private func createCalendarEvent(_ payload: [String: Any], requestId: String) {
            let title = (payload["title"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            let startValue = payload["start"] as? String
            let endValue = payload["end"] as? String
            let location = payload["location"] as? String ?? ""
            let notes = payload["notes"] as? String ?? ""
            eventStore.requestFullAccessToEvents { [weak self] granted, error in
                let permissionError = error?.localizedDescription
                Task { @MainActor [weak self] in
                    guard let self else { return }
                    guard granted else {
                        self.sendDeviceResult(requestId, ok: false, message: permissionError ?? "Calendar permission was not granted.")
                        return
                    }
                    let parser = ISO8601DateFormatter()
                    guard
                        !title.isEmpty,
                        let start = startValue.flatMap(parser.date),
                        let end = endValue.flatMap(parser.date),
                        end > start,
                        let calendar = self.eventStore.defaultCalendarForNewEvents
                    else {
                        self.sendDeviceResult(requestId, ok: false, message: "The calendar draft is missing a valid title, time, or writable calendar.")
                        return
                    }
                    let event = EKEvent(eventStore: self.eventStore)
                    event.calendar = calendar
                    event.title = title
                    event.startDate = start
                    event.endDate = end
                    event.location = location
                    event.notes = notes
                    do {
                        try self.eventStore.save(event, span: .thisEvent, commit: true)
                        self.sendDeviceResult(
                            requestId,
                            ok: true,
                            message: "Added \(title) to \(calendar.title).",
                            result: ["eventIdentifier": event.eventIdentifier ?? "", "calendar": calendar.title]
                        )
                    } catch {
                        self.sendDeviceResult(requestId, ok: false, message: error.localizedDescription)
                    }
                }
            }
        }

        private func readReminders(_ payload: [String: Any], requestId: String) {
            let startValue = payload["start"] as? String
            let endValue = payload["end"] as? String
            let limit = min(100, max(1, (payload["limit"] as? NSNumber)?.intValue ?? 40))
            eventStore.requestFullAccessToReminders { [weak self] granted, error in
                let permissionError = error?.localizedDescription
                Task { @MainActor [weak self] in
                    guard let self else { return }
                    guard granted else {
                        self.sendDeviceResult(requestId, ok: false, message: permissionError ?? "Reminders permission was not granted.")
                        return
                    }
                    let parser = ISO8601DateFormatter()
                    let start = startValue.flatMap(parser.date)
                    let end = endValue.flatMap(parser.date)
                    let predicate: NSPredicate
                    if start != nil || end != nil {
                        predicate = self.eventStore.predicateForIncompleteReminders(
                            withDueDateStarting: start,
                            ending: end,
                            calendars: nil
                        )
                    } else {
                        predicate = self.eventStore.predicateForReminders(in: nil)
                    }
                    self.eventStore.fetchReminders(matching: predicate) { [weak self] reminders in
                        let formatter = ISO8601DateFormatter()
                        let rows: [[String: String]] = (reminders ?? [])
                            .filter { !$0.isCompleted }
                            .sorted { lhs, rhs in
                                let left = lhs.dueDateComponents.flatMap { Calendar.current.date(from: $0) } ?? .distantFuture
                                let right = rhs.dueDateComponents.flatMap { Calendar.current.date(from: $0) } ?? .distantFuture
                                return left < right
                            }
                            .prefix(limit)
                            .map { reminder in
                                let due = reminder.dueDateComponents.flatMap { Calendar.current.date(from: $0) }
                                return [
                                    "title": reminder.title ?? "Untitled reminder",
                                    "notes": reminder.notes ?? "",
                                    "due": due.map(formatter.string) ?? "",
                                    "calendar": reminder.calendar.title,
                                    "priority": String(reminder.priority)
                                ]
                            }
                        Task { @MainActor [weak self] in
                            self?.sendDeviceResult(
                                requestId,
                                ok: true,
                                message: "Read \(rows.count) incomplete iPhone reminder\(rows.count == 1 ? "" : "s").",
                                result: ["reminders": rows]
                            )
                        }
                    }
                }
            }
        }

        private func createReminder(_ payload: [String: Any], requestId: String) {
            let title = (payload["title"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            let notes = payload["notes"] as? String ?? ""
            let dueValue = payload["due"] as? String
            eventStore.requestFullAccessToReminders { [weak self] granted, error in
                let permissionError = error?.localizedDescription
                Task { @MainActor [weak self] in
                    guard let self else { return }
                    guard granted else {
                        self.sendDeviceResult(requestId, ok: false, message: permissionError ?? "Reminders permission was not granted.")
                        return
                    }
                    guard !title.isEmpty, let calendar = self.eventStore.defaultCalendarForNewReminders() else {
                        self.sendDeviceResult(requestId, ok: false, message: "The reminder is missing a title or writable list.")
                        return
                    }
                    let reminder = EKReminder(eventStore: self.eventStore)
                    reminder.calendar = calendar
                    reminder.title = title
                    reminder.notes = notes
                    if let due = dueValue.flatMap(ISO8601DateFormatter().date) {
                        reminder.dueDateComponents = Calendar.current.dateComponents(
                            [.calendar, .timeZone, .year, .month, .day, .hour, .minute],
                            from: due
                        )
                    }
                    do {
                        try self.eventStore.save(reminder, commit: true)
                        self.sendDeviceResult(
                            requestId,
                            ok: true,
                            message: "Added \(title) to \(calendar.title).",
                            result: ["reminderIdentifier": reminder.calendarItemIdentifier, "calendar": calendar.title]
                        )
                    } catch {
                        self.sendDeviceResult(requestId, ok: false, message: error.localizedDescription)
                    }
                }
            }
        }

        private func runShortcut(_ payload: [String: Any], requestId: String) {
            let name = (payload["name"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            guard !name.isEmpty else {
                sendDeviceResult(requestId, ok: false, message: "Add the exact Shortcut name to run.")
                return
            }
            var components = URLComponents()
            components.scheme = "shortcuts"
            components.host = "run-shortcut"
            var queryItems = [URLQueryItem(name: "name", value: name)]
            let input = (payload["input"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            if !input.isEmpty {
                queryItems.append(URLQueryItem(name: "input", value: "text"))
                queryItems.append(URLQueryItem(name: "text", value: input))
            }
            components.queryItems = queryItems
            guard let url = components.url else {
                sendDeviceResult(requestId, ok: false, message: "The Shortcut handoff could not be encoded.")
                return
            }
            openNativeUrl(url, requestId: requestId, label: "Shortcut \(name)")
        }

        private func exportFile(_ payload: [String: Any], requestId: String) {
            let rawName = (payload["name"] as? String ?? "SlyOS File").trimmingCharacters(in: .whitespacesAndNewlines)
            let name = rawName
                .components(separatedBy: CharacterSet(charactersIn: "/:\\?%*\"<>|"))
                .filter { !$0.isEmpty }
                .joined(separator: "-")
                .prefix(120)
            guard
                !name.isEmpty,
                let encoded = payload["base64"] as? String,
                encoded.count <= 34_000_000,
                let data = Data(base64Encoded: encoded, options: [.ignoreUnknownCharacters]),
                !data.isEmpty,
                data.count <= 24 * 1024 * 1024
            else {
                sendDeviceResult(requestId, ok: false, message: "The generated file was empty, invalid, or larger than 24 MB.")
                return
            }
            do {
                let directory = FileManager.default.temporaryDirectory.appendingPathComponent("SlyOS Exports", isDirectory: true)
                try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
                let fileUrl = directory.appendingPathComponent(String(name), isDirectory: false)
                try data.write(to: fileUrl, options: .atomic)
                guard let presenter = topViewController() else {
                    sendDeviceResult(requestId, ok: false, message: "SlyOS could not open the iPhone Files picker.")
                    return
                }
                let picker = UIDocumentPickerViewController(forExporting: [fileUrl], asCopy: true)
                picker.modalPresentationStyle = .formSheet
                presenter.present(picker, animated: true) { [weak self] in
                    self?.sendDeviceResult(
                        requestId,
                        ok: true,
                        message: "Created \(name). Choose where to save it in Files.",
                        result: ["name": String(name), "bytes": data.count]
                    )
                }
            } catch {
                sendDeviceResult(requestId, ok: false, message: error.localizedDescription)
            }
        }

        private func readDeviceStatus(requestId: String) {
            UIDevice.current.isBatteryMonitoringEnabled = true
            let rawLevel = UIDevice.current.batteryLevel
            let level: Any = rawLevel >= 0 ? Int((rawLevel * 100).rounded()) : NSNull()
            let state = UIDevice.current.batteryState
            sendDeviceResult(
                requestId,
                ok: true,
                message: "Read the iPhone battery state.",
                result: [
                    "batteryLevel": level,
                    "charging": state == .charging || state == .full,
                    "powerSource": state == .charging || state == .full ? "external" : "battery"
                ]
            )
        }

        private func topViewController() -> UIViewController? {
            let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
            let window = scenes.flatMap(\.windows).first(where: { $0.isKeyWindow }) ?? scenes.flatMap(\.windows).first
            var current = window?.rootViewController
            while let presented = current?.presentedViewController { current = presented }
            if let navigation = current as? UINavigationController { return navigation.visibleViewController ?? navigation }
            if let tab = current as? UITabBarController { return tab.selectedViewController ?? tab }
            return current
        }

        private func localModelStatus(requestId: String) {
            #if canImport(FoundationModels)
            if #available(iOS 26.0, *) {
                let availability = SystemLanguageModel.default.availability
                let available: Bool
                if case .available = availability { available = true } else { available = false }
                sendDeviceResult(
                    requestId,
                    ok: true,
                    message: available ? "Apple Intelligence is available on this iPhone." : "Apple Intelligence is not currently available: \(String(describing: availability)).",
                    result: [
                        "available": available,
                        "runtime": "Apple Intelligence",
                        "models": available ? [["id": "apple-intelligence", "name": "Apple Intelligence", "bytes": 0]] : [],
                        "reason": available ? "" : String(describing: availability)
                    ]
                )
                return
            }
            #endif
            sendDeviceResult(
                requestId,
                ok: true,
                message: "The on-device Apple model requires iOS 26 and an Apple Intelligence-capable iPhone.",
                result: ["available": false, "runtime": "Apple Intelligence", "models": [], "reason": "Requires iOS 26 and Apple Intelligence"]
            )
        }

        private func localModelGenerate(_ payload: [String: Any], requestId: String) {
            let prompt = (payload["prompt"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            guard !prompt.isEmpty else {
                sendDeviceResult(requestId, ok: false, message: "The on-device model prompt is empty.")
                return
            }
            #if canImport(FoundationModels)
            if #available(iOS 26.0, *) {
                guard case .available = SystemLanguageModel.default.availability else {
                    sendDeviceResult(requestId, ok: false, message: "Apple Intelligence is not currently available on this iPhone.")
                    return
                }
                Task { [weak self] in
                    guard let self else { return }
                    do {
                        let session = LanguageModelSession()
                        let response = try await session.respond(to: prompt)
                        self.sendDeviceResult(
                            requestId,
                            ok: true,
                            message: "Generated privately on iPhone.",
                            result: ["content": response.content, "model": "apple-intelligence", "runtime": "Apple Intelligence"]
                        )
                    } catch {
                        self.sendDeviceResult(requestId, ok: false, message: error.localizedDescription)
                    }
                }
                return
            }
            #endif
            sendDeviceResult(requestId, ok: false, message: "The on-device Apple model requires iOS 26 and an Apple Intelligence-capable iPhone.")
        }

        private func sendDeviceResult(_ requestId: String, ok: Bool, message: String, result payload: [String: Any]? = nil) {
            var result: [String: Any] = [
                "ok": ok,
                "message": message
            ]
            if let payload { result["result"] = payload }
            guard
                let data = try? JSONSerialization.data(withJSONObject: result),
                let encodedResult = String(data: data, encoding: .utf8)
            else { return }
            webView?.evaluateJavaScript(
                "window.slyosNativeActionResult && window.slyosNativeActionResult(\(jsString(requestId)), \(encodedResult));"
            )
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            deliverPendingPrompt()
        }

        func startPendingPromptPolling() {
            pendingPromptTimer?.invalidate()
            pendingPromptTimer = Timer.scheduledTimer(withTimeInterval: 0.8, repeats: true) { [weak self] _ in
                Task { @MainActor [weak self] in
                    self?.deliverPendingPrompt()
                }
            }
        }

        private func deliverPendingPrompt() {
            let key = "slyos.pendingPrompt"
            guard let prompt = UserDefaults.standard.string(forKey: key), !prompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
                return
            }
            UserDefaults.standard.removeObject(forKey: key)
            webView?.evaluateJavaScript("window.slyosHandleNativePrompt && window.slyosHandleNativePrompt(\(jsString(prompt)));")
        }

        private func requestSpeechAccessAndStart() {
            stopListening()
            SFSpeechRecognizer.requestAuthorization { [weak self] status in
                DispatchQueue.main.async {
                    guard let self else { return }
                    guard status == .authorized else {
                        self.sendVoiceResult("", isFinal: true, error: "Speech recognition permission was not granted.")
                        return
                    }
                    AVAudioApplication.requestRecordPermission { granted in
                        DispatchQueue.main.async {
                            guard granted else {
                                self.sendVoiceResult("", isFinal: true, error: "Microphone permission was not granted.")
                                return
                            }
                            self.startListening()
                        }
                    }
                }
            }
        }

        private func startListening() {
            guard let recognizer, recognizer.isAvailable else {
                sendVoiceResult("", isFinal: true, error: "Speech recognition is temporarily unavailable.")
                return
            }
            do {
                let audioSession = AVAudioSession.sharedInstance()
                try audioSession.setCategory(.record, mode: .measurement, options: .duckOthers)
                try audioSession.setActive(true, options: .notifyOthersOnDeactivation)

                let request = SFSpeechAudioBufferRecognitionRequest()
                request.shouldReportPartialResults = true
                recognitionRequest = request

                let inputNode = audioEngine.inputNode
                inputNode.removeTap(onBus: 0)
                let format = inputNode.outputFormat(forBus: 0)
                inputNode.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak request] buffer, _ in
                    request?.append(buffer)
                }
                audioEngine.prepare()
                try audioEngine.start()

                recognitionTask = recognizer.recognitionTask(with: request) { [weak self] result, error in
                    DispatchQueue.main.async {
                        guard let self else { return }
                        if let result {
                            self.sendVoiceResult(result.bestTranscription.formattedString, isFinal: result.isFinal, error: nil)
                            if result.isFinal { self.stopListening() }
                        } else if let error {
                            self.sendVoiceResult("", isFinal: true, error: error.localizedDescription)
                            self.stopListening()
                        }
                    }
                }
            } catch {
                sendVoiceResult("", isFinal: true, error: error.localizedDescription)
                stopListening()
            }
        }

        func stopListening() {
            if audioEngine.isRunning { audioEngine.stop() }
            audioEngine.inputNode.removeTap(onBus: 0)
            recognitionRequest?.endAudio()
            recognitionRequest = nil
            recognitionTask?.cancel()
            recognitionTask = nil
            try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        }

        func stopPendingPromptPolling() {
            pendingPromptTimer?.invalidate()
            pendingPromptTimer = nil
        }

        private func sendVoiceResult(_ text: String, isFinal: Bool, error: String?) {
            let encodedText = jsString(text)
            let encodedError = jsString(error ?? "")
            webView?.evaluateJavaScript(
                "window.slyosVoiceResult && window.slyosVoiceResult(\(encodedText), \(isFinal ? "true" : "false"), \(encodedError));"
            )
        }

        private func jsString(_ value: String) -> String {
            guard
                let data = try? JSONSerialization.data(withJSONObject: [value]),
                let encoded = String(data: data, encoding: .utf8),
                encoded.count >= 2
            else { return "\"\"" }
            return String(encoded.dropFirst().dropLast())
        }
    }

    func makeCoordinator() -> Coordinator {
        Coordinator()
    }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = webViewConfiguration()
        configuration.userContentController.add(context.coordinator, name: "slyosVoice")
        configuration.userContentController.add(context.coordinator, name: "slyosDevice")
        let webView = WKWebView(frame: .zero, configuration: configuration)
        context.coordinator.webView = webView
        webView.uiDelegate = context.coordinator
        webView.navigationDelegate = context.coordinator
        webView.isOpaque = false
        webView.backgroundColor = UIColor(red: 0.957, green: 0.937, blue: 0.902, alpha: 1)
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        context.coordinator.startPendingPromptPolling()
        loadBundledApp(into: webView)
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    static func dismantleUIView(_ uiView: WKWebView, coordinator: Coordinator) {
        coordinator.stopListening()
        coordinator.stopPendingPromptPolling()
        uiView.configuration.userContentController.removeScriptMessageHandler(forName: "slyosVoice")
        uiView.configuration.userContentController.removeScriptMessageHandler(forName: "slyosDevice")
    }
}

@available(iOS 16.0, *)
struct AskSlyOSIntent: AppIntent {
    static let title: LocalizedStringResource = "Ask SlyOS"
    static let description = IntentDescription("Send a request to the SlyOS Home brain.")
    static let openAppWhenRun = true

    @Parameter(title: "Request", requestValueDialog: IntentDialog("What should happen?"))
    var request: String

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let prompt = request.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !prompt.isEmpty else {
            return .result(dialog: "Tell SlyOS what should happen.")
        }
        UserDefaults.standard.set(prompt, forKey: "slyos.pendingPrompt")
        return .result(dialog: "Opening SlyOS.")
    }
}

@available(iOS 16.0, *)
struct SlyOSShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: AskSlyOSIntent(),
            phrases: [
                "Ask \(.applicationName)",
                "Tell \(.applicationName) what should happen"
            ],
            shortTitle: "Ask SlyOS",
            systemImageName: "brain.head.profile"
        )
    }
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
