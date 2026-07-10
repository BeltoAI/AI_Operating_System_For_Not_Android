# Desktop Device Agent

Localhost bridge for macOS, Linux, and Windows device actions.

The PWA shell is intentionally browser-sandboxed. This agent is the native-power companion: it runs locally, listens only on `127.0.0.1`, requires a bearer token, and exposes a small set of explicit actions.

## Run

From the repo root:

```bash
npm run agent
```

The agent prints:

- URL, default `http://127.0.0.1:4317`
- generated token if `SLYOS_AGENT_TOKEN` is not set
- allowed file roots
- detected capabilities
- whether device control and shell execution are enabled

## Environment

```bash
SLYOS_AGENT_PORT=4317
SLYOS_AGENT_TOKEN=choose-a-local-secret
SLYOS_ALLOWED_ROOTS="$HOME/Downloads/BADSCIENTIST/private-data"
SLYOS_ENABLE_DEVICE_CONTROL=0
SLYOS_ENABLE_SHELL=0
```

Pointer, keyboard, clipboard, and observe-loop actions require `SLYOS_ENABLE_DEVICE_CONTROL=1`.
Shell command execution is disabled unless `SLYOS_ENABLE_SHELL=1`.

## Endpoints

```text
GET  /health
GET  /capabilities
POST /actions
```

All endpoints except `/health` require:

```text
Authorization: Bearer <token>
```

## Actions

```json
{ "type": "open_url", "url": "https://example.com" }
{ "type": "open_app", "app": "Safari" }
{ "type": "screenshot" }
{ "type": "observe_screen" }
{ "type": "get_frontmost_app" }
{ "type": "get_clipboard" }
{ "type": "set_clipboard", "text": "hello" }
{ "type": "type_text", "text": "hello" }
{ "type": "key_press", "key": "return", "modifiers": [] }
{ "type": "hotkey", "keys": ["cmd", "l"] }
{ "type": "pointer_move", "x": 320, "y": 640 }
{ "type": "pointer_click", "x": 320, "y": 640, "button": "left", "clicks": 1 }
{ "type": "scroll", "deltaY": 480 }
{ "type": "wait", "ms": 500 }
{ "type": "list_dir", "path": "/allowed/root" }
{ "type": "write_file", "path": "/allowed/root/note.txt", "content": "hello", "overwrite": false }
{ "type": "run_command", "command": "echo", "args": ["hello"] }
```

Use device control as a loop:

```text
observe_screen -> click/type/hotkey/scroll -> wait -> observe_screen
```

`run_command` only works when `SLYOS_ENABLE_SHELL=1`.

## Safety model

- Localhost only.
- Bearer token required.
- Device control opt-in through `SLYOS_ENABLE_DEVICE_CONTROL=1`.
- File writes are restricted to allowed roots.
- No shell by default.
- No destructive delete endpoint.
- Browser/PWA integration should still show confirmation before consequential actions.

## OS notes

- macOS: grant Accessibility and Screen Recording. Install `cliclick` for precise pointer move, right click, double click, and scroll.
- Linux: use X11 plus `xdotool` for the strongest click/type support; Wayland support depends on compositor permissions.
- Windows: uses PowerShell, SendKeys, and User32 from the active user session.
