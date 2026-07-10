# BADSCIENTIST

Cross-platform rebuild workspace for SlyOS / AgentOS on non-Android platforms.

This repo is intentionally separate from the existing Android production tree at:

```text
/Users/emilshirokikh/Downloads/MADSCIENTIST/agentos
```

The Android app remains the reference implementation. BADSCIENTIST is where we map, rebuild, and test the closest possible equivalents for iOS, macOS, Linux, and Windows without breaking the Android deployment path.

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

## One-shot reality check

A perfect Android clone on iOS, macOS, Linux, and Windows is not technically honest. Android exposes launcher, notification, accessibility, overlay, and SMS hooks that iOS does not expose, and desktop OSes expose different automation primitives.

The scalable plan is:

- Android: keep Kotlin/Compose production app as the behavioral reference.
- macOS/Linux/Windows: build one shared desktop agent shell with native OS adapters.
- iOS: build a native SwiftUI companion with App Intents, Shortcuts, Share Extension, widgets, camera, files, memory, and explicit user-confirmed actions.
- Shared: centralize schemas, prompts, action contracts, memory models, importers, and parity tests.

## GitHub target

Planned remote:

```text
https://github.com/BeltoAI/AI_Operating_System_For_Not_Android.git
```

Do not commit API keys, local exports, device backups, app databases, or personal data.

