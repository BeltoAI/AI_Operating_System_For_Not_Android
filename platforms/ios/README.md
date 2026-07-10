# iOS

Recommended shape: native SwiftUI/WebKit companion app.

There is now an editable Xcode project generator:

```bash
npm run apple:xcode
open platforms/apple/SlyOSNative/SlyOSNative.xcodeproj
```

Select `SlyOS-iOS`, choose the connected iPhone 15 Pro Max, set your signing team, and press Run.

The iPhone build uses WebKit to run the same SlyOS shell built from `platforms/desktop-shell/src`, so UI edits flow into the iPhone app after `npm run apple:sync-web` or `npm run apple:xcode`.

Full Xcode is required for cabled iPhone install. This Mac currently has Command Line Tools only, which can generate/edit the project but cannot deploy to the phone.

This folder also contains the earlier SwiftUI/App Intents source scaffold in:

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

Use that scaffold as reference when adding true App Intents, Shortcuts, widgets, and Share Extension targets to the generated native Apple project.

Current cabled-device build step:

1. Install full Xcode.
2. Run `npm run apple:xcode`.
3. Open `platforms/apple/SlyOSNative/SlyOSNative.xcodeproj`.
4. Select `SlyOS-iOS`.
5. Set your signing team.
6. Choose the connected iPhone.
7. Press Run.

The iOS build should be honest: a powerful companion, not a fake Android launcher.
