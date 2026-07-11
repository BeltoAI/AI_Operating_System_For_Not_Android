# SlyOS Public Feature Parity

Checked against the public SlyOS docs at `https://www.slyos.world/docs.html` on 2026-07-11.

This file is the non-Android shipping checklist. Android remains the reference because it can be a launcher, read notifications, use AccessibilityService, draw overlays, and operate the whole phone. macOS can get close through a local bridge plus Accessibility and Screen Recording permissions. iOS can run the SlyOS app shell, sync the brain, use camera/import/share flows, and expose App Intents/Shortcuts, but it cannot click through arbitrary third-party apps.

| Public docs feature | macOS status | iOS status | Where to test |
| --- | --- | --- | --- |
| First-run setup wizard | Live | Live | `?screen=setup` |
| Set SlyOS as home surface | Full-window Mac shell | Native app shell, not system launcher | `?screen=home` |
| Permissions | Accessibility, Screen Recording, Automation, Microphone/Camera | Camera, Microphone, Photos/Files, Notifications where native code exposes them | `?screen=setup` |
| Home prompt/action plan | Live through shared brain planner | Live through shared brain planner | `?screen=home` |
| Voice call/listening brain | Live visual shell, model key required for live response | Live visual shell, model key required for live response | `?screen=voice` |
| Auto-reply | Draft/bridge path only | Draft/share/handoff only | `?screen=chat` |
| Ask memory | Live local brain plus optional Supabase sync | Live local brain plus optional Supabase sync | `?screen=memory` |
| Import history | Live local file import into brain | Live file/share import into brain when exposed by native shell | `?screen=imports` |
| Chat | Live local brain chat; provider response when key is configured | Live local brain chat; provider response when key is configured | `?screen=chat` |
| Operate phone/device | Local bridge primitives: observe, app open, click, type, hotkey, clipboard, scroll, wait | Shortcuts/App Intents/handoff only; no arbitrary whole-device click-through | `?screen=operate` |
| Sign up/login + 2FA/account | Supabase email/password auth live; 2FA depends on Supabase project settings | Same | `?screen=setup` |
| Teach a skill | Live local skill memory; desktop bridge can execute primitives | Live local skill memory; execution must use app/Shortcut handoff | `?screen=skill` |
| Look mode | Live camera/screenshot surface; desktop ingestion depends on bridge/browser permissions | Live camera/import surface | `?screen=look` |
| Scan receipts/docs | Live file import and expense memory | Live file/import path | `?screen=documents`, `?screen=expenses` |
| Write research/publish | Live research/cowork surfaces; external publish requires provider/API integration | Same surface; publishing requires explicit handoff | `?screen=research`, `?screen=cowork` |
| Cowork local agent | Live shell surface; file writes require local bridge allowed roots | Companion chat surface; file writes are app-scoped | `?screen=cowork` |
| Mission mode | Live mission surface; provider key needed for generated work | Live mission surface; provider key needed for generated work | `?screen=mission` |
| Investing | Live portfolio brain notes; no trading automation | Live portfolio brain notes; no trading automation | `?screen=investing` |
| Account/sync | Live Supabase Auth + `brain_items` push/pull | Live Supabase Auth + `brain_items` push/pull | `?screen=backup` |
| Google Drive backup | Schema-ready only; connector/native integration not finished | Schema-ready only; connector/native integration not finished | `supabase/schema.sql` |
| Bank vault | Live local AES-GCM encrypted vault pointers in brain; Supabase encrypted vault tables are schema-ready | Live local AES-GCM encrypted vault pointers in brain; native Keychain wrapper still needed | `?screen=vault` |
| API keys/models/cost | Live model provider settings and key validation | Live model provider settings and key validation | `?screen=models` |
| Floating nav panel | Live bottom SlyOS nav in full-window shell | Live in-app SlyOS nav; system overlays blocked | `?screen=floating-nav` |

## Permission Notes

For maximum macOS takeover performance, run the desktop bridge with device control enabled:

```bash
SLYOS_AGENT_TOKEN=choose-a-local-secret \
SLYOS_ENABLE_DEVICE_CONTROL=1 \
npm run agent
```

Then grant the terminal or native runner Accessibility and Screen Recording in macOS Settings. The bridge only listens on `127.0.0.1`, requires a bearer token, and does not enable shell commands unless `SLYOS_ENABLE_SHELL=1`.

For iPhone testing, Developer Mode, a trusted cable connection, and Xcode signing are required for the native app. Whole-device click-through is not possible on iOS; use SlyOS-owned screens, share sheets, camera/imports, App Intents, Shortcuts, and explicit handoff.
