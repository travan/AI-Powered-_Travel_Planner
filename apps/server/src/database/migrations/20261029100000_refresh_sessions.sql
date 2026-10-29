-- Refresh credentials are server-only; retain consumed hashes for replay detection.
create schema if not exists private;
revoke all on schema private from public;
create table private.refresh_tokens (
  token_hash text primary key,
  user_id uuid not null references users(id) on delete cascade,
  family_id uuid not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index refresh_tokens_family_idx on private.refresh_tokens(family_id);
create index refresh_tokens_user_idx on private.refresh_tokens(user_id);
alter table user_sessions add column family_id uuid;
create index user_sessions_family_idx on user_sessions(family_id) where family_id is not null;
-- Existing seven-day bearer-only sessions must be replaced with a fresh login.
update user_sessions set revoked_at = now() where revoked_at is null;
