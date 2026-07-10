# Local Device Bridge Contract

The desktop device agent is a localhost bridge for native OS actions that a browser/PWA cannot perform directly.

Default URL:

```text
http://127.0.0.1:4317
```

Security boundary:

- The bridge listens only on localhost.
- All non-health endpoints require `Authorization: Bearer <token>`.
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
{ "type": "list_dir", "path": "/allowed/root" }
{ "type": "write_file", "path": "/allowed/root/note.txt", "content": "hello", "overwrite": false }
{ "type": "run_command", "command": "echo", "args": ["hello"] }
```

`run_command` requires:

```bash
SLYOS_ENABLE_SHELL=1
```
