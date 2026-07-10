# Memory Schema

The Android app currently stores memory across SharedPreferences and SQLite databases. Cross-platform builds should converge on a portable schema with platform-specific storage adapters.

## Stores

### Profile

- name
- email
- phone
- address
- bio/context
- platform personas
- preferences

### Messages

- id
- contact
- platform
- sender
- role
- body
- timestamp
- hash
- source_file

### Facts

- id
- text
- source
- confidence
- timestamp
- deleted_at

### Vectors

- id
- owner_type
- owner_id
- text
- embedding_model
- vector
- timestamp

### Expenses

- id
- merchant
- total
- currency
- category
- items_json
- source
- receipt_image_ref
- timestamp

### Actions

- id
- type
- args_json
- risk
- status
- created_at
- confirmed_at
- executed_at
- result_json

## Migration principle

The Android store remains the source for existing data. BADSCIENTIST should define import/export tools rather than directly rewriting Android databases.

