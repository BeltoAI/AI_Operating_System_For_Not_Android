# macOS

There is now a literal native macOS app wrapper:

```bash
npm run macos:app
open platforms/macos/build/SlyOS.app
```

That app uses WebKit to run the same SlyOS shell built from `platforms/desktop-shell/src`, so UI edits flow into the Mac app after rebuild.

Current behavior:

- borderless native `.app`
- fills the active Mac display
- hides the Dock/menu bar while open
- places the SlyOS bottom nav over the bottom frame
- includes generated SlyOS app icons
- ad-hoc signed for local testing, not notarized

Closest parity surfaces:

- menu bar agent
- global prompt shortcut
- floating command palette
- screenshot/screen context capture
- accessibility-assisted automation with user permission
- files, folders, PDFs, receipts, and local memory
- browser and terminal tools
- calendar/mail adapters with confirmation

macOS can get closer to Android-style operation than iOS because it exposes desktop automation and accessibility APIs.

Current shared operation bridge: run `npm run agent` from the repo root to start the localhost desktop device agent.

Enable prompt-to-device control:

```bash
SLYOS_AGENT_TOKEN=choose-a-local-secret \
SLYOS_ENABLE_DEVICE_CONTROL=1 \
npm run agent
```

Grant Accessibility and Screen Recording. Install `cliclick` for precise pointer move, right click, double click, and scroll support.
