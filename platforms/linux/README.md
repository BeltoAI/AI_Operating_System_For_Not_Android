# Linux

Recommended shape: shared desktop agent shell with Linux adapter.

Closest parity surfaces:

- tray app where desktop environment supports it
- global command palette
- screenshot/screen context capture
- local filesystem and terminal tools
- browser automation
- document/receipt ingestion
- local model runners

Notes:

- Wayland and X11 have different automation/screenshot permissions.
- GNOME, KDE, and other desktop environments may need separate adapters.
- Linux is likely the best platform for local models and terminal-heavy agent workflows.

Current shared operation bridge: run `npm run agent` from the repo root to start the localhost desktop device agent.
