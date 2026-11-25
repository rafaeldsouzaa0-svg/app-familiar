create schema if not exists familia;
create table if not exists familia.families (
  id uuid primary key default gen_random_uuid(), name text not null,
  invite text not null unique, ics_token text not null unique, created_at timestamptz not null default now());
create table if not exists familia.members (
  id uuid primary key default gen_random_uuid(), family_id uuid not null references familia.families(id) on delete cascade,
  name text not null, email text not null unique, pass text not null, color text not null, created_at timestamptz not null default now());
create table if not exists familia.sessions (
  token_hash text primary key, member_id uuid not null references familia.members(id) on delete cascade, expires_at timestamptz not null);
create table if not exists familia.attempts (
  key text primary key, n int not null, reset_at timestamptz not null);
create table if not exists familia.events (
  id uuid primary key default gen_random_uuid(), family_id uuid not null references familia.families(id) on delete cascade,
  member_id uuid references familia.members(id) on delete set null, title text not null, starts text not null, ends text,
  all_day boolean not null default false, place text, notes text, repeat text not null default 'none',
  remind_min int, created_at timestamptz not null default now());
create table if not exists familia.shopping (
  id uuid primary key default gen_random_uuid(), family_id uuid not null references familia.families(id) on delete cascade,
  title text not null, qty text, category text not null default 'Outros', done boolean not null default false, created_at timestamptz not null default now());
create table if not exists familia.tasks (
  id uuid primary key default gen_random_uuid(), family_id uuid not null references familia.families(id) on delete cascade,
  member_id uuid references familia.members(id) on delete set null, title text not null, due text,
  repeat text not null default 'none', done boolean not null default false, created_at timestamptz not null default now());
create index if not exists members_family on familia.members(family_id);
create index if not exists sessions_member on familia.sessions(member_id);
create index if not exists events_family on familia.events(family_id);
create index if not exists shopping_family on familia.shopping(family_id);
create index if not exists tasks_family on familia.tasks(family_id);
