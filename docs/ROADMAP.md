# Roadmap

## Phase 0: Repo and parity foundation

- Keep Android production untouched.
- Define shared action, memory, model-routing, and import contracts.
- Document exact Android feature baseline.
- Create per-platform capability maps.
- Add smoke/parity test descriptions before implementation.

Status: started. The shared TypeScript core, SlyOS-matched desktop shell, installable PWA metadata, desktop device-agent bridge, prompt-to-device takeover primitives, release artifact builder, Supabase schema/migration/config, direct screen QA routes, responsive web shell, and iOS source scaffold now exist.

## Phase 1: Shared core contracts

- Agent action schema
- Tool confirmation policy
- Memory schema
- Model router schema
- Import format normalization
- Design tokens
- Test prompts and expected tool plans

## Phase 2: Desktop shell

Target macOS, Linux, and Windows together.

- Native app shell
- tray/menu bar entry
- global prompt shortcut
- local memory store
- file/document ingestion
- browser/file/terminal tools
- screenshot/screen context capture
- explicit confirmation for sends, posts, payments, deletes, and external actions

Current implementation: the shared Vite/TypeScript shell mirrors the main Android SlyOS surfaces and runs inside a native full-screen macOS WebKit host. The signed Mac app bundles a localhost device agent, persistent diagnostics, allowlisted file tools, native reminders, Mail/Messages confirmation flows, local Ollama fallback, and a bounded observe-act-verify-replan loop.

Current release path: `npm run release:all` builds a downloadable PWA ZIP plus a desktop-agent ZIP, and `npm run release:macos-app` builds a signed local Mac app ZIP. Public macOS distribution still needs hardened release signing and notarization. Linux and Windows currently use the web shell plus desktop agent while native installers remain pending.

Current operation path: `npm run agent` starts a localhost desktop bridge for macOS/Linux/Windows actions that browsers cannot perform directly. The bridge requires a bearer token, restricts file writes to allowed roots, and keeps shell execution disabled by default.

Current takeover path: `SLYOS_ENABLE_DEVICE_CONTROL=1 npm run agent` enables observe-screen, front-app, clipboard, pointer click, keyboard typing, hotkeys, scroll where supported, and wait primitives. The planned agent loop is observe -> act -> wait -> observe until done or a confirmation boundary is reached.

## Phase 3: iOS companion

- SwiftUI app
- App Intents
- Shortcuts integration
- Share Extension
- widgets
- camera Look
- receipt/doc ingestion
- memory search
- explicit action drafts

Current implementation: generated Xcode project, native SwiftUI/WebKit shell, full-screen launch storyboard, App Intents, Shortcuts handoffs, camera/microphone and file bridges, native contacts/calendar/reminders, Supabase account sync, and Apple Foundation Models when the device supports them. Signed cabled installation has been verified on an iPhone 15 Pro Max.

## Phase 4: Cross-platform sync and website

- Device-independent export/import
- optional encrypted sync target
- release artifacts per platform
- website download pages
- platform-specific install instructions

Current implementation: Supabase schema, Android-compatible migration, config, browser sync adapter, readiness checker, DB apply script, and live client probe exist. The configured SlyOS project exposes `profiles`, `brain_items`, `vault_items`, and `vault_meta` with RLS and email/password auth. Users can also bring their own Supabase project by applying `supabase/schema.sql`.

## Current native blockers

- iOS does not permit arbitrary cross-app screen observation and tapping. SlyOS uses App Intents, Shortcuts, native APIs, URL handoffs, and explicit compose/share surfaces instead.
- Public iOS distribution needs an Apple Developer release team and TestFlight/App Store signing. Personal-team cable builds expire after seven days and only run on provisioned devices.
- Public macOS distribution needs hardened release signing and notarization. The local Apple Development-signed app is installable on this Mac.
- Linux and Windows still need native installer packaging and OS-specific end-to-end device testing.

## Phase 5: Parity hardening

- Compare Android behavior against each platform.
- Track every unsupported feature as limitation or workaround.
- Run device tests on MacBook, Linux PC, Windows PC, iPhone, and Android phone.
