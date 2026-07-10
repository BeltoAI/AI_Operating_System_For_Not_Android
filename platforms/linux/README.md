# Linux

Recommended shape: shared desktop agent shell with Linux adapter.

Closest parity surfaces:

- tray app where desktop environment supports it
- global command palette
- screenshot/screen context capture
- local filesystem and terminal tools
- browser automation
- document/receipt ingestion
- local model runners

Notes:

- Wayland and X11 have different automation/screenshot permissions.
- GNOME, KDE, and other desktop environments may need separate adapters.
- Linux is likely the best platform for local models and terminal-heavy agent workflows.

Current shared operation bridge: run `npm run agent` from the repo root to start the localhost desktop device agent.

Enable prompt-to-device control:

```bash
SLYOS_AGENT_TOKEN=choose-a-local-secret \
SLYOS_ENABLE_DEVICE_CONTROL=1 \
npm run agent
```

For strongest automation, use X11 with `xdotool`. On Wayland, install/use compositor-approved tools such as `wtype`, `wl-copy`, and `wl-paste` where available; pointer control may remain limited by the compositor.
