# macOS Native Adapter

Target shape: shared desktop shell wrapped with native macOS capabilities.

First native capabilities to implement:

- menu bar app
- global prompt shortcut
- screenshot capture with permission
- Accessibility API screen context and UI actions
- file/document ingestion
- browser opening and URL handoff
- calendar/mail draft adapters
- local model runner integration

Recommended packaging path:

1. Install Rust.
2. Wrap `platforms/desktop-shell` with Tauri.
3. Add a macOS adapter module for permissions and automation.
4. Keep irreversible actions confirmation-gated.

