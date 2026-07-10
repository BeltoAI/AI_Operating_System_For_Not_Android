# Roadmap

## Phase 0: Repo and parity foundation

- Keep Android production untouched.
- Define shared action, memory, model-routing, and import contracts.
- Document exact Android feature baseline.
- Create per-platform capability maps.
- Add smoke/parity test descriptions before implementation.

Status: started. The shared TypeScript core, desktop shell, Supabase schema, and iOS source scaffold now exist.

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

Current implementation: Vite/TypeScript shell. Native packaging and OS adapters are next.

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

## Phase 5: Parity hardening

- Compare Android behavior against each platform.
- Track every unsupported feature as limitation or workaround.
- Run device tests on MacBook, Linux PC, Windows PC, iPhone, and Android phone.
