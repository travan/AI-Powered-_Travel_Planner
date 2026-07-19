create extension if not exists pgcrypto;
create extension if not exists pg_trgm;
create extension if not exists citext;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email citext not null unique,
  password_hash text not null,
  full_name text,
  avatar_url text,
  provider text not null default 'local'
    check (provider in ('local', 'google', 'supabase')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists user_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists itineraries (
  id uuid primary key default gen_random_uuid(),
  user_id text,
  job_id text unique,
  cities text[] not null default '{}',
  countries text[] not null default '{}',
  start_date date,
  end_date date,
  num_days integer,
  budget numeric,
  currency text not null default 'USD',
  trip_style text,
  status text not null default 'generating'
    check (status in ('generating', 'complete', 'failed')),
  result jsonb,
  is_public boolean not null default false,
  share_token text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists saved_trips (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  itinerary_id uuid not null references itineraries(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, itinerary_id)
);

create index if not exists itineraries_user_id_idx on itineraries(user_id);
create index if not exists itineraries_job_id_idx on itineraries(job_id);
create index if not exists itineraries_user_status_created_idx
  on itineraries(user_id, status, created_at desc);
create index if not exists itineraries_share_token_public_idx
  on itineraries(share_token)
  where is_public = true;
create index if not exists saved_trips_user_id_idx on saved_trips(user_id);
create index if not exists saved_trips_itinerary_id_idx on saved_trips(itinerary_id);
create index if not exists users_email_idx on users(email);
create index if not exists user_sessions_user_id_idx on user_sessions(user_id);
create index if not exists user_sessions_active_idx
  on user_sessions(user_id, expires_at desc)
  where revoked_at is null;

create table if not exists cities (
  slug text primary key,
  name jsonb not null,
  country text not null,
  timezone text not null,
  currency text not null,
  lat double precision not null,
  lon double precision not null,
  popular boolean not null default false,
  cover_image text,
  scraper_sources jsonb not null default '{}'::jsonb,
  region text,
  tags text[] not null default '{}',
  aliases text[] not null default '{}',
  search_text text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cities_country_popular_idx on cities(country, popular);
create index if not exists cities_search_text_trgm_idx
  on cities using gin(search_text gin_trgm_ops);

create table if not exists profiles (
  user_id uuid primary key references users(id) on delete cascade,
  display_name text not null,
  avatar_url text,
  phone text,
  home_city_slug text references cities(slug),
  travel_preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists search_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  guest_key text,
  email_hint citext,
  prompt_text text,
  search_payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'claimed', 'discarded')),
  restored_at timestamptz,
  expires_at timestamptz not null default now() + interval '7 days',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists trips (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references users(id) on delete cascade,
  title text not null,
  description text,
  primary_city_slug text references cities(slug),
  start_date date,
  end_date date,
  status text not null default 'planning'
    check (status in ('draft', 'planning', 'booked', 'traveling', 'completed', 'archived')),
  visibility text not null default 'private'
    check (visibility in ('private', 'shared', 'public')),
  budget numeric,
  currency text not null default 'VND',
  source_itinerary_id uuid references itineraries(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists trip_members (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role text not null default 'contributor'
    check (role in ('host', 'co_host', 'contributor', 'viewer')),
  status text not null default 'active'
    check (status in ('invited', 'active', 'removed')),
  invited_by_user_id uuid references users(id) on delete set null,
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  unique (trip_id, user_id)
);

create table if not exists trip_days (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  day_index integer not null,
  date date,
  title text,
  notes text,
  created_at timestamptz not null default now(),
  unique (trip_id, day_index)
);

create table if not exists places (
  id uuid primary key default gen_random_uuid(),
  city_slug text references cities(slug),
  canonical_name text not null,
  current_name text not null,
  type text not null
    check (type in ('hotel', 'homestay', 'cafe', 'restaurant', 'attraction', 'activity', 'transport_hub', 'shop', 'other')),
  category text,
  normalized_address text,
  lat double precision,
  lon double precision,
  tags text[] not null default '{}',
  amenities jsonb not null default '{}'::jsonb,
  contact_info jsonb not null default '{}'::jsonb,
  opening_hours jsonb not null default '{}'::jsonb,
  price_level integer check (price_level is null or price_level between 1 and 5),
  average_rating numeric,
  popularity_score numeric not null default 0,
  quality_score numeric not null default 0,
  freshness_score numeric not null default 1,
  source text not null default 'user_added'
    check (source in ('user_added', 'internal_seed', 'google', 'booking', 'crawler', 'partner_api')),
  status text not null default 'active'
    check (status in ('active', 'suspected_outdated', 'moved', 'renamed', 'closed', 'duplicate')),
  last_verified_at timestamptz,
  superseded_by_place_id uuid references places(id) on delete set null,
  created_by_user_id uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists place_aliases (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references places(id) on delete cascade,
  name text not null,
  alias_type text not null default 'alternate_name'
    check (alias_type in ('old_name', 'alternate_name', 'local_name')),
  valid_from date,
  valid_to date,
  created_at timestamptz not null default now()
);

create table if not exists place_locations (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references places(id) on delete cascade,
  address text not null,
  lat double precision,
  lon double precision,
  valid_from date,
  valid_to date,
  is_current boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists place_price_history (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references places(id) on delete cascade,
  price_type text not null
    check (price_type in ('coffee', 'meal', 'entrance_ticket', 'room_night', 'activity_ticket', 'package', 'average_bill')),
  price numeric not null,
  currency text not null default 'VND',
  observed_at timestamptz not null default now(),
  source text not null default 'user_input'
    check (source in ('user_bill', 'user_input', 'crawler', 'partner_api', 'internal_seed')),
  confidence_score numeric not null default 0.7,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists place_change_signals (
  id uuid primary key default gen_random_uuid(),
  place_id uuid references places(id) on delete set null,
  candidate_name text,
  candidate_address text,
  candidate_lat double precision,
  candidate_lon double precision,
  signal_type text not null
    check (signal_type in ('price_changed', 'renamed', 'moved', 'closed', 'duplicate', 'reopened')),
  source text not null default 'user_input',
  confidence_score numeric not null default 0.5,
  evidence jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'rejected')),
  reviewed_by_user_id uuid references users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists user_place_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  trip_id uuid references trips(id) on delete cascade,
  raw_name text not null,
  raw_type text,
  raw_address text,
  raw_notes text,
  raw_price numeric,
  raw_metadata jsonb not null default '{}'::jsonb,
  normalized_place_id uuid references places(id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'normalized', 'duplicate', 'rejected')),
  created_at timestamptz not null default now()
);

create table if not exists activity_catalog (
  id uuid primary key default gen_random_uuid(),
  place_id uuid references places(id) on delete set null,
  city_slug text references cities(slug),
  title text not null,
  category text,
  tags text[] not null default '{}',
  estimated_cost numeric,
  currency text not null default 'VND',
  duration_minutes integer,
  source text not null default 'user_added',
  popularity_score numeric not null default 0,
  quality_score numeric not null default 0,
  normalized_from_trip_activity_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists trip_activities (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  trip_day_id uuid references trip_days(id) on delete cascade,
  place_id uuid references places(id) on delete set null,
  activity_catalog_id uuid references activity_catalog(id) on delete set null,
  title text not null,
  notes text,
  start_time timestamptz,
  end_time timestamptz,
  status text not null default 'planned'
    check (status in ('planned', 'booked', 'visited', 'skipped')),
  approval_status text not null default 'pending'
    check (approval_status in ('pending', 'approved', 'rejected')),
  created_by_user_id uuid references users(id) on delete set null,
  updated_by_user_id uuid references users(id) on delete set null,
  approved_by_user_id uuid references users(id) on delete set null,
  locked_at timestamptz,
  locked_by_user_id uuid references users(id) on delete set null,
  place_name_snapshot text,
  address_snapshot text,
  price_snapshot numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists trip_checklist_items (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  title text not null,
  category text not null default 'general'
    check (category in ('transport', 'hotel', 'activity', 'document', 'payment', 'general')),
  status text not null default 'todo'
    check (status in ('todo', 'in_progress', 'done', 'blocked')),
  due_date date,
  assigned_to_user_id uuid references users(id) on delete set null,
  related_activity_id uuid references trip_activities(id) on delete set null,
  related_accommodation_id uuid,
  related_transport_segment_id uuid,
  created_by_user_id uuid references users(id) on delete set null,
  updated_by_user_id uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table trip_checklist_items add column if not exists related_transport_segment_id uuid;

do $$
begin
  alter table trip_checklist_items drop constraint if exists trip_checklist_items_category_check;
  alter table trip_checklist_items
    add constraint trip_checklist_items_category_check
    check (category in ('transport', 'hotel', 'activity', 'document', 'payment', 'general'));
exception
  when duplicate_object then null;
end $$;

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

do $$
begin
  alter table trip_checklist_items
    add constraint trip_checklist_items_related_transport_segment_id_fkey
    foreign key (related_transport_segment_id) references transport_segments(id) on delete set null;
exception
  when duplicate_object then null;
end $$;

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

create table if not exists accommodations (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  place_id uuid references places(id) on delete set null,
  check_in_date date,
  check_out_date date,
  room_type text,
  guests integer,
  nights integer,
  price_per_night numeric,
  total_price numeric,
  currency text not null default 'VND',
  booking_provider text,
  booking_reference text,
  booking_status text not null default 'planned'
    check (booking_status in ('planned', 'booked', 'cancelled', 'completed')),
  cancellation_policy text,
  approval_status text not null default 'pending'
    check (approval_status in ('pending', 'approved', 'rejected')),
  created_by_user_id uuid references users(id) on delete set null,
  approved_by_user_id uuid references users(id) on delete set null,
  locked_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists bill_uploads (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  uploaded_by_user_id uuid not null references users(id) on delete cascade,
  place_id uuid references places(id) on delete set null,
  activity_id uuid references trip_activities(id) on delete set null,
  storage_url text not null,
  status text not null default 'uploaded'
    check (status in ('uploaded', 'processing', 'parsed', 'needs_review', 'confirmed')),
  total_amount numeric,
  currency text not null default 'VND',
  bill_date timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists bill_line_items (
  id uuid primary key default gen_random_uuid(),
  bill_upload_id uuid not null references bill_uploads(id) on delete cascade,
  name text not null,
  quantity numeric,
  unit_price numeric,
  amount numeric not null,
  category text,
  confidence_score numeric not null default 0.7
);

create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  activity_id uuid references trip_activities(id) on delete set null,
  place_id uuid references places(id) on delete set null,
  transport_booking_id uuid references transport_bookings(id) on delete set null,
  accommodation_id uuid references accommodations(id) on delete set null,
  transport_segment_id uuid references transport_segments(id) on delete set null,
  bill_upload_id uuid references bill_uploads(id) on delete set null,
  paid_by_user_id uuid references users(id) on delete set null,
  title text not null,
  amount numeric not null,
  currency text not null default 'VND',
  expense_type text not null default 'other'
    check (expense_type in ('accommodation', 'food', 'activity', 'transport', 'shopping', 'other')),
  approval_status text not null default 'pending'
    check (approval_status in ('pending', 'approved', 'rejected')),
  created_by_user_id uuid references users(id) on delete set null,
  updated_by_user_id uuid references users(id) on delete set null,
  approved_by_user_id uuid references users(id) on delete set null,
  locked_at timestamptz,
  locked_by_user_id uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table expenses add column if not exists transport_booking_id uuid;

do $$
begin
  alter table expenses
    add constraint expenses_transport_booking_id_fkey
    foreign key (transport_booking_id) references transport_bookings(id) on delete set null;
exception
  when duplicate_object then null;
end $$;

alter table expenses drop constraint if exists expenses_transport_segment_id_fkey;

do $$
begin
  alter table expenses
    add constraint expenses_transport_segment_id_fkey
    foreign key (transport_segment_id) references transport_segments(id) on delete set null not valid;
exception
  when duplicate_object then null;
end $$;

create table if not exists expense_items (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references expenses(id) on delete cascade,
  activity_id uuid references trip_activities(id) on delete set null,
  place_id uuid references places(id) on delete set null,
  title text not null,
  quantity numeric,
  unit_price numeric,
  amount numeric not null
);

create table if not exists expense_splits (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references expenses(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  share_amount numeric not null,
  share_percent numeric,
  status text not null default 'pending'
    check (status in ('pending', 'settled', 'waived')),
  settled_at timestamptz,
  unique (expense_id, user_id)
);

create table if not exists trip_change_requests (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  target_type text not null,
  target_id uuid not null,
  requested_by_user_id uuid not null references users(id) on delete cascade,
  change_payload jsonb not null default '{}'::jsonb,
  reason text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  reviewed_by_user_id uuid references users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists trip_audit_logs (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  actor_user_id uuid references users(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id uuid,
  before_snapshot jsonb,
  after_snapshot jsonb,
  created_at timestamptz not null default now()
);

create index if not exists profiles_home_city_idx on profiles(home_city_slug);
create index if not exists search_drafts_user_status_idx on search_drafts(user_id, status, created_at desc);
create index if not exists search_drafts_guest_idx on search_drafts(guest_key) where guest_key is not null;
create index if not exists trips_owner_status_idx on trips(owner_user_id, status, created_at desc);
create index if not exists trips_primary_city_idx on trips(primary_city_slug);
create index if not exists trip_members_user_idx on trip_members(user_id, status);
create index if not exists trip_days_trip_idx on trip_days(trip_id, day_index);
create index if not exists places_city_type_status_idx on places(city_slug, type, status);
create index if not exists places_name_trgm_idx on places using gin(current_name gin_trgm_ops);
create index if not exists places_address_trgm_idx on places using gin(normalized_address gin_trgm_ops);
create index if not exists place_aliases_place_idx on place_aliases(place_id);
create index if not exists place_locations_current_idx on place_locations(place_id) where is_current = true;
create index if not exists place_price_history_place_observed_idx on place_price_history(place_id, observed_at desc);
create index if not exists place_change_signals_pending_idx on place_change_signals(status, created_at desc) where status = 'pending';
create index if not exists user_place_submissions_user_status_idx on user_place_submissions(user_id, status, created_at desc);
create index if not exists activity_catalog_city_category_idx on activity_catalog(city_slug, category);
create index if not exists trip_activities_trip_day_idx on trip_activities(trip_id, trip_day_id);
create index if not exists trip_activities_pending_idx on trip_activities(trip_id, created_at desc) where approval_status = 'pending';
create index if not exists trip_checklist_trip_status_idx on trip_checklist_items(trip_id, status, due_date);
create unique index if not exists trip_checklist_trip_title_idx on trip_checklist_items(trip_id, title);
create index if not exists transport_providers_mode_name_idx on transport_providers(mode, name);
create index if not exists transport_hubs_city_type_idx on transport_hubs(city_slug, type);
create index if not exists transport_segments_trip_idx on transport_segments(trip_id, departure_time);
create index if not exists transport_segments_mode_trip_idx on transport_segments(mode, trip_id);
create index if not exists transport_bookings_trip_idx on transport_bookings(trip_id, booking_status);
create index if not exists transport_price_snapshots_route_date_idx on transport_price_snapshots(mode, route_from_hub_id, route_to_hub_id, departure_date, observed_at desc);
create index if not exists transport_price_insights_route_idx on transport_price_insights(mode, route_from_hub_id, route_to_hub_id, month);
create index if not exists accommodations_trip_status_idx on accommodations(trip_id, booking_status);
create index if not exists bill_uploads_trip_status_idx on bill_uploads(trip_id, status, created_at desc);
create index if not exists expenses_trip_type_idx on expenses(trip_id, expense_type, created_at desc);
create index if not exists expenses_pending_idx on expenses(trip_id, created_at desc) where approval_status = 'pending';
create index if not exists expense_items_expense_idx on expense_items(expense_id);
create index if not exists expense_splits_user_status_idx on expense_splits(user_id, status);
create index if not exists trip_change_requests_pending_idx on trip_change_requests(trip_id, created_at desc) where status = 'pending';
create index if not exists trip_audit_logs_trip_created_idx on trip_audit_logs(trip_id, created_at desc);
