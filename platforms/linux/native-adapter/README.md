# Linux Native Adapter

Target shape: shared desktop shell wrapped with Linux capabilities.

First native capabilities to implement:

- tray/global command palette where the desktop environment supports it
- screenshot capture
- file/document ingestion
- terminal command adapter
- browser automation adapter
- local model runner integration

Linux notes:

- Wayland and X11 need separate automation handling.
- GNOME and KDE may require separate tray/global shortcut integrations.
- Linux is likely the best platform for local models and terminal-heavy agent workflows.

