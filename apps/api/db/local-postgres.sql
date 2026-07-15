create extension if not exists pgcrypto;

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
create index if not exists itineraries_share_token_public_idx
  on itineraries(share_token)
  where is_public = true;
create index if not exists saved_trips_user_id_idx on saved_trips(user_id);
