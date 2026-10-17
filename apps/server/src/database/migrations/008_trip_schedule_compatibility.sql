begin;

-- The hosted database still has the original trip_activities shape. Keep its
-- existing columns/data and add the fields used by the editable schedule API.
alter table if exists trip_activities
  add column if not exists category text,
  add column if not exists scheduled_at timestamptz,
  add column if not exists location_name text,
  add column if not exists address text,
  add column if not exists estimated_cost numeric,
  add column if not exists currency text;

update trip_activities as activity
set category = coalesce(nullif(activity.category, ''), catalog.category, 'activity'),
    scheduled_at = coalesce(activity.scheduled_at, activity.start_time),
    location_name = coalesce(nullif(activity.location_name, ''), activity.place_name_snapshot),
    address = coalesce(nullif(activity.address, ''), activity.address_snapshot),
    estimated_cost = coalesce(activity.estimated_cost, activity.price_snapshot),
    currency = coalesce(nullif(activity.currency, ''), 'VND')
from activity_catalog as catalog
where catalog.id = activity.activity_catalog_id;

update trip_activities
set category = coalesce(nullif(category, ''), 'activity'),
    scheduled_at = coalesce(scheduled_at, start_time),
    location_name = coalesce(nullif(location_name, ''), place_name_snapshot),
    address = coalesce(nullif(address, ''), address_snapshot),
    estimated_cost = coalesce(estimated_cost, price_snapshot),
    currency = coalesce(nullif(currency, ''), 'VND');

alter table trip_activities alter column category set default 'activity';
alter table trip_activities alter column category set not null;
alter table trip_activities alter column currency set default 'VND';
alter table trip_activities alter column currency set not null;

-- Preserve legacy statuses while allowing the editable schedule workflow.
alter table trip_activities drop constraint if exists trip_activities_status_check;
alter table trip_activities drop constraint if exists trip_activities_status_compatibility_check;
alter table trip_activities add constraint trip_activities_status_compatibility_check
  check (status in (
    'planned', 'booked', 'visited', 'skipped',
    'pending_review', 'approved', 'rejected', 'scheduled', 'done', 'cancelled'
  ));

-- Catalog records predate the current repository names. These aliases let the
-- repository read the old records without rewriting or duplicating them.
alter table if exists activity_catalog
  add column if not exists canonical_name text,
  add column if not exists address text,
  add column if not exists is_outdated boolean not null default false,
  add column if not exists last_verified_at timestamptz;

update activity_catalog
set canonical_name = coalesce(nullif(canonical_name, ''), title),
    last_verified_at = coalesce(last_verified_at, updated_at);

create table if not exists trip_activity_participants (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references trip_activities(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  status text not null check (status in ('joined', 'declined', 'maybe')),
  joined_at timestamptz not null default now(),
  unique (activity_id, user_id)
);

commit;
