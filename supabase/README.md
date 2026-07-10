# Supabase Setup

Supabase is optional. BADSCIENTIST runs locally without it, but Supabase is the easiest free-start path for syncing memory, settings, action history, expenses, and file metadata across devices.

The account/sync contract now matches the Android build in:

```text
/Users/emilshirokikh/Downloads/MADSCIENTIST/agentos/ACCOUNT_AND_SYNC.md
```

## Is the database already set up?

No live cloud database is bundled with this repo.

What is already done:

- `schema.sql` defines the tables.
- `migrations/20260710000000_initial_sync_schema.sql` mirrors the schema for Supabase CLI workflows.
- `migrations/20260710010000_android_account_contract.sql` adds the Android-compatible account tables.
- `config.toml` defines a local Supabase development stack.
- RLS is enabled for every user-owned table.
- Policies restrict each user to their own rows.
- Explicit grants are included for authenticated Data API access.
- The TypeScript sync client is implemented in `shared/agent-core/src/supabaseSync.ts`.
- The desktop shell has runtime fields for Supabase URL, publishable key, magic-link auth, push, and pull.
- `npm run db:check` verifies local readiness without printing secrets.
- `npm run db:apply` applies the schema when `SUPABASE_DB_URL` is provided.

What you still need to do:

- Create your own Supabase project.
- Run `schema.sql`.
- Enable email/password auth.
- Paste the project URL and publishable/anon key into the app.
- Sign in before syncing.

## What gets synced

Tables created by `schema.sql`:

| Table | Purpose |
| --- | --- |
| `profiles` | One auth-linked profile row per Supabase user |
| `brain_items` | Android-compatible generic brain sync table for memories, profile, chats, papers, settings, vault pointers |
| `vault_items` | End-to-end encrypted sensitive vault rows |
| `vault_meta` | Encrypted vault key metadata and KDF params |
| `devices` | Registered user devices and platforms |
| `settings` | Portable SlyOS settings |
| `memory_items` | Brain memories, facts, messages, documents, screens |
| `action_log` | Planned, held, confirmed, executed, failed, cancelled actions |
| `expenses` | Receipt and spending memory |
| `file_metadata` | Imported/generated file records |

## What should never be synced

Do not store these in Supabase client tables:

- Raw API keys
- Supabase service-role keys
- Unencrypted private exports
- Full device backups
- Sensitive chat exports unless the user explicitly chooses to sync them

The client app must use a publishable/anon key only.

## Create the Supabase project

1. Go to Supabase and create a new project.
2. Open the SQL editor.
3. Paste the full contents of `schema.sql`.
4. Run it.
5. Open Authentication settings.
6. Enable the Email provider and password signups/signins.
7. Copy the project URL.
8. Copy the publishable or anon client key.
9. Copy the Postgres connection string if you want CLI setup from this repo.

## Check local readiness

From the repo root:

```bash
npm run db:check
```

This checks:

- schema file
- migration file
- Supabase config
- `psql`
- optional Supabase CLI
- optional Docker
- optional env vars
- RLS/grants/policy patterns

It redacts secrets and treats missing live credentials as a warning, not a repo failure.

## Apply schema with a database URL

If you have a Supabase Postgres connection string:

```bash
SUPABASE_DB_URL='postgresql://postgres...sslmode=require' npm run db:apply
```

The script runs:

```bash
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/schema.sql
```

It will not guess credentials and will not print your DB URL.

## Configure the local app

Option A: use the UI.

1. Run the desktop shell.
2. Open `Setup`.
3. Paste:
   - Supabase URL
   - publishable/anon key
   - your email
   - your account password
4. Click `Configure`.
5. Click `Sign up` once for a new account.
6. Click `Sign in`.
7. Use `Push brain` or `Pull brain`.

Option B: use `.env`.

From the repo root:

```bash
cp .env.example .env
```

Fill in:

```bash
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_PUBLISHABLE_KEY=your-publishable-or-anon-key
```

## Verify the schema

After running `schema.sql`, check that these tables exist in the `public` schema:

```text
devices
profiles
brain_items
vault_items
vault_meta
settings
memory_items
action_log
expenses
file_metadata
```

Then verify:

- RLS is enabled on every table.
- `authenticated` has select/insert/update/delete grants for the tables.
- Policies include an ownership check using `auth.uid() = user_id`.
- You can sign up and sign in with email/password.
- `Push brain` works only after sign-in.
- `Pull brain` returns only your own rows.

## Why explicit grants are in the SQL

Supabase is moving toward explicit Data API grants for new tables. That means a table can exist and still be unreachable through `supabase-js` unless the intended role has a grant.

This schema includes explicit grants for `authenticated` and enables RLS. Treat those as a pair:

1. `grant` makes the table reachable to the intended role.
2. RLS decides which rows that role can actually see or change.

Do not remove either one casually.

Useful Supabase docs:

- [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Securing your API](https://supabase.com/docs/guides/api/securing-your-api)
- [Supabase changelog](https://supabase.com/changelog)

## Troubleshooting

`Sign in before syncing memory or settings.`

You configured the client but have not completed magic-link sign-in.

`permission denied for table ...`

The table probably lacks grants or is not exposed to the Data API. Re-run `schema.sql` and check the project's Data API settings.

`new row violates row-level security policy`

The user ID on the row does not match the signed-in user. Use the app sync client, which fills `user_id` from the authenticated session.

`relation public.brain_items does not exist`

The schema was not run in this project, or it was run in the wrong Supabase project.

`Invalid API key`

Use the publishable/anon key. Do not use a service-role key in the app.
