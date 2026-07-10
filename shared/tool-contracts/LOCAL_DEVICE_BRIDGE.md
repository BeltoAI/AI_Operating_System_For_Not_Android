# Local Device Bridge Contract

The desktop device agent is a localhost bridge for native OS actions that a browser/PWA cannot perform directly.

Default URL:

```text
http://127.0.0.1:4317
```

Security boundary:

- The bridge listens only on localhost.
- All non-health endpoints require `Authorization: Bearer <token>`.
- Pointer, keyboard, clipboard, and observe-loop actions require `SLYOS_ENABLE_DEVICE_CONTROL=1`.
- File writes are restricted to `SLYOS_ALLOWED_ROOTS`.
- Shell execution is disabled unless `SLYOS_ENABLE_SHELL=1`.
- The UI must still ask for confirmation before consequential actions.

Endpoints:

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Process health, no auth required |
| `GET` | `/capabilities` | OS and enabled action capabilities |
| `POST` | `/actions` | Execute one explicit action |

Supported actions:

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

Device control requires:

```bash
SLYOS_ENABLE_DEVICE_CONTROL=1
```

`run_command` requires:

```bash
SLYOS_ENABLE_SHELL=1
```

Automation loop:

```text
observe_screen -> primitive action -> wait -> observe_screen -> repeat
```

Stop before external sends, destructive changes, financial actions, credentials, account settings, or ambiguous screens.
