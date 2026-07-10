# Supabase Sync Setup

Supabase is optional, but it is the cleanest free-start path for cross-device memory and settings sync.

Use it for:

- memory items
- settings
- action history
- device registry
- expenses
- file metadata

Do not use it for:

- raw API keys
- service-role secrets in clients
- unencrypted private exports you are not comfortable syncing

## Create the project

1. Create a free Supabase project.
2. Open the SQL editor.
3. Run `schema.sql`.
4. In Authentication, enable email magic links.
5. Copy the project URL and publishable/anon client key into local app config.

Current 2026 Supabase behavior to be aware of:

- New tables may not automatically be exposed to the Data API.
- RLS must be enabled on every user table.
- Client apps must use a publishable/anon key, never the service-role key.
- Free-tier email template customization changed in June 2026, so keep auth email setup simple at first.

## Local app config

Copy the root `.env.example` to `.env` for local development:

```bash
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_PUBLISHABLE_KEY=your-publishable-or-anon-key
```

The desktop shell also lets you paste these values at runtime while testing.

