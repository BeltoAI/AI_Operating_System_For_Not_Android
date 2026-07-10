# Desktop Shell

First runnable cross-platform BADSCIENTIST surface for macOS, Linux, and Windows.

## Run

```bash
cd /Users/emilshirokikh/Downloads/BADSCIENTIST
npm install
npm run dev
```

## Build

```bash
npm run build -w @badscientist/desktop-shell
```

## Current features

- command center
- prompt-to-action-plan demo
- confirmation-gated action display
- local browser memory store
- Supabase magic-link sync UI
- memory/settings push-pull hooks
- OS parity cards

## Next native step

Install Rust, then wrap this Vite app with Tauri and add platform adapters:

- macOS: menu bar, Accessibility API, screen capture, global shortcut
- Linux: tray, screenshot, terminal, browser, local models
- Windows: system tray, UI Automation, screen capture, Office/browser workflows

Keep the shared action schema as the boundary between the agent and OS-specific code.

