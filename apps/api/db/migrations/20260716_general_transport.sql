create table if not exists transport_providers (
  id uuid primary key default gen_random_uuid(),
  mode text not null
    check (mode in ('flight', 'train', 'bus', 'car', 'self_drive', 'taxi', 'motorbike', 'bicycle', 'boat', 'ferry', 'cruise', 'walk', 'other')),
  code text,
  name text not null,
  country text,
  logo_url text,
  created_at timestamptz not null default now(),
  unique (mode, code),
  unique (mode, name, country)
);

create table if not exists transport_hubs (
  id uuid primary key default gen_random_uuid(),
  hub_code text,
  name text not null,
  city_slug text references cities(slug),
  country text not null default 'VN',
  type text not null
    check (type in ('airport', 'train_station', 'bus_station', 'port', 'pier', 'pickup_point', 'address', 'landmark', 'other')),
  lat double precision,
  lon double precision,
  created_at timestamptz not null default now(),
  unique (type, hub_code),
  unique (type, name, city_slug)
);

create table if not exists transport_segments (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  mode text not null
    check (mode in ('flight', 'train', 'bus', 'car', 'self_drive', 'taxi', 'motorbike', 'bicycle', 'boat', 'ferry', 'cruise', 'walk', 'other')),
  provider_id uuid references transport_providers(id) on delete set null,
  from_hub_id uuid references transport_hubs(id) on delete set null,
  to_hub_id uuid references transport_hubs(id) on delete set null,
  from_label text,
  to_label text,
  service_number text,
  departure_time timestamptz,
  arrival_time timestamptz,
  service_class text not null default 'standard',
  baggage_info jsonb not null default '{}'::jsonb,
  vehicle_info jsonb not null default '{}'::jsonb,
  booking_metadata jsonb not null default '{}'::jsonb,
  status text not null default 'planned'
    check (status in ('planned', 'held', 'booked', 'checked_in', 'completed', 'cancelled')),
  created_by_user_id uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists transport_bookings (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  user_id uuid references users(id) on delete set null,
  segment_id uuid references transport_segments(id) on delete cascade,
  provider_id uuid references transport_providers(id) on delete set null,
  booking_provider text,
  booking_reference text,
  base_price numeric not null,
  taxes_and_fees numeric not null default 0,
  total_price numeric not null,
  currency text not null default 'VND',
  purchased_at timestamptz,
  refund_policy text,
  change_policy text,
  booking_status text not null default 'held'
    check (booking_status in ('held', 'purchased', 'cancelled', 'refunded')),
  created_by_user_id uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists transport_price_snapshots (
  id uuid primary key default gen_random_uuid(),
  mode text not null
    check (mode in ('flight', 'train', 'bus', 'car', 'self_drive', 'taxi', 'motorbike', 'bicycle', 'boat', 'ferry', 'cruise', 'walk', 'other')),
  route_from_hub_id uuid references transport_hubs(id) on delete cascade,
  route_to_hub_id uuid references transport_hubs(id) on delete cascade,
  provider_id uuid references transport_providers(id) on delete set null,
  service_class text not null default 'standard',
  departure_date date not null,
  observed_at timestamptz not null default now(),
  price numeric not null,
  currency text not null default 'VND',
  source text,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists transport_price_insights (
  id uuid primary key default gen_random_uuid(),
  mode text not null
    check (mode in ('flight', 'train', 'bus', 'car', 'self_drive', 'taxi', 'motorbike', 'bicycle', 'boat', 'ferry', 'cruise', 'walk', 'other')),
  route_from_hub_id uuid references transport_hubs(id) on delete cascade,
  route_to_hub_id uuid references transport_hubs(id) on delete cascade,
  provider_id uuid references transport_providers(id) on delete set null,
  service_class text not null default 'standard',
  month integer check (month between 1 and 12),
  cheapest_observed_price numeric,
  average_price numeric,
  expensive_threshold numeric,
  cheap_window_start integer,
  cheap_window_end integer,
  recommendation text,
  confidence_score numeric not null default 0.5,
  updated_at timestamptz not null default now()
);

alter table trip_checklist_items add column if not exists related_transport_segment_id uuid;
alter table expenses add column if not exists transport_booking_id uuid references transport_bookings(id) on delete set null;

do $$
begin
  alter table trip_checklist_items
    add constraint trip_checklist_items_related_transport_segment_id_fkey
    foreign key (related_transport_segment_id) references transport_segments(id) on delete set null not valid;
exception
  when duplicate_object then null;
end $$;

alter table expenses drop constraint if exists expenses_transport_segment_id_fkey;
alter table expenses
  add constraint expenses_transport_segment_id_fkey
  foreign key (transport_segment_id) references transport_segments(id) on delete set null not valid;

do $$
begin
  alter table trip_checklist_items drop constraint if exists trip_checklist_items_category_check;
  alter table trip_checklist_items
    add constraint trip_checklist_items_category_check
    check (category in ('transport', 'hotel', 'activity', 'document', 'payment', 'general'));
exception
  when duplicate_object then null;
end $$;

create index if not exists transport_providers_mode_name_idx on transport_providers(mode, name);
create index if not exists transport_hubs_city_type_idx on transport_hubs(city_slug, type);
create index if not exists transport_segments_trip_idx on transport_segments(trip_id, departure_time);
create index if not exists transport_segments_mode_trip_idx on transport_segments(mode, trip_id);
create index if not exists transport_bookings_trip_idx on transport_bookings(trip_id, booking_status);
create index if not exists transport_price_snapshots_route_date_idx on transport_price_snapshots(mode, route_from_hub_id, route_to_hub_id, departure_date, observed_at desc);
create index if not exists transport_price_insights_route_idx on transport_price_insights(mode, route_from_hub_id, route_to_hub_id, month);
