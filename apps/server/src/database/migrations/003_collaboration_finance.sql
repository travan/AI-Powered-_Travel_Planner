create extension if not exists "uuid-ossp";

create table if not exists public.users (
  id uuid primary key default uuid_generate_v4(),
  email text unique not null,
  password_hash text,
  full_name text,
  display_name text,
  avatar_url text,
  provider text not null default 'local',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.trips (
  id uuid primary key default uuid_generate_v4(),
  owner_user_id uuid not null references public.users(id) on delete cascade,
  title text not null,
  status text not null default 'planning',
  visibility text not null default 'private',
  share_token text unique,
  share_role text not null default 'viewer',
  share_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.trip_members (
  trip_id uuid not null references public.trips(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role text not null default 'viewer',
  status text not null default 'active',
  invited_by_user_id uuid references public.users(id) on delete set null,
  joined_at timestamptz not null default now(),
  primary key (trip_id, user_id)
);

create table if not exists public.trip_invites (
  id uuid primary key default uuid_generate_v4(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  invited_by_user_id uuid not null references public.users(id) on delete cascade,
  email text,
  role text not null default 'viewer',
  token text unique not null,
  status text not null default 'pending',
  expires_at timestamptz,
  accepted_by_user_id uuid references public.users(id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.activity_catalog (
  id uuid primary key default uuid_generate_v4(),
  canonical_name text not null,
  category text not null,
  city_slug text,
  address text,
  lat double precision,
  lon double precision,
  source text not null default 'user_submission',
  quality_score numeric not null default 0,
  is_outdated boolean not null default false,
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.trip_activities (
  id uuid primary key default uuid_generate_v4(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  activity_catalog_id uuid references public.activity_catalog(id) on delete set null,
  title text not null,
  category text not null default 'activity',
  scheduled_at timestamptz,
  location_name text,
  address text,
  estimated_cost numeric,
  currency text not null default 'VND',
  created_by_user_id uuid not null references public.users(id) on delete cascade,
  updated_by_user_id uuid references public.users(id) on delete set null,
  status text not null default 'pending_review',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bill_uploads (
  id uuid primary key default uuid_generate_v4(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  activity_id uuid references public.trip_activities(id) on delete set null,
  uploaded_by_user_id uuid not null references public.users(id) on delete cascade,
  status text not null default 'draft',
  storage_url text,
  raw_text text,
  total_amount numeric,
  currency text not null default 'VND',
  merchant_name text,
  bill_issued_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bill_line_items (
  id uuid primary key default uuid_generate_v4(),
  bill_upload_id uuid not null references public.bill_uploads(id) on delete cascade,
  name text not null,
  quantity numeric not null default 1,
  unit_price numeric,
  amount numeric not null,
  category text,
  created_at timestamptz not null default now()
);

create table if not exists public.expenses (
  id uuid primary key default uuid_generate_v4(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  activity_id uuid references public.trip_activities(id) on delete set null,
  bill_upload_id uuid references public.bill_uploads(id) on delete set null,
  title text not null,
  description text,
  amount numeric not null,
  currency text not null default 'VND',
  paid_by_user_id uuid not null references public.users(id) on delete cascade,
  created_by_user_id uuid not null references public.users(id) on delete cascade,
  updated_by_user_id uuid references public.users(id) on delete set null,
  status text not null default 'pending_review',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.expense_items (
  id uuid primary key default uuid_generate_v4(),
  expense_id uuid not null references public.expenses(id) on delete cascade,
  activity_id uuid references public.trip_activities(id) on delete set null,
  name text not null,
  quantity numeric not null default 1,
  unit_price numeric,
  amount numeric not null,
  category text,
  created_at timestamptz not null default now()
);

create table if not exists public.expense_splits (
  id uuid primary key default uuid_generate_v4(),
  expense_id uuid not null references public.expenses(id) on delete cascade,
  activity_id uuid references public.trip_activities(id) on delete set null,
  user_id uuid not null references public.users(id) on delete cascade,
  amount numeric not null,
  status text not null default 'owed',
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (expense_id, user_id)
);

create table if not exists public.audit_logs (
  id uuid primary key default uuid_generate_v4(),
  trip_id uuid references public.trips(id) on delete cascade,
  actor_user_id uuid references public.users(id) on delete set null,
  entity_type text not null,
  entity_id uuid,
  action text not null,
  before_snapshot jsonb,
  after_snapshot jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_trip_members_user on public.trip_members(user_id);
create index if not exists idx_trip_invites_token on public.trip_invites(token);
create index if not exists idx_trip_invites_trip on public.trip_invites(trip_id);
create index if not exists idx_trip_activities_trip on public.trip_activities(trip_id);
create index if not exists idx_bill_uploads_trip on public.bill_uploads(trip_id);
create index if not exists idx_expenses_trip on public.expenses(trip_id);
create index if not exists idx_expense_splits_expense on public.expense_splits(expense_id);
create index if not exists idx_audit_logs_trip on public.audit_logs(trip_id, created_at desc);
