create extension if not exists "uuid-ossp";

create table if not exists public.place_catalog (
  id uuid primary key default uuid_generate_v4(),
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
  superseded_by_place_id uuid references public.place_catalog(id) on delete set null,
  previous_names text[] not null default '{}',
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.transport_price_insights (
  id uuid primary key default uuid_generate_v4(),
  mode text not null,
  provider_name text,
  origin_city text,
  destination_city text,
  currency text not null default 'VND',
  min_price numeric,
  median_price numeric,
  best_observed_at timestamptz,
  sample_size integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Existing local databases may have the original transport schema. Add the
-- workspace-facing columns before creating indexes or inserting route data.
alter table public.transport_price_insights
  add column if not exists provider_name text,
  add column if not exists origin_city text,
  add column if not exists destination_city text,
  add column if not exists currency text not null default 'VND',
  add column if not exists min_price numeric,
  add column if not exists median_price numeric,
  add column if not exists best_observed_at timestamptz,
  add column if not exists sample_size integer not null default 1;

create table if not exists public.data_quality_signals (
  id uuid primary key default uuid_generate_v4(),
  trip_id uuid references public.trips(id) on delete cascade,
  signal_type text not null,
  severity text not null default 'medium',
  title text not null,
  detail text not null,
  entity_type text not null,
  entity_id uuid,
  status text not null default 'open',
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  reviewed_by_user_id uuid references public.users(id) on delete set null,
  reviewed_at timestamptz
);

alter table public.bill_line_items
  add column if not exists confidence numeric,
  add column if not exists raw_text text;

create index if not exists idx_place_catalog_city_category_quality
  on public.place_catalog(city_slug, category, quality_score desc)
  where is_outdated = false;

create index if not exists idx_transport_price_insights_route
  on public.transport_price_insights(mode, origin_city, destination_city);

create index if not exists idx_data_quality_signals_trip_status
  on public.data_quality_signals(trip_id, status, created_at desc);

insert into public.place_catalog (name, category, city_slug, address, price_level, quality_score, source, last_verified_at)
values
  ('Hoi An lantern workshop', 'workshop', 'hoi-an', 'Old Town, Hoi An', '$', 92, 'seed', '2026-07-01T00:00:00.000Z'),
  ('Da Nang seafood dinner', 'food', 'da-nang', 'Vo Nguyen Giap, Da Nang', '$$', 87, 'user_submission', '2026-07-02T00:00:00.000Z'),
  ('Son Tra sunrise cafe', 'cafe', 'da-nang', 'Son Tra, Da Nang', '$', 89, 'user_submission', '2026-07-03T00:00:00.000Z'),
  ('Old Quarter homestay', 'hotel', 'hoi-an', 'Nguyen Thai Hoc, Hoi An', '$$', 84, 'user_submission', '2026-06-28T00:00:00.000Z')
on conflict do nothing;

insert into public.transport_price_insights (
  mode, provider_name, origin_city, destination_city, currency, min_price, median_price, best_observed_at, sample_size
)
values
  ('train', 'Vietnam Railways', 'da-nang', 'hue', 'VND', 110000, 180000, '2026-07-04T02:00:00.000Z', 8),
  ('flight', 'Vietnam Airlines', 'ho-chi-minh-city', 'da-nang', 'VND', 890000, 1450000, '2026-07-05T03:00:00.000Z', 11),
  ('bus', 'Futa Bus Lines', 'da-nang', 'hoi-an', 'VND', 90000, 120000, '2026-07-06T01:00:00.000Z', 5)
on conflict do nothing;
