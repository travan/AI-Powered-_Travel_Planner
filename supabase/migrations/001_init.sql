-- ============================================================
-- 001_init.sql — Travel Planner initial schema
-- ============================================================

-- Enable extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pg_trgm"; -- for text search / autocomplete

-- ============================================================
-- USERS
-- Mirrors auth.users; extended profile fields stored here
-- ============================================================
create table if not exists public.users (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text unique not null,
  display_name text,
  avatar_url   text,
  locale       text not null default 'en',
  plan         text not null default 'free' check (plan in ('free', 'pro', 'enterprise')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.users enable row level security;

create policy "Users can read own profile"
  on public.users for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.users for update
  using (auth.uid() = id);

-- Auto-create profile on sign-up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.users (id, email, display_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- SUBSCRIPTIONS
-- ============================================================
create table if not exists public.subscriptions (
  id                  uuid primary key default uuid_generate_v4(),
  user_id             uuid not null references public.users (id) on delete cascade,
  provider            text not null default 'stripe',
  provider_sub_id     text unique,
  status              text not null default 'inactive'
                        check (status in ('active', 'inactive', 'past_due', 'canceled', 'trialing')),
  plan                text not null default 'free',
  current_period_end  timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

create policy "Users can read own subscription"
  on public.subscriptions for select
  using (auth.uid() = user_id);

-- ============================================================
-- ITINERARIES
-- Top-level record; daily data stored in itinerary_days
-- ============================================================
create table if not exists public.itineraries (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid references public.users (id) on delete set null, -- null = anonymous/shared
  job_id        text unique not null,     -- BullMQ job ID (also used for streaming)
  share_token   text unique,              -- for public share links
  title         text,
  cities        text[] not null default '{}',
  num_days      int not null default 1,
  start_date    date,
  end_date      date,
  budget        numeric,
  currency      text not null default 'USD',
  trip_style    text,
  traveler_count int not null default 1,
  locale        text not null default 'en',
  status        text not null default 'pending'
                  check (status in ('pending', 'processing', 'complete', 'failed')),
  -- Cached AI output (full JSON blob for fast retrieval)
  output        jsonb,
  -- Budget summary (denormalized for list views)
  total_cost    numeric,
  is_public     boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index on public.itineraries (user_id);
create index on public.itineraries (job_id);
create index on public.itineraries (share_token) where share_token is not null;
create index on public.itineraries (is_public) where is_public = true;
create index on public.itineraries using gin (cities);
create index on public.itineraries (created_at desc);

alter table public.itineraries enable row level security;

create policy "Owners can do everything on their itineraries"
  on public.itineraries for all
  using (auth.uid() = user_id);

create policy "Public itineraries are readable by anyone"
  on public.itineraries for select
  using (is_public = true);

-- ============================================================
-- ITINERARY DAYS
-- Normalised day rows for timeline queries
-- ============================================================
create table if not exists public.itinerary_days (
  id             uuid primary key default uuid_generate_v4(),
  itinerary_id   uuid not null references public.itineraries (id) on delete cascade,
  day_number     int not null,
  city           text not null,
  date           date,
  summary        text,
  overnight_city text,
  -- Full activity list (JSON array)
  activities     jsonb not null default '[]',
  created_at     timestamptz not null default now()
);

create index on public.itinerary_days (itinerary_id);
create index on public.itinerary_days (itinerary_id, day_number);

alter table public.itinerary_days enable row level security;

create policy "Day rows inherit itinerary visibility"
  on public.itinerary_days for select
  using (
    exists (
      select 1 from public.itineraries i
      where i.id = itinerary_id
        and (i.user_id = auth.uid() or i.is_public = true)
    )
  );

-- ============================================================
-- SAVED TRIPS  (user bookmark of an itinerary)
-- ============================================================
create table if not exists public.saved_trips (
  id             uuid primary key default uuid_generate_v4(),
  user_id        uuid not null references public.users (id) on delete cascade,
  itinerary_id   uuid not null references public.itineraries (id) on delete cascade,
  notes          text,
  created_at     timestamptz not null default now(),
  unique (user_id, itinerary_id)
);

create index on public.saved_trips (user_id);

alter table public.saved_trips enable row level security;

create policy "Users manage their own saved trips"
  on public.saved_trips for all
  using (auth.uid() = user_id);

-- ============================================================
-- CITIES  (searchable metadata cache)
-- Populated by the scraper pipeline; indexed for autocomplete
-- ============================================================
create table if not exists public.cities (
  id           uuid primary key default uuid_generate_v4(),
  slug         text unique not null,        -- url-friendly key, e.g. "ha-noi"
  name_en      text not null,
  name_local   text,
  country      text not null,               -- ISO 3166-1 alpha-2
  country_name text not null,
  continent    text,
  lat          double precision,
  lon          double precision,
  timezone     text,
  currency     text,
  language     text,
  tags         text[] default '{}',
  image_url    text,
  -- Full metadata blob (synced from MongoDB)
  metadata     jsonb default '{}',
  updated_at   timestamptz not null default now()
);

create index on public.cities using gin (name_en gin_trgm_ops);
create index on public.cities using gin (name_local gin_trgm_ops);
create index on public.cities (country);
create index on public.cities (continent);
create index on public.cities using gin (tags);

-- Cities are publicly readable (no RLS needed)

-- ============================================================
-- UPDATED_AT trigger helper
-- ============================================================
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_users_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();

create trigger set_itineraries_updated_at
  before update on public.itineraries
  for each row execute function public.set_updated_at();

create trigger set_subscriptions_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

create trigger set_cities_updated_at
  before update on public.cities
  for each row execute function public.set_updated_at();
