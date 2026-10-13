-- Compatibility layer for databases initialized from 001_local_postgres.sql.
-- Keeps the richer local schema while adding the collaboration fields expected by
-- the Nest workspace API.

alter table public.users
  add column if not exists display_name text;

update public.users
set display_name = coalesce(
  nullif(btrim(display_name), ''),
  nullif(btrim(full_name), ''),
  split_part(email::text, '@', 1)
)
where display_name is null or btrim(display_name) = '';

update public.trip_members
set joined_at = now()
where joined_at is null;

alter table public.trip_members
  alter column joined_at set default now(),
  alter column joined_at set not null;

alter table public.trips
  add column if not exists share_token text,
  add column if not exists share_role text not null default 'viewer',
  add column if not exists share_enabled boolean not null default false;

create unique index if not exists idx_trips_share_token
  on public.trips(share_token)
  where share_token is not null;

create table if not exists public.trip_invites (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  invited_by_user_id uuid not null references public.users(id) on delete cascade,
  email text,
  role text not null default 'viewer'
    check (role in ('co_host', 'contributor', 'viewer')),
  token text unique not null,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'revoked', 'expired')),
  expires_at timestamptz,
  accepted_by_user_id uuid references public.users(id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid references public.trips(id) on delete cascade,
  actor_user_id uuid references public.users(id) on delete set null,
  entity_type text not null,
  entity_id uuid,
  action text not null,
  before_snapshot jsonb,
  after_snapshot jsonb,
  created_at timestamptz not null default now()
);

alter table public.expenses
  add column if not exists description text;

alter table public.expenses
  drop constraint if exists expenses_approval_status_check;

alter table public.expenses
  add constraint expenses_approval_status_check
  check (approval_status in ('pending', 'pending_review', 'approved', 'rejected', 'void'));

alter table public.expense_splits
  drop constraint if exists expense_splits_status_check;

alter table public.expense_splits
  add constraint expense_splits_status_check
  check (status in ('pending', 'owed', 'settled', 'waived'));

alter table public.bill_uploads
  add column if not exists raw_text text,
  add column if not exists merchant_name text,
  add column if not exists bill_issued_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

alter table public.bill_uploads
  alter column storage_url drop not null,
  alter column status set default 'draft';

alter table public.bill_uploads
  drop constraint if exists bill_uploads_status_check;

alter table public.bill_uploads
  add constraint bill_uploads_status_check
  check (
    status in (
      'draft', 'uploaded', 'processing', 'parsed', 'needs_review',
      'confirmed', 'ocr_pending', 'ocr_processed', 'approved', 'rejected'
    )
  );

create index if not exists idx_trip_invites_token on public.trip_invites(token);
create index if not exists idx_trip_invites_trip on public.trip_invites(trip_id);
create index if not exists idx_audit_logs_trip on public.audit_logs(trip_id, created_at desc);
