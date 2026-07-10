# Desktop Shell

Runnable SlyOS-style shell for macOS, Linux, and Windows development.

This is a browser shell today. It is designed to match the Android SlyOS feeling closely while the native desktop adapters are built around it.

## Run

From the repo root:

```bash
npm install
npm run dev
```

Open the Vite URL, usually:

```text
http://localhost:5173
```

## Build and check

```bash
npm run typecheck -w @badscientist/desktop-shell
npm run build -w @badscientist/desktop-shell
```

Or from the root:

```bash
npm run typecheck
npm run build
```

## Build downloadable PWA

From the repo root:

```bash
npm run release:web
```

This creates:

```text
release-artifacts/slyos-web-pwa-<version>-<commit>.zip
```

The ZIP includes the static app, install instructions, and release metadata.

## Direct screen routes

Use these for quick QA and screenshots:

```text
/?screen=home
/?screen=now
/?screen=outbox
/?screen=reconnect
/?screen=memory
/?screen=memory-settings
/?screen=mission
/?screen=network
/?screen=research
/?screen=cowork
/?screen=voice
/?screen=apps
/?screen=setup
/?screen=look
/?screen=expenses
```

## Current screens

- Boot and Lock
- Home prompt: "what should happen?"
- Now digest
- Sent for you
- Reconnect
- Brain memory graph
- Memory settings
- Mission
- My network
- Research
- Cowork
- Voice/listening
- Apps
- Manual mode
- Setup and Supabase sync
- Setup and local device bridge controls
- Look
- Expenses

## Device bridge UI

Start the local desktop agent:

```bash
SLYOS_AGENT_TOKEN=choose-a-local-secret \
SLYOS_ENABLE_DEVICE_CONTROL=1 \
npm run agent
```

Then open `Setup`, save the bridge URL/token, and run `Check bridge`. Prompts that include app/screen/click/open/control produce a Brain card with `Run device loop`, which calls `observe_screen` on the local bridge.

## Responsive behavior

The shell has two modes:

- Desktop: centered phone preview with a fixed SlyOS-like device frame.
- Mobile/tablet: full-screen shell below 760px viewport width.

The CSS also compresses graph height, card spacing, and large labels on short or narrow screens. When changing UI, test at minimum:

```text
390 x 844
375 x 667
430 x 932
1024 x 768
1440 x 900
```

## PWA behavior

The shell includes:

- `public/manifest.webmanifest`
- `public/sw.js`
- `public/offline.html`
- `public/icons/slyos-icon.svg`

It can be installed from Safari on iPhone/iPad using Add to Home Screen, and from Chrome/Edge on desktop using Install App.

## Native desktop path

The planned native wrapper is Tauri. The shared action schema remains the boundary between the agent brain and OS-specific power.

Adapter targets:

- macOS: menu bar, global shortcut, Accessibility API, screen capture, files, terminal, browser
- Linux: tray/command palette, screenshot, terminal, browser, local models
- Windows: tray, UI Automation, screen capture, browser, Office and file workflows

## Development rule

Keep this shell OS-like. Avoid dashboard layouts, marketing pages, oversized hero sections, or generic SaaS card walls. The first screen should feel like an operating surface, not a website.
