# Parity Matrix

Legend:

- Same: platform can implement the same user-facing behavior directly.
- Equivalent: platform can deliver a similar workflow through a different OS primitive.
- Limited: possible, but with missing automation, background, or permissions.
- No: the OS does not expose the needed capability safely.

| Feature | Android reference | iOS | macOS | Linux | Windows | Target approach |
| --- | --- | --- | --- | --- | --- | --- |
| Agent home surface | Same: launcher/HOME app | Limited | Equivalent | Equivalent | Equivalent | iOS app + widgets; desktop tray/global command palette |
| One prompt command center | Same | Same | Same | Same | Same | Shared agent contract and native shell UI |
| Cloud model routing | Same | Same | Same | Same | Same | Shared model-router contract |
| Local model routing | Same, device-dependent | Limited | Same | Same | Same | Desktop local runners first; iOS small on-device where practical |
| Memory brain | Same | Same | Same | Same | Same | Shared SQLite/schema contracts, native storage adapters |
| Chat/data imports | Same | Same | Same | Same | Same | Shared importers and per-platform file pickers |
| Notification reading | Same | No/Limited | Limited | Limited | Limited | Desktop adapters where permissions exist; iOS cannot mirror Android |
| Auto-reply to messages | Same with safeguards | No/Limited | Limited | Limited | Limited | Draft-first everywhere except explicit platform APIs |
| Screen reading | Same via AccessibilityService | Limited | Equivalent | Equivalent | Equivalent | iOS screenshot/share workflows; desktop accessibility APIs |
| Screen operation | Same via gestures | No/Limited | Equivalent | Equivalent | Equivalent | Desktop automation adapters; iOS Shortcuts/App Intents only |
| Overlay brain button | Same | No | Equivalent | Equivalent | Equivalent | Desktop floating window/tray; iOS widgets/control surfaces |
| SMS send | Same with confirmation | Limited | Limited | Limited | Limited | Use share sheets, mail/message compose, or companion workflows |
| Calendar actions | Same | Same | Same | Same | Same | Native calendar/event APIs with confirmation |
| Camera Look | Same | Same | Limited | Limited | Limited | iOS camera native; desktop webcam/screenshot ingestion |
| Receipts and expense tracker | Same | Same | Same | Same | Same | Shared extraction contract and local store |
| Docs/PDF ingestion | Same | Same | Same | Same | Same | Shared document pipeline |
| Telegram bot brain | Same | Same | Same | Same | Same | Shared bot service, platform-independent |
| Mini-app builder | Same | Equivalent | Equivalent | Equivalent | Equivalent | Sandboxed webview/web runtime with memory grants |
| Website/release loop | Same | Same | Same | Same | Same | New cross-platform release docs and artifacts |

## Practical conclusion

macOS, Linux, and Windows can be close functional siblings. iOS should be a high-quality companion, not a fake launcher clone.

