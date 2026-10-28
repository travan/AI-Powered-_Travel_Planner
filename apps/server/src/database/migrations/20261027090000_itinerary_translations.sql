begin;
alter table public.itinerary_jobs drop constraint if exists itinerary_jobs_kind_check;
alter table public.itinerary_jobs add constraint itinerary_jobs_kind_check check (kind in ('generate','revision','translate'));
create table public.itinerary_translations (
  id uuid primary key default gen_random_uuid(),
  itinerary_id uuid references public.itineraries(id) on delete cascade,
  trip_id uuid references public.trips(id) on delete cascade,
  source_version text not null,
  source_revision integer not null,
  source_locale text check (source_locale in ('en','vi')),
  target_locale text not null check (target_locale in ('en','vi')),
  texts jsonb not null,
  created_at timestamptz not null default now(),
  check (num_nonnulls(itinerary_id,trip_id)=1)
);
create unique index itinerary_translations_cache_idx on public.itinerary_translations(coalesce(itinerary_id,trip_id),source_version,target_locale);
create index itinerary_translations_trip_idx on public.itinerary_translations(trip_id,created_at desc) where trip_id is not null;
alter table public.itinerary_jobs add column translation_id uuid references public.itinerary_translations(id) on delete set null;
create unique index itinerary_translation_jobs_active_idx on public.itinerary_jobs(user_id,(payload->>'sourceId'),(payload->>'sourceKind'),(payload->>'sourceVersion'),(payload->>'target')) where kind='translate' and status in ('queued','processing');
alter table public.itinerary_translations enable row level security;
revoke all on public.itinerary_translations from public;
do $$ begin
  if exists(select 1 from pg_roles where rolname='anon') then revoke all on public.itinerary_translations from anon; end if;
  if exists(select 1 from pg_roles where rolname='authenticated') then revoke all on public.itinerary_translations from authenticated; end if;
end $$;
commit;
