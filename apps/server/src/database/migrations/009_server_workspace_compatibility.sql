begin;

-- The local API schema predates the server workspace modules. Keep the
-- canonical local tables intact and add the small compatibility surface used
-- by recommendations, review, and transport endpoints.
create table if not exists place_catalog (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null,
  city_slug text,
  address text,
  lat double precision,
  lon double precision,
  price_level text,
  quality_score numeric not null default 0,
  source text not null default 'user_submission',
  is_outdated boolean not null default false,
  superseded_by_place_id uuid references place_catalog(id) on delete set null,
  previous_names text[] not null default '{}',
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists data_quality_signals (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid references trips(id) on delete cascade,
  signal_type text not null,
  severity text not null default 'medium',
  title text not null,
  detail text not null,
  entity_type text not null,
  entity_id uuid,
  status text not null default 'open',
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  reviewed_by_user_id uuid references users(id) on delete set null,
  reviewed_at timestamptz
);

alter table transport_price_insights
  add column if not exists provider_name text,
  add column if not exists origin_city text,
  add column if not exists destination_city text,
  add column if not exists min_price numeric,
  add column if not exists median_price numeric,
  add column if not exists best_observed_at timestamptz,
  add column if not exists currency text not null default 'VND',
  add column if not exists sample_size integer not null default 1;

update transport_price_insights
set min_price = coalesce(min_price, cheapest_observed_price),
    median_price = coalesce(median_price, average_price),
    best_observed_at = coalesce(best_observed_at, updated_at);

-- The original local transport_bookings table stores segment/provider IDs,
-- while the workspace API accepts human-readable booking fields. Add those
-- fields without dropping the existing booking data.
alter table transport_bookings
  add column if not exists activity_id uuid,
  add column if not exists mode text not null default 'other',
  add column if not exists provider_name text,
  add column if not exists origin_name text not null default '',
  add column if not exists destination_name text not null default '',
  add column if not exists departure_at timestamptz,
  add column if not exists arrival_at timestamptz,
  add column if not exists price numeric,
  add column if not exists notes text,
  add column if not exists updated_by_user_id uuid,
  add column if not exists updated_at timestamptz not null default now();

update transport_bookings booking
set price = coalesce(booking.price, booking.total_price),
    provider_name = coalesce(booking.provider_name, booking.booking_provider),
    mode = coalesce(booking.mode, segment.mode, 'other'),
    departure_at = coalesce(booking.departure_at, segment.departure_time),
    arrival_at = coalesce(booking.arrival_at, segment.arrival_time),
    origin_name = coalesce(nullif(booking.origin_name, ''), segment.from_label, ''),
    destination_name = coalesce(nullif(booking.destination_name, ''), segment.to_label, '')
from transport_segments segment
where segment.id = booking.segment_id;

alter table transport_bookings
  alter column base_price set default 0,
  alter column total_price set default 0,
  alter column booking_status set default 'planned';

alter table transport_bookings drop constraint if exists transport_bookings_booking_status_check;
alter table transport_bookings drop constraint if exists transport_bookings_booking_status_compatibility_check;
alter table transport_bookings add constraint transport_bookings_booking_status_compatibility_check
  check (booking_status in (
    'held', 'purchased', 'cancelled', 'refunded',
    'planned', 'reserved', 'ticketed', 'completed'
  ));

create index if not exists idx_place_catalog_city_category_quality
  on place_catalog(city_slug, category, quality_score desc)
  where is_outdated = false;
create unique index if not exists idx_place_catalog_name_city
  on place_catalog(name, city_slug);
create index if not exists idx_data_quality_signals_trip_status
  on data_quality_signals(trip_id, status, created_at desc);
create index if not exists idx_transport_price_insights_route
  on transport_price_insights(mode, origin_city, destination_city);
create unique index if not exists idx_transport_price_insights_seed_route
  on transport_price_insights(mode, provider_name, origin_city, destination_city);
create index if not exists idx_transport_bookings_activity
  on transport_bookings(activity_id);

insert into place_catalog (name, category, city_slug, address, price_level, quality_score, source, last_verified_at)
values
  ('Hoi An lantern workshop', 'workshop', 'hoi-an', 'Old Town, Hoi An', '$', 92, 'seed', '2026-07-01T00:00:00.000Z'),
  ('Da Nang seafood dinner', 'food', 'da-nang', 'Vo Nguyen Giap, Da Nang', '$$', 87, 'user_submission', '2026-07-02T00:00:00.000Z'),
  ('Son Tra sunrise cafe', 'cafe', 'da-nang', 'Son Tra, Da Nang', '$', 89, 'user_submission', '2026-07-03T00:00:00.000Z'),
  ('Old Quarter homestay', 'hotel', 'hoi-an', 'Nguyen Thai Hoc, Hoi An', '$$', 84, 'user_submission', '2026-06-28T00:00:00.000Z')
on conflict (name, city_slug) do nothing;

insert into transport_price_insights (
  mode, provider_name, origin_city, destination_city, currency,
  min_price, median_price, best_observed_at, sample_size
)
values
  ('train', 'Vietnam Railways', 'da-nang', 'hue', 'VND', 110000, 180000, '2026-07-04T02:00:00.000Z', 8),
  ('flight', 'Vietnam Airlines', 'ho-chi-minh-city', 'da-nang', 'VND', 890000, 1450000, '2026-07-05T03:00:00.000Z', 11),
  ('bus', 'Futa Bus Lines', 'da-nang', 'hoi-an', 'VND', 90000, 120000, '2026-07-06T01:00:00.000Z', 5)
on conflict (mode, provider_name, origin_city, destination_city) do nothing;

commit;
