create extension if not exists "uuid-ossp";

create table if not exists public.trip_activity_participants (
  activity_id uuid not null references public.trip_activities(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  status text not null default 'joined',
  joined_at timestamptz not null default now(),
  primary key (activity_id, user_id)
);

create table if not exists public.transport_bookings (
  id uuid primary key default uuid_generate_v4(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  activity_id uuid references public.trip_activities(id) on delete set null,
  mode text not null,
  provider_name text,
  booking_reference text,
  origin_name text not null,
  destination_name text not null,
  departure_at timestamptz,
  arrival_at timestamptz,
  price numeric,
  currency text not null default 'VND',
  booking_status text not null default 'planned',
  notes text,
  created_by_user_id uuid not null references public.users(id) on delete cascade,
  updated_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Older local volumes may already have transport_bookings without the newer
-- activity link. Add it before creating the index below.
alter table public.transport_bookings
  add column if not exists activity_id uuid;

create table if not exists public.transport_booking_participants (
  transport_booking_id uuid not null references public.transport_bookings(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  status text not null default 'included',
  created_at timestamptz not null default now(),
  primary key (transport_booking_id, user_id)
);

create index if not exists idx_trip_activity_participants_user on public.trip_activity_participants(user_id);
create index if not exists idx_transport_bookings_trip on public.transport_bookings(trip_id);
create index if not exists idx_transport_bookings_activity on public.transport_bookings(activity_id);
