# BADSCIENTIST

Cross-platform SlyOS / AgentOS rebuild for iOS, macOS, Linux, and Windows.

BADSCIENTIST is the non-Android workspace for the SlyOS idea: a phone or desktop surface where every request flows through a personal agent brain, memory, settings, and confirmation-gated actions.

The Android app remains the richest reference implementation. This repo rebuilds the closest possible equivalents for other operating systems without moving or breaking the existing Android production path.

Repository:

```text
https://github.com/BeltoAI/AI_Operating_System_For_Not_Android
```

## Read this first

This repo is useful today, but it is not a finished App Store / desktop installer product yet.

What works today:

- A runnable SlyOS-style web shell for local development.
- Shared TypeScript agent contracts for memory, planning, actions, and sync.
- A Supabase schema for optional cross-device memory and settings sync.
- iOS SwiftUI/App Intents source scaffolding.
- Platform folders for macOS, Linux, Windows, iOS, and Android reference notes.
- Documentation for parity, roadmap, setup, and Android baseline limits.

What does not exist yet:

- Finished native iOS app project ready for TestFlight.
- Finished macOS, Linux, or Windows installers.
- Full Android-level notification listener, launcher, overlay, or accessibility behavior on other OSes.
- A pre-provisioned cloud database for every clone of this repo.

Important: `localhost` shows a browser-based iPhone-shaped preview. It is not the native iPhone app. The native iOS work lives under `platforms/ios`.

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
```

## Open specific screens

The desktop shell supports direct screen routes so contributors can test the UI without clicking through every flow:

```text
http://localhost:5173/?screen=home
http://localhost:5173/?screen=now
http://localhost:5173/?screen=outbox
http://localhost:5173/?screen=reconnect
http://localhost:5173/?screen=memory
http://localhost:5173/?screen=memory-settings
http://localhost:5173/?screen=mission
http://localhost:5173/?screen=network
http://localhost:5173/?screen=research
http://localhost:5173/?screen=cowork
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
    PARITY_MATRIX.md          What each OS can and cannot match
    ROADMAP.md                Build phases
    REPO_SETUP.md             Repo setup notes
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

The database is prepared in code, not already provisioned in the cloud.

Already in this repo:

- `supabase/schema.sql` creates the sync tables.
- Row Level Security is enabled on all user data tables.
- Policies restrict rows by `auth.uid() = user_id`.
- Explicit `grant` statements expose the intended tables to authenticated users.
- `shared/agent-core/src/supabaseSync.ts` contains the browser client sync adapter.
- The desktop shell has a setup UI for URL, publishable key, magic-link auth, push brain, and pull brain.

Still required for every real deployment:

1. Create a Supabase project.
2. Run `supabase/schema.sql` in the Supabase SQL editor.
3. Enable email magic links.
4. Copy the project URL and publishable/anon key.
5. Use those values in the desktop shell Setup screen or local `.env`.
6. Sign in before pushing or pulling memory.

Never put a Supabase service-role key in this repo or in browser/mobile clients.

## Supabase local config

Copy the example file:

```bash
cp .env.example .env
```

Fill it with your project values:

```bash
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_PUBLISHABLE_KEY=your-publishable-or-anon-key
```

The current browser shell also accepts those values at runtime from `Setup`.

## What the shell currently mirrors

The web shell is meant to feel like SlyOS, not like a SaaS dashboard. Current main surfaces include:

- Home prompt: "what should happen?"
- Bottom nav: Home, Now, Brain, Research, Apps
- Now catch-up digest and waiting notification
- Sent for you outbound log
- Reconnect quiet contacts flow
- Brain memory graph
- Memory settings cards
- Mission picker
- My network search
- Research workspace
- Cowork local-agent workspace
- Dark listening/voice graph
- Setup and Supabase sync controls
- Apps/manual fallback surfaces

The shell is intentionally responsive:

- Desktop: centered phone preview
- Phone/tablet: full-screen OS-style app
- Short screens: compressed card spacing and graph height
- Narrow screens: wrapped memory search and smaller text controls

## Platform plan

| Platform | Target shape | Hard limits |
| --- | --- | --- |
| Android | Existing production launcher app | Stays in `MADSCIENTIST/agentos` for now |
| iOS | Native SwiftUI companion with App Intents, Shortcuts, widgets, Share Extension, files, camera, memory | No launcher replacement, broad notification listener, or arbitrary app control |
| macOS | Native shell around shared agent with menu bar, global shortcut, Accessibility API, screen capture, files, browser, terminal | Requires user-granted permissions |
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
