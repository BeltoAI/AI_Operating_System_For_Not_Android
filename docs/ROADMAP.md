# Roadmap

## Phase 0: Repo and parity foundation

- Keep Android production untouched.
- Define shared action, memory, model-routing, and import contracts.
- Document exact Android feature baseline.
- Create per-platform capability maps.
- Add smoke/parity test descriptions before implementation.

Status: started. The shared TypeScript core, SlyOS-matched desktop shell, installable PWA metadata, desktop device-agent bridge, release artifact builder, Supabase schema/migration/config, direct screen QA routes, responsive web shell, and iOS source scaffold now exist.

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

Current implementation: Vite/TypeScript shell that mirrors the main Android SlyOS surfaces: Boot, Lock, Home, Now, Sent for you, Reconnect, Memory, Memory settings, Mission, My network, Research, Cowork, Voice/listening, Apps, Setup, Look, Expenses, and Manual Mode. Native packaging and OS adapters are next.

Current release path: `npm run release:all` builds a downloadable PWA ZIP plus a desktop-agent ZIP. The PWA is installable through Safari/Chrome/Edge today; the desktop-agent gives macOS/Linux/Windows a local OS-action bridge. Native desktop installers require Rust/Tauri or another native wrapper.

Current operation path: `npm run agent` starts a localhost desktop bridge for macOS/Linux/Windows actions that browsers cannot perform directly. The bridge requires a bearer token, restricts file writes to allowed roots, and keeps shell execution disabled by default.

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

Current implementation: SwiftUI/App Intents source scaffold. Xcode project wiring is next.

## Phase 4: Cross-platform sync and website

- Device-independent export/import
- optional encrypted sync target
- release artifacts per platform
- website download pages
- platform-specific install instructions

Current implementation: Supabase schema, migration, config, browser sync adapter, readiness checker, and DB apply script exist. Each user still needs to create their own Supabase project, run `supabase/schema.sql` or `npm run db:apply` with `SUPABASE_DB_URL`, enable magic-link auth, and configure a publishable client key.

## Current native blockers

- Full Xcode is not selected on this Mac, so `.ipa`/TestFlight archives cannot be built here yet.
- Rust/Tauri are not installed, so native macOS/Linux/Windows installers cannot be built here yet.
- Supabase credentials are not present, so a live hosted DB cannot be provisioned from this checkout yet.

## Phase 5: Parity hardening

- Compare Android behavior against each platform.
- Track every unsupported feature as limitation or workaround.
- Run device tests on MacBook, Linux PC, Windows PC, iPhone, and Android phone.
