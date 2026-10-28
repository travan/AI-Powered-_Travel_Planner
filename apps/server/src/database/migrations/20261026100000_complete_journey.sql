begin;
alter table public.trips add column if not exists current_plan jsonb,
  add column if not exists planning_version integer not null default 1,
  add column if not exists planning_locked_ids text[] not null default '{}';
alter table public.accommodations add column if not exists name text not null default '',
  add column if not exists city text not null default '',
  add column if not exists rooms integer not null default 1 check (rooms between 1 and 20),
  add column if not exists booking_url text,
  add column if not exists version integer not null default 1;
-- Keep existing booking statuses and add selected without rewriting old records.
alter table public.accommodations drop constraint if exists accommodations_booking_status_check;
alter table public.accommodations add constraint accommodations_booking_status_check
  check (booking_status in ('planned','selected','booked','cancelled','completed'));
create index if not exists accommodations_trip_date_idx on public.accommodations(trip_id, check_in_date);
alter table public.trip_activities add column if not exists source_plan_item_id text;
create unique index if not exists trip_activities_plan_item_idx on public.trip_activities(trip_id,source_plan_item_id) where source_plan_item_id is not null;
alter table public.place_catalog add column if not exists tags text[] not null default '{}',
  add column if not exists estimated_price numeric check (estimated_price >= 0),
  add column if not exists price_currency text not null default 'VND',
  add column if not exists independent boolean;
create table if not exists public.itinerary_jobs (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.users(id) on delete cascade,
  kind text not null default 'generate' check (kind in ('generate','revision')),
  payload jsonb not null, status text not null default 'queued' check (status in ('queued','processing','complete','failed')),
  stage text not null default 'queued', attempts integer not null default 0,
  available_at timestamptz not null default now(), locked_until timestamptz, claim_token uuid,
  itinerary_id uuid references public.itineraries(id) on delete set null, revision_id uuid,
  error text, created_at timestamptz not null default now(), completed_at timestamptz
);
create index if not exists itinerary_jobs_pending_idx on public.itinerary_jobs(status, available_at, created_at) where status in ('queued','processing');
create index if not exists itinerary_jobs_user_idx on public.itinerary_jobs(user_id, created_at desc);
create table if not exists public.trip_plan_revisions (
  id uuid primary key default gen_random_uuid(), trip_id uuid not null references public.trips(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade, base_version integer not null,
  status text not null default 'preview' check (status in ('preview','applied')),
  previous_plan jsonb not null, candidate jsonb not null, diff jsonb not null,
  created_at timestamptz not null default now(), applied_at timestamptz
);
create index if not exists trip_plan_revisions_trip_idx on public.trip_plan_revisions(trip_id, created_at desc);
alter table public.itinerary_jobs enable row level security;
alter table public.trip_plan_revisions enable row level security;
alter table public.accommodations enable row level security;
-- New resources are server-only: local JWT membership is checked by the Nest API.
-- No browser Data API grants/policies are added for these resources.
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.itinerary_jobs, public.trip_plan_revisions, public.accommodations from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on public.itinerary_jobs, public.trip_plan_revisions, public.accommodations from authenticated;
  end if;
end $$;
-- Any schedule/booking write invalidates outstanding previews, including writes
-- through older endpoints. Trigger functions use invoker rights in a private schema.
create schema if not exists journey_internal;
create or replace function journey_internal.invalidate_plan_preview() returns trigger language plpgsql as $$
begin
  update public.trips set planning_version = planning_version + 1, updated_at = now()
  where id = coalesce(new.trip_id, old.trip_id);
  return coalesce(new, old);
end $$;
drop trigger if exists journey_activity_version on public.trip_activities;
create trigger journey_activity_version after insert or update or delete on public.trip_activities for each row execute function journey_internal.invalidate_plan_preview();
drop trigger if exists journey_transport_version on public.transport_bookings;
create trigger journey_transport_version after insert or update or delete on public.transport_bookings for each row execute function journey_internal.invalidate_plan_preview();
drop trigger if exists journey_stay_version on public.accommodations;
create trigger journey_stay_version after insert or update or delete on public.accommodations for each row execute function journey_internal.invalidate_plan_preview();
commit;
