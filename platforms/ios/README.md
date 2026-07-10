# iOS

Recommended shape: native SwiftUI companion app.

This folder now contains a first-pass SwiftUI/App Intents source scaffold in:

```text
SlyOSCompanion/Sources/SlyOSCompanion
```

Closest parity surfaces:

- SwiftUI app shell
- App Intents
- Siri Shortcuts
- Share Extension
- widgets
- camera Look
- receipt/document ingestion
- memory search and recall
- explicit action drafts
- calendar and reminders with permission
- App Intent / Shortcut handoff for tasks that need system action

Known limits:

- no launcher replacement
- no broad notification listener equivalent
- no general auto-reply layer across all apps
- no arbitrary cross-app screen control
- no background SMS automation

Important takeover note: iOS cannot support Android-style whole-device click-through from a third-party app. The closest honest path is SlyOS-native flows, App Intents, Shortcuts, Share Extensions, widgets, URL schemes, notifications, camera/import, and explicit user handoff when the OS blocks automation.

Next build step:

1. Create an Xcode iOS app project named `SlyOSCompanion`.
2. Add the Swift files from `SlyOSCompanion/Sources/SlyOSCompanion`.
3. Add an App Intents capability/target if Xcode does not include it automatically.
4. Run on the iPhone.
5. Verify Shortcuts exposes `Ask SlyOS`, `Remember`, and `Memory`.

The iOS build should be honest: a powerful companion, not a fake Android launcher.
