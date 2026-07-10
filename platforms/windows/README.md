# Windows

Recommended shape: shared desktop agent shell with Windows adapter.

Closest parity surfaces:

- system tray app
- global prompt shortcut
- screenshot/screen context capture
- UI Automation API
- filesystem and Office document workflows
- browser automation
- local model runners where hardware allows

Windows should share most desktop code with macOS and Linux, while keeping OS-specific automation behind an adapter boundary.

Current shared operation bridge: run `npm run agent` from the repo root to start the localhost desktop device agent.
