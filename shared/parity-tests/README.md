# Parity Tests

Parity tests define what "close to Android" means.

Each test should include:

- prompt
- expected intent
- expected action plan
- required confirmation behavior
- platform-specific allowed fallback

Example:

```text
Prompt: "Find Anna's email and send her the invite."
Expected:
- read memory/contact data
- draft email
- require confirmation before send
iOS fallback:
- open mail compose or create draft
Desktop fallback:
- create draft or use configured email adapter
```

