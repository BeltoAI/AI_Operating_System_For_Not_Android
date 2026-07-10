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

## Environment

```bash
SLYOS_AGENT_PORT=4317
SLYOS_AGENT_TOKEN=choose-a-local-secret
SLYOS_ALLOWED_ROOTS="$HOME/Downloads/BADSCIENTIST/private-data"
SLYOS_ENABLE_SHELL=0
```

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
{ "type": "list_dir", "path": "/allowed/root" }
{ "type": "write_file", "path": "/allowed/root/note.txt", "content": "hello", "overwrite": false }
{ "type": "run_command", "command": "echo", "args": ["hello"] }
```

`run_command` only works when `SLYOS_ENABLE_SHELL=1`.

## Safety model

- Localhost only.
- Bearer token required.
- File writes are restricted to allowed roots.
- No shell by default.
- No destructive delete endpoint.
- Browser/PWA integration should still show confirmation before consequential actions.
