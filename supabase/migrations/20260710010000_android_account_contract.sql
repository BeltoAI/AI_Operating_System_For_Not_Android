-- Align BADSCIENTIST with the Android SlyOS account/sync contract.
-- Source of truth: /Users/emilshirokikh/Downloads/MADSCIENTIST/agentos/ACCOUNT_AND_SYNC.md

create extension if not exists pgcrypto;

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

alter table public.profiles enable row level security;
alter table public.brain_items enable row level security;
alter table public.vault_items enable row level security;
alter table public.vault_meta enable row level security;

grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.brain_items to authenticated;
grant select, insert, update, delete on public.vault_items to authenticated;
grant select, insert, update, delete on public.vault_meta to authenticated;

drop policy if exists "own profile" on public.profiles;
drop policy if exists "own brain" on public.brain_items;
drop policy if exists "own vault" on public.vault_items;
drop policy if exists "own vault_meta" on public.vault_meta;

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

create index if not exists brain_items_user_kind_idx on public.brain_items(user_id, kind, updated_at desc);
create index if not exists vault_items_user_idx on public.vault_items(user_id, updated_at desc);

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
