# Device Takeover

This is the Android parity target that matters most: given a prompt, SlyOS should look at the active device, decide the next safe step through the brain, click/type/open what is needed, verify the result, and continue until the task is done or it reaches a hard stop.

## Execution Loop

Every autonomous device task should use this loop:

```text
prompt
  -> memory/persona/settings context
  -> observe_screen
  -> plan next primitive action
  -> execute one primitive action
  -> wait
  -> observe_screen again
  -> repeat
  -> stop for completion, ambiguity, or required confirmation
```

The loop must pause before:

- Sending messages, emails, posts, invites, or transactions
- Deleting or overwriting user data
- Buying, selling, paying, trading, or moving money
- Editing credentials, security settings, account ownership, or privacy settings
- Any moment where the screen state is ambiguous

## Local Bridge Primitives

`platforms/desktop-agent` exposes the device-control primitives over localhost:

```json
{ "type": "observe_screen" }
{ "type": "get_frontmost_app" }
{ "type": "get_clipboard" }
{ "type": "set_clipboard", "text": "..." }
{ "type": "type_text", "text": "..." }
{ "type": "key_press", "key": "return", "modifiers": [] }
{ "type": "hotkey", "keys": ["cmd", "l"] }
{ "type": "pointer_move", "x": 320, "y": 640 }
{ "type": "pointer_click", "x": 320, "y": 640, "button": "left", "clicks": 1 }
{ "type": "scroll", "deltaY": 480 }
{ "type": "wait", "ms": 500 }
```

Enable it explicitly:

```bash
SLYOS_AGENT_TOKEN=choose-a-local-secret \
SLYOS_ENABLE_DEVICE_CONTROL=1 \
npm run agent
```

Shell execution is separate and remains disabled unless `SLYOS_ENABLE_SHELL=1`.

## Platform Reality

Android is still the richest full-phone automation target because it can combine launcher, accessibility, notification listener, remote input, overlays, camera, app package access, and ADB/dev flows.

macOS can get close through Accessibility, Screen Recording, System Events, local apps, files, browser automation, and shell tools. Install `cliclick` for precise pointer movement, right click, double click, and scroll.

Linux can be strong on X11 with `xdotool`; Wayland depends heavily on compositor permissions. `wtype`, `wl-copy`, `wl-paste`, `gnome-screenshot`, or `spectacle` improve coverage.

Windows can use PowerShell, User32, SendKeys, UI Automation, screenshots, files, browser/app launch, and Office/file workflows from the active user session.

iOS cannot allow a third-party app to take over the whole device like Android. The iOS path must use App Intents, Shortcuts, Share Extensions, widgets, URL schemes, notifications, camera/import flows, and explicit handoff. SlyOS can feel native and useful there, but full-device click-through is blocked by Apple sandboxing.

## Required Ship Tests

- Capabilities endpoint reports the exact OS-control coverage.
- Observe returns screenshot/front-app context where permissions allow it.
- The agent can open an app/URL.
- The agent can type text into a controlled test field.
- The agent can click a known coordinate in a test app.
- The agent can wait and observe the changed screen.
- The agent stops before external send/destructive/financial/security actions.
- The user can disable device control by restarting without `SLYOS_ENABLE_DEVICE_CONTROL=1`.
