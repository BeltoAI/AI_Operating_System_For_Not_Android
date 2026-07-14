# BADSCIENTIST

Cross-platform SlyOS / AgentOS rebuild for iOS, macOS, Linux, and Windows.

BADSCIENTIST is the non-Android workspace for the SlyOS idea: a phone or desktop surface where every request flows through a personal agent brain, memory, settings, and confirmation-gated actions.

The Android app remains the richest reference implementation. This repo rebuilds the closest possible equivalents for other operating systems without moving or breaking the existing Android production path.

Repository:

```text
https://github.com/BeltoAI/AI_Operating_System_For_Not_Android
```

## Read this first

This repo contains working native development builds for macOS and iOS plus the shared web/PWA and desktop-agent sources. Public App Store, notarized macOS, Linux, and Windows distribution still require platform release credentials and packaging.

What works today:

- A runnable SlyOS-style web shell for local development.
- A native macOS `SlyOS.app` wrapper that fills the Mac frame and overlays the Dock area with the SlyOS bottom nav.
- An editable generated Apple Xcode project with iOS and macOS targets.
- Generated SlyOS app icons for iPhone, iPad, macOS, and the PWA manifest.
- Installable PWA metadata, offline shell caching, and a web release artifact builder.
- A real canvas-backed Brain graph built from local/synced memory, with drag rotate, wheel/pinch zoom, filters, recent memory questions, and node selection.
- Android-shaped workflow screens for Chat, Operate device, Teach a skill, Documents, Imports, Investing, Bank vault, Brain backup, Models, Per-app responses, and public-docs feature parity.
- A local WebCrypto AES-GCM vault screen that stores encrypted secrets locally and writes only locked pointers into the brain.
- A localhost desktop device-agent bridge for macOS, Linux, and Windows actions.
- An in-app Diagnostics surface plus local JSONL/host logs for startup, sync, memory, provider, and device-control evidence.
- Prompt-to-device control primitives: observe screen, front app, clipboard, click, type, hotkey, scroll, and wait.
- Shared TypeScript agent contracts for memory, planning, actions, and sync.
- A Supabase schema, migration, local config, readiness check, and DB apply script for optional cross-device memory and settings sync.
- A native iOS SwiftUI/WebKit shell with App Intents, Shortcuts handoffs, camera/microphone bridges, contacts, calendar, reminders, files/imports, and Apple Foundation Models when available.
- Platform folders for macOS, Linux, Windows, iOS, and Android reference notes.
- Documentation for parity, roadmap, setup, and Android baseline limits.

What is still platform-limited:

- Public App Store/TestFlight iOS distribution. Signed cable installation is implemented and tested; public distribution needs an Apple Developer release team.
- Notarized macOS DMG/PKG installer.
- Finished Linux or Windows native installers.
- Full Android-level notification listener, launcher replacement, overlay, or AccessibilityService behavior on iOS. Apple does not expose equivalent APIs to third-party apps.

Important: `localhost` is the web shell. The native Apple app wraps the same shell through WebKit and lives under `platforms/apple/SlyOSNative`.

## Quick start

Requirements:

- Node.js 22 or newer
- npm
- Git
- Optional: a Supabase account if you want cross-device sync
- Optional later: Xcode for iOS, Rust/Tauri for native desktop packaging

Clone and run:

```bash
git clone https://github.com/BeltoAI/AI_Operating_System_For_Not_Android.git
cd AI_Operating_System_For_Not_Android
npm install
npm run dev
```

Open the Vite URL from the terminal, usually:

```text
http://localhost:5173
```

Run checks:

```bash
npm run typecheck
npm run build
npm run doctor
npm run db:probe
```

Build downloadable release artifacts:

```bash
npm run release:all
npm run release:macos-app
```

Outputs:

```text
release-artifacts/slyos-web-pwa-<version>-<commit>.zip
release-artifacts/slyos-desktop-agent-<version>-<commit>.zip
release-artifacts/slyos-macos-app-<version>-<commit>.zip
```

The macOS app ZIP contains an Apple Development-signed local `SlyOS.app`. It is suitable for local testing but is not notarized for public Gatekeeper distribution.

The PWA ZIP remains the current browser/PWA install path. Host the `app/` folder inside it, then install it as a PWA from Safari on iPhone/iPad or Chrome/Edge on desktop.

The desktop-agent ZIP is the native-power bridge for macOS, Linux, and Windows. Download it to the target computer, run it locally, and connect the SlyOS shell to its localhost URL/token when desktop OS actions are needed.

## Native Mac App

Build, install, and open the Mac app:

```bash
npm run macos:app
ditto platforms/macos/build/SlyOS.app /Applications/SlyOS.app
open /Applications/SlyOS.app
```

The app:

- opens as a borderless launcher-style SlyOS surface;
- fills the active Mac display;
- hides the Dock/menu bar;
- places the SlyOS bottom nav over the bottom frame;
- uses the same UI code as `platforms/desktop-shell/src`;
- includes generated SlyOS icons and a bundled WebKit app shell.

After UI edits, run `npm run macos:app` again.

For observe-click-type control, open `Brain -> Settings -> Device permissions`, select `Request Mac access`, approve both `Screen Recording` and `Accessibility`, then quit and reopen SlyOS once. The app tests the real permission state and `Brain -> Settings -> Diagnostics` records the result. Install one canonical copy at `/Applications/SlyOS.app`; registering multiple unpacked copies with the same bundle identifier can create stale macOS permission records. See `docs/RUNTIME_DIAGNOSTICS.md`.

## Native iPhone App

Generate and open the Apple project:

```bash
npm run apple:xcode
open platforms/apple/SlyOSNative/SlyOSNative.xcodeproj
```

To install on a cabled iPhone from Xcode:

1. Install full Xcode from Apple.
2. Open `platforms/apple/SlyOSNative/SlyOSNative.xcodeproj`.
3. Select the `SlyOS-iOS` scheme.
4. Set your Apple Developer signing team.
5. Select your connected iPhone.
6. Press Run.

To build from the command line:

```bash
xcodebuild \
  -project platforms/apple/SlyOSNative/SlyOSNative.xcodeproj \
  -scheme SlyOS-iOS \
  -configuration Debug \
  -destination 'generic/platform=iOS' \
  DEVELOPMENT_TEAM=YOUR_TEAM_ID \
  CODE_SIGN_STYLE=Automatic \
  build
```

To push to a connected iPhone, the device must be unlocked, trusted, Developer Mode enabled, and visible as available in:

```bash
xcrun devicectl list devices
```

Then install and launch the built app:

```bash
xcrun devicectl device install app --device YOUR_COREDEVICE_ID \
  ~/Library/Developer/Xcode/DerivedData/SlyOSNative-*/Build/Products/Debug-iphoneos/SlyOS.app

xcrun devicectl device process launch --device YOUR_COREDEVICE_ID com.belto.slyos.ios
```

Regenerate app icons:

```bash
npm run apple:icons
```

Run the local desktop device bridge:

```bash
SLYOS_AGENT_TOKEN=choose-a-local-secret npm run agent
```

Default bridge URL:

```text
http://127.0.0.1:4317
```

The bridge gives desktop platforms controlled native capabilities that the browser cannot provide directly: open URL/app, observe the active screen, accessibility-tree targeting, click/type/hotkey/scroll, clipboard, native reminders, Mail/Messages sends behind confirmation, local Ollama models, and read/write access inside allowlisted folders. Shell execution remains disabled unless explicitly enabled.

Enable Android-style device takeover primitives:

```bash
SLYOS_AGENT_TOKEN=choose-a-local-secret \
SLYOS_ENABLE_DEVICE_CONTROL=1 \
npm run agent
```

The takeover loop is documented in `docs/DEVICE_TAKEOVER.md`: observe the screen, execute one primitive action, wait, observe again, and stop before sends, destructive changes, money, credentials, account settings, or ambiguity.

In the native Mac shell the bundled bridge is started automatically. Ask a prompt such as `open Notes and create a note called Launch plan`; ordinary reversible actions can execute immediately, while sends, destructive actions, money, credentials, and account/security changes remain confirmation-gated. The visual loop observes, acts in bounded batches, verifies the result, and replans for up to 32 observations.

## Open specific screens

The desktop shell supports direct screen routes so contributors can test the UI without clicking through every flow:

```text
http://localhost:5173/?screen=home
http://localhost:5173/?screen=now
http://localhost:5173/?screen=outbox
http://localhost:5173/?screen=reconnect
http://localhost:5173/?screen=memory
http://localhost:5173/?screen=memory-settings
http://localhost:5173/?screen=permissions
http://localhost:5173/?screen=feature-parity
http://localhost:5173/?screen=mission
http://localhost:5173/?screen=network
http://localhost:5173/?screen=research
http://localhost:5173/?screen=cowork
http://localhost:5173/?screen=chat
http://localhost:5173/?screen=operate
http://localhost:5173/?screen=skill
http://localhost:5173/?screen=documents
http://localhost:5173/?screen=investing
http://localhost:5173/?screen=vault
http://localhost:5173/?screen=backup
http://localhost:5173/?screen=floating-nav
http://localhost:5173/?screen=models
http://localhost:5173/?screen=per-app
http://localhost:5173/?screen=imports
http://localhost:5173/?screen=voice
http://localhost:5173/?screen=apps
http://localhost:5173/?screen=setup
```

Use browser device emulation or resize the window to test phone, tablet, and desktop behavior. On narrow screens the shell becomes full-screen. On desktop it stays inside a centered device preview.

## Project structure

```text
BADSCIENTIST/
  docs/
    ANDROID_BASELINE.md       Android reference and why it stays separate
    DEVICE_TAKEOVER.md        Prompt-to-device automation loop and OS limits
    PARITY_MATRIX.md          What each OS can and cannot match
    ROADMAP.md                Build phases
    REPO_SETUP.md             Repo setup notes
    SLYOS_PUBLIC_FEATURE_PARITY.md
  supabase/
    README.md                 Database setup guide
    schema.sql                Tables, grants, indexes, and RLS policies
  shared/
    agent-core/               Shared memory, action, planning, sync code
    design-tokens/            Shared visual tokens
    importers/                Future chat/document importers
    memory-schema/            Brain schema notes
    model-router/             Model routing notes
    parity-tests/             Cross-platform parity test plan
    tool-contracts/           Action schema and confirmation policy
  platforms/
    android-reference/        Notes only. Production Android is elsewhere.
    apple/SlyOSNative/        Shared native Apple WebKit wrapper and Xcode project
    desktop-agent/            Localhost OS action bridge for desktop platforms
    desktop-shell/            Runnable Vite/TypeScript shell
    ios/                      SwiftUI/App Intents source scaffold
    linux/                    Linux adapter notes
    macos/                    macOS adapter notes
    windows/                  Windows adapter notes
  tools/
    data-migration/
    device/
    release/
  website/
  private-data/               Local ignored data only
```

## Android reference

The production Android tree is intentionally not moved into this repo:

```text
/Users/emilshirokikh/Downloads/MADSCIENTIST/agentos
```

Android is the reference because it can expose platform hooks other OSes cannot fully match:

- Home launcher replacement
- NotificationListenerService
- RemoteInput replies
- AccessibilityService screen reading and gestures
- Overlay service
- SMS, calendar, camera, contacts, files, package queries
- ADB and Gradle install flows

Moving Android right now would risk breaking Gradle paths, release scripts, website links, and ADB install commands. BADSCIENTIST mirrors behavior first; repo restructuring can come later once parity is proven.

## Database status

The app ships with a default Supabase project URL and publishable key for the current SlyOS test sync target:

```text
https://xfftheaprdedypqlcvzg.supabase.co
```

The publishable key is public by design. User data is protected by Supabase Auth and Row Level Security, so each user must create/sign into an account before pushing or pulling memory. For your own deployment, replace the URL/key with your own Supabase project in `.env` or in the Setup screen.

Already in this repo:

- `supabase/schema.sql` creates the sync tables.
- `supabase/migrations/20260710000000_initial_sync_schema.sql` is ready for Supabase CLI migration workflows.
- `supabase/migrations/20260710010000_android_account_contract.sql` aligns the DB with Android's account/sync contract.
- `supabase/config.toml` supports a local Supabase stack.
- Android-compatible `profiles`, `brain_items`, `vault_items`, and `vault_meta` tables are included.
- Row Level Security is enabled on all user data tables.
- Policies restrict rows by `auth.uid() = user_id`.
- Explicit `grant` statements expose the intended tables to authenticated users.
- `shared/agent-core/src/supabaseSync.ts` contains the browser client sync adapter.
- The desktop shell has a setup UI for URL, publishable key, email/password auth, push brain, and pull brain.
- `npm run db:check` checks local DB readiness without printing secrets.
- `npm run db:apply` applies the schema when `SUPABASE_DB_URL` is set.

Still required for self-hosted deployments:

1. Create a Supabase project.
2. Run `supabase/schema.sql` in the Supabase SQL editor.
3. Enable email/password auth.
4. Copy the project URL and publishable/anon key.
5. Use those values in the desktop shell Setup screen or local `.env`.
6. Sign in before pushing or pulling memory.

Never put a Supabase service-role key in this repo or in browser/mobile clients.

Apply the schema from the terminal when you have a DB URL:

```bash
SUPABASE_DB_URL='postgresql://...' npm run db:apply
```

## Supabase local config

Copy the example file:

```bash
cp .env.example .env
```

Fill it with your project values:

```bash
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_PUBLISHABLE_KEY=your-publishable-or-anon-key
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-or-anon-key
```

The current browser shell also accepts those values at runtime from `Setup`.

## What the shell currently mirrors

The web shell is meant to feel like SlyOS, not like a SaaS dashboard. Current main surfaces include:

- Home prompt: "what should happen?"
- Bottom nav: Home, Now, Brain, Research, Apps
- Now catch-up digest and waiting notification
- Sent for you outbound log
- Reconnect quiet contacts flow
- Brain memory graph with real canvas depth, rotation, filters, search, and selected-node details
- Memory settings cards
- Mission picker
- My network search
- Research workspace
- Cowork local-agent workspace
- Dark listening/voice graph
- Setup and Supabase sync controls
- Apps/manual fallback surfaces

Desktop operation path:

- `platforms/desktop-agent` runs the local OS bridge.
- `shared/tool-contracts/LOCAL_DEVICE_BRIDGE.md` defines the endpoint/action contract.
- `docs/DEVICE_TAKEOVER.md` defines the observe/click/type/verify loop.
- File writes are restricted to allowed roots.
- Pointer/keyboard/clipboard control requires `SLYOS_ENABLE_DEVICE_CONTROL=1`.
- Shell execution is off unless `SLYOS_ENABLE_SHELL=1`.

The shell is intentionally responsive:

- Desktop browser: centered phone preview
- Native macOS: full-window OS-style app
- Phone/tablet: full-screen OS-style app
- Short screens: compressed card spacing and graph height
- Narrow screens: wrapped memory search and smaller text controls

The shell is also PWA-installable:

- `manifest.webmanifest` exposes install metadata and shortcuts.
- `sw.js` caches the app shell.
- `offline.html` gives a controlled offline state.
- `npm run release:web` builds a ZIP with `INSTALL.md` and `RELEASE.json`.

## Platform plan

| Platform | Target shape | Hard limits |
| --- | --- | --- |
| Android | Existing production launcher app | Stays in `MADSCIENTIST/agentos` for now |
| iOS | Generated native SwiftUI/WebKit project with App Intents path, Shortcuts, files, camera, memory | Needs full Xcode, signing team, and cabled device run; no launcher replacement, broad notification listener, or arbitrary app control |
| macOS | Runnable native WebKit `SlyOS.app` plus desktop agent bridge for Accessibility API, screen capture, files, browser, terminal | Requires user-granted permissions; current app is ad-hoc signed, not notarized |
| Linux | Desktop shell with tray/command palette, screenshot, terminal, browser, local models | Wayland/X11 and desktop environment differences |
| Windows | Desktop shell with tray, UI Automation, screen capture, browser, Office/file workflows | Permission and app automation differences |

## Contributor workflow

Before changing code:

```bash
git status --short --branch
npm run typecheck
```

After changing code:

```bash
npm run typecheck
npm run build
```

For UI work, verify at minimum:

- `?screen=home`
- `?screen=now`
- `?screen=memory`
- `?screen=memory-settings`
- `?screen=research`
- `?screen=voice`

Check both:

- Desktop preview width
- Mobile width below 760px

## Security and privacy rules

Do not commit:

- API keys
- Supabase service-role keys
- Device backups
- Raw chat exports
- App databases
- Private screenshots
- LinkedIn, Instagram, Telegram, WhatsApp exports
- APKs or installers unless a release policy explicitly allows them

Use `private-data/` for local-only files. It is ignored except for `.gitkeep`.

## Current north star

The goal is not to fake Android on every OS. The goal is to preserve the SlyOS experience:

1. Every request flows through the brain.
2. Memory and settings are portable.
3. Consequential actions are explicit and confirmation-gated.
4. Each OS uses the deepest native access it safely exposes.
5. Unsupported Android-only powers are documented honestly, not hidden.
