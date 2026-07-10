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

Known limits:

- no launcher replacement
- no broad notification listener equivalent
- no general auto-reply layer across all apps
- no arbitrary cross-app screen control
- no background SMS automation

Next build step:

1. Create an Xcode iOS app project named `SlyOSCompanion`.
2. Add the Swift files from `SlyOSCompanion/Sources/SlyOSCompanion`.
3. Add an App Intents capability/target if Xcode does not include it automatically.
4. Run on the iPhone.
5. Verify Shortcuts exposes `Ask SlyOS`, `Remember`, and `Memory`.

The iOS build should be honest: a powerful companion, not a fake Android launcher.

