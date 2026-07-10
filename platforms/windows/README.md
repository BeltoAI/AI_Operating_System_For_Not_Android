# Windows

Recommended shape: shared desktop agent shell with Windows adapter.

Closest parity surfaces:

- system tray app
- global prompt shortcut
- screenshot/screen context capture
- UI Automation API
- filesystem and Office document workflows
- browser automation
- local model runners where hardware allows

Windows should share most desktop code with macOS and Linux, while keeping OS-specific automation behind an adapter boundary.

Current shared operation bridge: run `npm run agent` from the repo root to start the localhost desktop device agent.

Enable prompt-to-device control:

```powershell
$env:SLYOS_AGENT_TOKEN="choose-a-local-secret"
$env:SLYOS_ENABLE_DEVICE_CONTROL="1"
npm run agent
```

The bridge uses PowerShell, SendKeys, and User32 from the active user session. UI Automation should become the deeper adapter for reliable element-level control.
