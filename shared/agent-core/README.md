# Shared Agent Core

This folder owns contracts before implementation.

The Android app currently contains the richest agent behavior. For cross-platform work, extract the ideas into stable contracts instead of copying Android internals directly.

Core responsibilities:

- convert user prompts into tool plans
- separate read-only tools from consequential action tools
- mark tainted context from web/pages/screens
- require confirmation for sends, posts, payments, deletes, installs, and external side effects
- return structured results that every native shell can render

Initial implementation can be TypeScript or Rust-backed TypeScript depending on the desktop shell choice. The key is that platform adapters are thin and the agent contract remains portable.

