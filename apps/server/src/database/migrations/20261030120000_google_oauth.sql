-- Additive; application sessions and user IDs remain unchanged.
alter table public.users alter column password_hash drop not null;
create table if not exists public.auth_identities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  provider text not null check (provider = 'google'),
  subject text not null check (length(subject) between 1 and 255),
  created_at timestamptz not null default now(),
  unique (provider, subject), unique (user_id, provider)
);
create table if not exists public.oauth_transactions (
  state_hash text primary key,
  browser_hash text not null,
  nonce text not null,
  verifier text not null,
  intent text not null check (intent in ('signin', 'link')),
  user_id uuid references public.users(id) on delete cascade,
  session_hash text,
  next_path text not null,
  expires_at timestamptz not null,
  check ((intent = 'signin' and user_id is null and session_hash is null) or (intent = 'link' and user_id is not null and session_hash is not null))
);
create index if not exists oauth_transactions_expiry_idx on public.oauth_transactions(expires_at);
create index if not exists oauth_transactions_user_idx on public.oauth_transactions(user_id);
alter table public.auth_identities enable row level security;
alter table public.oauth_transactions enable row level security;
-- No Data API access; the Cloudflare bootstrap grants its restricted backend role.
revoke all on public.auth_identities, public.oauth_transactions from public;
-- Local backend uses the migration owner; cloud bootstrap installs backend RLS policies.
