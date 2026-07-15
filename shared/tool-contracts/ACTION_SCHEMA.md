# Action Schema

Every platform adapter should accept the same high-level action envelope.

```json
{
  "id": "action_...",
  "type": "send_email",
  "title": "Send email",
  "args": {},
  "requires_confirmation": true,
  "risk": "external_send",
  "source": "agent",
  "tainted_by_untrusted_context": false,
  "created_at": "2026-07-09T00:00:00Z"
}
```

## Risk classes

- `read_only`: search, memory lookup, local file metadata lookup
- `local_write`: save note, create draft, update local memory
- `device_control`: granted screen-control session, pointer/keyboard/clipboard operation
- `external_open`: open URL, open app, open file
- `external_send`: SMS, email, chat, post, calendar invite
- `destructive`: delete, unsubscribe, remove, overwrite
- `financial`: buy, trade, transfer, pay
- `security_sensitive`: credentials, keys, private tokens, account settings

## Confirmation rule

Actions in these classes must require explicit user confirmation:

- `device_control`
- `external_send`
- `destructive`
- `financial`
- `security_sensitive`

Platform adapters can be stricter but not looser.

## Canonical action types

- `open_app`
- `open_url`
- `web_search`
- `memory_search`
- `read_url`
- `find_contact`
- `calendar_lookup`
- `add_event`
- `send_sms`
- `send_email`
- `message`
- `remind`
- `create_doc`
- `create_sheet`
- `create_slides`
- `create_pdf`
- `cowork`
- `set_mission`
- `network_search`
- `shop`
- `invest`
- `look`
- `navigate`
- `play_music`
- `checklist`
- `dial`
- `expense_lookup`
- `expense_record`
- `camera_look`
- `observe_screen`
- `screen_read`
- `screen_operate`
- `pointer_click`
- `type_text`
- `hotkey`
- `run_command`
- `create_mini_app`
- `revise_mini_app`
