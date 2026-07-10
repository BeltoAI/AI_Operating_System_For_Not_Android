# BADSCIENTIST

Cross-platform rebuild workspace for SlyOS / AgentOS on iOS, macOS, Linux, and Windows.

This repo is intentionally separate from the existing Android production tree at:

```text
/Users/emilshirokikh/Downloads/MADSCIENTIST/agentos
```

The Android app remains the reference implementation. BADSCIENTIST is where we map, rebuild, and test the closest possible equivalents for iOS, macOS, Linux, and Windows without breaking the Android deployment path.

GitHub target:

```text
https://github.com/BeltoAI/AI_Operating_System_For_Not_Android.git
```

## Current status

This repo now contains:

- shared TypeScript agent core
- shared action risk/confirmation contract
- local browser memory store
- optional Supabase memory/settings sync client
- runnable SlyOS-matched desktop web shell for macOS/Linux/Windows development
- iOS SwiftUI/App Intents source scaffold
- Supabase setup SQL with RLS
- OS parity matrix and platform notes

It does not yet contain finished native app bundles/installers. The desktop shell is intentionally the first runnable surface; native wrappers come next.

## Why this exists

The current Android build depends on Android-specific capabilities:

- HOME launcher replacement
- NotificationListener reply actions
- AccessibilityService screen reading and gesture execution
- overlay service
- SMS, calendar, camera, contacts, and app-intent style Android APIs
- ADB install and Gradle release flow

Those capabilities do not map 1:1 to every OS. The goal here is therefore:

1. Preserve Android as the canonical behavior reference.
2. Define shared agent contracts once.
3. Build each OS with native capabilities where possible.
4. Mark every feature as same, equivalent, limited, or impossible per platform.

## Structure

```text
BADSCIENTIST/
  docs/                         product baseline, roadmap, parity matrix
  supabase/                     optional cross-device sync schema
  shared/                       cross-platform schemas and contracts
    agent-core/
    design-tokens/
    importers/
    memory-schema/
    model-router/
    parity-tests/
    tool-contracts/
  platforms/
    android-reference/          notes only; production Android stays in MADSCIENTIST/agentos
    ios/
    linux/
    macos/
    windows/
  tools/
    data-migration/
    device/
    release/
  website/                      future cross-platform site/docs
  private-data/                 ignored local data only
```

## Quick start

Install dependencies:

```bash
cd /Users/emilshirokikh/Downloads/BADSCIENTIST
npm install
```

Run typechecks:

```bash
npm run typecheck
```

Build everything:

```bash
npm run build
```

Run the desktop shell:

```bash
npm run dev
```

Then open the Vite URL shown in the terminal.

## What runs today

### Shared core

Location:

```text
shared/agent-core
```

The shared core owns:

- `planPrompt`: prompt-to-action-plan skeleton
- `AgentAction`: portable action envelope
- confirmation gates for external sends, destructive actions, financial actions, and security-sensitive actions
- `MemoryStore`: local memory/settings contract
- `createBrainSyncClient`: Supabase sync client
- platform capability data

### Desktop shell

Location:

```text
platforms/desktop-shell
```

This is the first shared macOS/Linux/Windows surface. It currently provides:

- SlyOS Boot → Lock → Home flow
- exact warm ivory/orange/ink design-token palette from the Android preview
- Caveat wordmark and Inter/SF-style UI font stack
- Android-style Home prompt: "what should happen?"
- Look, Docs, Expenses, and Setup launcher shortcuts
- bottom SlyOS nav with Brain centered and emphasized
- Now feed with suggested action, catch-up brief, waiting threads, and reply drafts
- Memory screen with ask/search, graph-like memory map, and remember flow
- Manual Mode fallback with agent pause/resume
- visible confirmation-gated Brain action queue
- optional Supabase magic-link sync UI in Setup

The native desktop plan is to wrap this shell with Tauri once Rust is installed, then add per-OS adapters for screen capture, accessibility, shortcuts, tray/menu, filesystem, terminal, browser, and local model integrations.

Visual source of truth:

```text
/Users/emilshirokikh/Downloads/MADSCIENTIST/agentos/ui/tokens.json
/Users/emilshirokikh/Downloads/MADSCIENTIST/agentos/ui/screens/preview.html
/Users/emilshirokikh/Downloads/MADSCIENTIST/agentos/android/AgentShell/src/main/java/com/agentos/shell/screens
```

The shell is now intentionally phone/OS-like, not dashboard-like.

### iOS companion

Location:

```text
platforms/ios/SlyOSCompanion/Sources/SlyOSCompanion
```

The iOS source scaffold includes:

- SwiftUI tab shell
- command center
- local memory view
- action queue
- settings view
- App Intents for Ask SlyOS, Remember, and Memory

This still needs to be placed into an Xcode iOS app project before it can run on the iPhone.

## Supabase sync

Supabase is optional. It is meant for free-start cross-device memory/settings sync, not for raw secrets.

Setup:

1. Create a Supabase project.
2. Open the SQL editor.
3. Run `supabase/schema.sql`.
4. Enable email magic-link auth.
5. Use your project URL and publishable/anon client key in the desktop shell.

Security rules built into the schema:

- RLS enabled on all user tables.
- Authenticated users can only access rows where `auth.uid() = user_id`.
- No anon table access is granted.
- No service-role key is needed or allowed in clients.
- Tables have explicit grants for authenticated Data API access.

Synced tables:

- `devices`
- `settings`
- `memory_items`
- `action_log`
- `expenses`
- `file_metadata`

## One-shot reality check

A perfect Android clone on iOS, macOS, Linux, and Windows is not technically honest. Android exposes launcher, notification, accessibility, overlay, and SMS hooks that iOS does not expose, and desktop OSes expose different automation primitives.

The scalable plan is:

- Android: keep Kotlin/Compose production app as the behavioral reference.
- macOS/Linux/Windows: build one shared desktop agent shell with native OS adapters.
- iOS: build a native SwiftUI companion with App Intents, Shortcuts, Share Extension, widgets, camera, files, memory, and explicit user-confirmed actions.
- Shared: centralize schemas, prompts, action contracts, memory models, importers, and parity tests.

## Device access strategy

| Platform | Best access path | Hard limit |
| --- | --- | --- |
| Android | existing launcher, notifications, accessibility, overlay, SMS/calendar APIs | production stays in `MADSCIENTIST/agentos` for now |
| macOS | menu bar/tray, global shortcut, Accessibility API, screen capture, files, terminal, browser | permissions are user-granted and per-device |
| Linux | tray/command palette, screenshot, terminal, browser, local models | Wayland/X11 and desktop environment differences |
| Windows | system tray, UI Automation, screen capture, filesystem, browser, Office workflows | permissions and app-specific automation vary |
| iOS | SwiftUI app, App Intents, Shortcuts, Share Extension, widgets, camera, files | no launcher replacement, broad notification listener, or arbitrary app control |

## Repo hygiene

Do not commit:

- API keys
- local exports
- device backups
- app databases
- LinkedIn/Instagram/Telegram/WhatsApp data
- Supabase service-role keys
- APKs or installers unless release policy says so

Private local data belongs in `private-data/`, which is ignored except for `.gitkeep`.
