-- Private schema: recovery hashes must never be exposed through the Data API.
create schema if not exists private;
revoke all on schema private from public;
create table if not exists private.password_resets (
  user_id uuid primary key references public.users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
revoke all on private.password_resets from public;
