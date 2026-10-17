begin;

create table if not exists public.city_catalog_ingestion_jobs (
  id uuid primary key default gen_random_uuid(),
  itinerary_id uuid not null unique references public.itineraries(id) on delete cascade,
  payload jsonb not null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'failed')),
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  locked_until timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists city_catalog_ingestion_jobs_pending_idx
  on public.city_catalog_ingestion_jobs(status, available_at, created_at)
  where status in ('pending', 'processing');

create unique index if not exists activity_catalog_ai_city_name_idx
  on public.activity_catalog(city_slug, lower(canonical_name))
  where source = 'ai_generated' and city_slug is not null;

commit;
