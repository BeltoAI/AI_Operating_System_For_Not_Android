# Desktop Shell

First runnable cross-platform BADSCIENTIST surface for macOS, Linux, and Windows.

This shell is meant to feel like the Android SlyOS launcher, not like a dashboard.

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

- Boot → Lock → Home flow
- exact SlyOS token palette
- Caveat SlyOS wordmark
- Android-like Home prompt and shortcuts
- bottom nav with Brain centered
- Now feed with catch-up/drafts/proposals
- People-style reply cards
- Memory ask/search and graph-like map
- Manual Mode pause/resume
- prompt-to-action planning through the shared brain contract
- confirmation-gated action display
- local browser memory store
- Supabase magic-link sync UI in Setup
- memory/settings push-pull hooks

## Next native step

Install Rust, then wrap this Vite app with Tauri and add platform adapters:

- macOS: menu bar, Accessibility API, screen capture, global shortcut
- Linux: tray, screenshot, terminal, browser, local models
- Windows: system tray, UI Automation, screen capture, Office/browser workflows

Keep the shared action schema as the boundary between the agent and OS-specific code.
