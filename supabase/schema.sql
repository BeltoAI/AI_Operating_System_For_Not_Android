-- BADSCIENTIST cross-device sync schema.
-- This is a setup SQL file, not a generated Supabase migration.
-- Run it in the Supabase SQL editor for a new project.

create extension if not exists pgcrypto;

-- Android-compatible SlyOS account contract.
-- Source of truth: /Users/emilshirokikh/Downloads/MADSCIENTIST/agentos/ACCOUNT_AND_SYNC.md

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.brain_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  client_id text not null,
  title text,
  body text,
  data jsonb,
  updated_at bigint not null,
  deleted boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, kind, client_id)
);

create table if not exists public.vault_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id text not null,
  label text,
  ciphertext text not null,
  iv text not null,
  updated_at bigint not null,
  deleted boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, client_id)
);

create table if not exists public.vault_meta (
  user_id uuid primary key references auth.users(id) on delete cascade,
  kdf text not null default 'PBKDF2WithHmacSHA256',
  kdf_salt text not null,
  kdf_iters int not null default 210000,
  wrapped_dek text not null,
  wrap_iv text not null,
  updated_at bigint not null
);

create table if not exists public.devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  platform text not null check (platform in ('ios', 'macos', 'linux', 'windows', 'android-reference')),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.settings (
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

create table if not exists public.memory_items (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('fact', 'message', 'setting', 'expense', 'document', 'screen')),
  title text not null,
  body text not null,
  tags text[] not null default '{}',
  source text not null default 'unknown',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.action_log (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id uuid references public.devices(id) on delete set null,
  type text not null,
  risk text not null,
  status text not null check (status in ('planned', 'held', 'confirmed', 'executed', 'failed', 'cancelled')),
  args jsonb not null default '{}'::jsonb,
  result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.expenses (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  merchant text,
  total numeric(12, 2),
  currency text not null default 'USD',
  category text,
  items jsonb not null default '[]'::jsonb,
  source text not null default 'manual',
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.file_metadata (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  name text not null,
  mime_type text,
  storage_path text,
  summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.brain_items enable row level security;
alter table public.vault_items enable row level security;
alter table public.vault_meta enable row level security;
alter table public.devices enable row level security;
alter table public.settings enable row level security;
alter table public.memory_items enable row level security;
alter table public.action_log enable row level security;
alter table public.expenses enable row level security;
alter table public.file_metadata enable row level security;

grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.brain_items to authenticated;
grant select, insert, update, delete on public.vault_items to authenticated;
grant select, insert, update, delete on public.vault_meta to authenticated;
grant select, insert, update, delete on public.devices to authenticated;
grant select, insert, update, delete on public.settings to authenticated;
grant select, insert, update, delete on public.memory_items to authenticated;
grant select, insert, update, delete on public.action_log to authenticated;
grant select, insert, update, delete on public.expenses to authenticated;
grant select, insert, update, delete on public.file_metadata to authenticated;

drop policy if exists "own profile" on public.profiles;
drop policy if exists "own brain" on public.brain_items;
drop policy if exists "own vault" on public.vault_items;
drop policy if exists "own vault_meta" on public.vault_meta;
drop policy if exists "select own devices" on public.devices;
drop policy if exists "insert own devices" on public.devices;
drop policy if exists "update own devices" on public.devices;
drop policy if exists "delete own devices" on public.devices;
drop policy if exists "select own settings" on public.settings;
drop policy if exists "insert own settings" on public.settings;
drop policy if exists "update own settings" on public.settings;
drop policy if exists "delete own settings" on public.settings;
drop policy if exists "select own memory" on public.memory_items;
drop policy if exists "insert own memory" on public.memory_items;
drop policy if exists "update own memory" on public.memory_items;
drop policy if exists "delete own memory" on public.memory_items;
drop policy if exists "select own actions" on public.action_log;
drop policy if exists "insert own actions" on public.action_log;
drop policy if exists "update own actions" on public.action_log;
drop policy if exists "delete own actions" on public.action_log;
drop policy if exists "select own expenses" on public.expenses;
drop policy if exists "insert own expenses" on public.expenses;
drop policy if exists "update own expenses" on public.expenses;
drop policy if exists "delete own expenses" on public.expenses;
drop policy if exists "select own files" on public.file_metadata;
drop policy if exists "insert own files" on public.file_metadata;
drop policy if exists "update own files" on public.file_metadata;
drop policy if exists "delete own files" on public.file_metadata;

create policy "own profile" on public.profiles
  for all to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy "own brain" on public.brain_items
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "own vault" on public.vault_items
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "own vault_meta" on public.vault_meta
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "select own devices" on public.devices
  for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "insert own devices" on public.devices
  for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "update own devices" on public.devices
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "delete own devices" on public.devices
  for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "select own settings" on public.settings
  for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "insert own settings" on public.settings
  for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "update own settings" on public.settings
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "delete own settings" on public.settings
  for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "select own memory" on public.memory_items
  for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "insert own memory" on public.memory_items
  for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "update own memory" on public.memory_items
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "delete own memory" on public.memory_items
  for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "select own actions" on public.action_log
  for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "insert own actions" on public.action_log
  for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "update own actions" on public.action_log
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "delete own actions" on public.action_log
  for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "select own expenses" on public.expenses
  for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "insert own expenses" on public.expenses
  for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "update own expenses" on public.expenses
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "delete own expenses" on public.expenses
  for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "select own files" on public.file_metadata
  for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "insert own files" on public.file_metadata
  for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "update own files" on public.file_metadata
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "delete own files" on public.file_metadata
  for delete to authenticated
  using ((select auth.uid()) = user_id);

create index if not exists devices_user_updated_idx on public.devices(user_id, updated_at desc);
create index if not exists brain_items_user_kind_idx on public.brain_items(user_id, kind, updated_at desc);
create index if not exists vault_items_user_idx on public.vault_items(user_id, updated_at desc);
create index if not exists memory_user_updated_idx on public.memory_items(user_id, updated_at desc);
create index if not exists memory_user_kind_idx on public.memory_items(user_id, kind);
create index if not exists action_user_updated_idx on public.action_log(user_id, updated_at desc);
create index if not exists expenses_user_occurred_idx on public.expenses(user_id, occurred_at desc);
create index if not exists files_user_updated_idx on public.file_metadata(user_id, updated_at desc);

create or replace function public.handle_new_user() returns trigger as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
