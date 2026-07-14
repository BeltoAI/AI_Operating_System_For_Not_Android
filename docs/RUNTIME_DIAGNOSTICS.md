# Runtime diagnostics

SlyOS records local evidence for startup, account sync, brain writes, model calls, and desktop-control actions. API keys and prompt text are not written to the diagnostic logs.

## In the app

Open `Brain -> Settings -> Diagnostics`.

The screen shows:

- whether the local bridge is reachable;
- the real macOS Screen Recording and Accessibility permission state;
- the signed-in Supabase account state;
- local brain and portable-setting counts;
- recent app events and the desktop-agent JSONL tail.

## From Terminal

With the native Mac app open:

```bash
npm run doctor
```

For a separately started bridge, pass the same token used to launch it:

```bash
SLYOS_AGENT_TOKEN=your-local-token npm run doctor
```

Verify the cross-device database independently:

```bash
npm run db:probe
```

## Log locations

macOS:

```text
~/Library/Logs/SlyOS/host.log
~/Library/Logs/SlyOS/device-agent.log
~/Library/Logs/SlyOS/device-agent-console.log
```

Windows:

```text
%LOCALAPPDATA%\SlyOS\Logs\device-agent.log
```

Linux:

```text
$XDG_STATE_HOME/slyos/device-agent.log
```

When `XDG_STATE_HOME` is unset, Linux uses `~/.local/state/slyos/device-agent.log`.

## Interpreting Mac control

`bridge online` means the localhost helper is running. It does not mean macOS has granted privacy permissions.

For visual device operation, both must be allowed:

1. `System Settings -> Privacy & Security -> Screen Recording`
2. `System Settings -> Privacy & Security -> Accessibility`

Automation permission is used for frontmost-app observation. After changing either permission, quit and reopen SlyOS, then press `Refresh permissions` in Setup.

App launching and opening URLs can work without Screen Recording. Visual observe-click-type loops cannot.
