import AVFoundation
import Foundation
import Observation
import Speech

/// Listening to a conversation and keeping what mattered.
///
/// **Not phone calls.** iOS gives no third-party app the microphone while a call is active and no
/// access to the system's own call recording, at any entitlement level. Anything claiming to take
/// notes on your phone calls from inside an app is claiming something iOS does not permit.
///
/// What it *can* do is the meeting you are sitting in — a coffee, a standup, a lecture, a call on
/// speakerphone in front of you. That turns out to be the more valuable half anyway: a phone call
/// you were on is a thing you remember for a day, and a meeting six weeks ago is a thing nobody
/// remembers at all. "What did Carlos say about the timeline" is the question worth answering.
///
/// Transcription runs on-device via `requiresOnDeviceRecognition`, so a private conversation is not
/// uploaded to Apple or to anyone else to be turned into text. Only the finished transcript is sent
/// anywhere, and only when the owner asks for a summary.
@Observable
final class MeetingNotes {

    static let shared = MeetingNotes()

    private(set) var isRecording = false
    private(set) var transcript = ""
    private(set) var startedAt: Date?
    private(set) var problem: String?

    private let recognizer = SFSpeechRecognizer(locale: Locale.current)
    private let engine = AVAudioEngine()
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?
    /// Text from earlier recognition segments. Long sessions get restarted (see below) and each
    /// restart's result replaces the last, so finished text has to be banked outside the request.
    private var banked = ""

    private init() {}

    // MARK: - Recording

    @MainActor
    func start() async {
        guard !isRecording else { return }
        problem = nil

        var micGranted = Permissions.shared.state(.microphone) == .granted
        if !micGranted { micGranted = await AVAudioApplication.requestRecordPermission() }
        guard micGranted else {
            problem = "SlyOS needs the microphone to take notes."
            return
        }
        guard await withCheckedContinuation({ (c: CheckedContinuation<Bool, Never>) in
            SFSpeechRecognizer.requestAuthorization { c.resume(returning: $0 == .authorized) }
        }) else {
            problem = "Speech recognition is switched off for SlyOS in iOS Settings."
            return
        }

        do {
            let session = AVAudioSession.sharedInstance()
            // .record with .measurement: no ducking, no mixing, nothing but the room. `.spokenAudio`
            // stops iOS applying the aggressive noise processing meant for phone calls, which eats
            // the quieter half of a table conversation.
            try session.setCategory(.record, mode: .measurement, options: [.allowBluetooth])
            try session.setActive(true, options: .notifyOthersOnDeactivation)

            try beginSegment()
            startedAt = .now
            transcript = ""
            banked = ""
            isRecording = true
        } catch {
            problem = "Couldn't start recording: \(error.localizedDescription)"
            stop()
        }
    }

    /// One recognition run.
    ///
    /// Split into segments because `SFSpeechRecognitionTask` stops on its own after roughly a
    /// minute — a limit that is invisible in testing and fatal in use: an hour-long meeting would
    /// transcribe its first minute and then silently record nothing at all.
    private func beginSegment() throws {
        task?.cancel()
        task = nil

        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        // On-device. A meeting is exactly the kind of thing that must not leave the phone to be
        // read, and it also means this works with no network at all.
        request.requiresOnDeviceRecognition = true
        request.addsPunctuation = true
        self.request = request

        let input = engine.inputNode
        let format = input.outputFormat(forBus: 0)
        input.removeTap(onBus: 0)
        input.installTap(onBus: 0, bufferSize: 2_048, format: format) { [weak self] buffer, _ in
            self?.request?.append(buffer)
        }

        engine.prepare()
        try engine.start()

        task = recognizer?.recognitionTask(with: request) { [weak self] result, error in
            guard let self else { return }
            if let result {
                Task { @MainActor in
                    self.transcript = (self.banked + " " + result.bestTranscription.formattedString)
                        .trimmingCharacters(in: .whitespaces)
                }
            }
            // Finished or failed — bank what we have and start listening again, unless the owner
            // stopped us.
            if error != nil || result?.isFinal == true {
                Task { @MainActor in
                    guard self.isRecording else { return }
                    self.banked = self.transcript
                    try? self.beginSegment()
                }
            }
        }
    }

    @MainActor
    func stop() {
        engine.inputNode.removeTap(onBus: 0)
        engine.stop()
        request?.endAudio()
        task?.cancel()
        request = nil
        task = nil
        isRecording = false
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    var elapsed: String {
        guard let startedAt else { return "0:00" }
        let s = Int(Date.now.timeIntervalSince(startedAt))
        return String(format: "%d:%02d", s / 60, s % 60)
    }

    // MARK: - Keeping it

    /// Summarise and file the meeting. Returns what was written, or nil if there was nothing to keep.
    @MainActor
    @discardableResult
    func save(title: String = "") async -> String? {
        let text = transcript.trimmingCharacters(in: .whitespacesAndNewlines)
        // A few seconds of a pocket is not a meeting.
        guard text.count > 120 else { return nil }

        let when = startedAt ?? .now
        let name = title.isEmpty
            ? "Meeting · \(when.formatted(date: .abbreviated, time: .shortened))"
            : title

        // The raw transcript first, and unconditionally. The summary needs a model and the model can
        // fail; what was actually said must survive that. Verbatim is also what makes "what were
        // Carlos's exact words" answerable at all.
        SlyStore.shared.insert(kind: "meeting", title: name, body: text,
                               source: "Meeting", date: when)

        Activity.record(.remembered, name, detail: "\(text.count / 5) words transcribed")
        guard ModelRouter.shared.isConfigured else { return name }

        let system = """
            You are summarising a transcript of a conversation the owner was part of. It comes from \
            live speech recognition, so it has no speaker labels and contains mistakes — read \
            through them rather than quoting them as fact.

            Write, in this order and with nothing else:
            · Two or three sentences on what the conversation was about.
            · DECISIONS — what was actually settled. Omit the heading if nothing was.
            · ACTIONS — who agreed to do what, and by when if it was said. Name people. Omit if none.
            · OPEN — questions left unanswered. Omit if none.

            Do not invent a decision, an action or a deadline that is not in the transcript. A short \
            summary that says little is right when little was said; a complete-looking one that \
            invented half of it is how someone misses a commitment they never made.
            """
        guard let summary = try? await AgentClient.complete(
            system: system, user: text.count > 24_000 ? String(text.prefix(24_000)) : text,
            tier: .standard), !summary.isEmpty else { return name }

        SlyStore.shared.insert(kind: "note", title: "\(name) — summary", body: summary,
                               source: "Meeting", date: when)

        // Anything owed by the owner becomes a real reminder rather than a line in a note they will
        // not reopen. A commitment recorded somewhere nobody looks is not recorded.
        for line in summary.components(separatedBy: .newlines) {
            let l = line.trimmingCharacters(in: CharacterSet(charactersIn: "·-* ").union(.whitespaces))
            guard l.count > 8,
                  l.lowercased().hasPrefix("you ") || l.lowercased().contains("i'll")
                    || l.lowercased().contains("i will") else { continue }
            await Tasks.shared.add(l, notes: "From \(name)")
        }
        return name
    }

    @MainActor
    func discard() {
        transcript = ""
        banked = ""
        startedAt = nil
    }
}
