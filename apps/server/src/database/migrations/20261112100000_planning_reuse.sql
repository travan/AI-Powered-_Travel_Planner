alter table public.itinerary_jobs add column planning_progress jsonb;
alter table public.itinerary_jobs add column planning_reuse boolean;

create table public.planning_day_templates (
  id uuid primary key default gen_random_uuid(),
  city_slug text not null references public.cities(slug),
  place_ids uuid[] not null,
  activity_ids uuid[] not null,
  source text not null check (source in ('verified_catalog', 'reviewed')),
  approved boolean not null default false,
  verified_at timestamptz not null,
  quality numeric not null default 1 check (quality > 0)
);

create index planning_day_templates_lookup
  on public.planning_day_templates(city_slug, verified_at desc) where approved;

insert into public.planning_day_templates
  (city_slug, place_ids, activity_ids, source, approved, verified_at, quality)
select p.city_slug, array_agg(p.id order by p.id),
  array(select a.id from public.activity_catalog a where a.city_slug=p.city_slug
    and a.last_verified_at is not null and a.source not in ('ai_generated','user_added','user_submission')
    order by a.id limit 40),
  'verified_catalog', true, min(p.last_verified_at), greatest(avg(p.quality_score), 1)
from public.place_catalog p
where p.city_slug is not null and p.last_verified_at >= now() - interval '180 days'
  and not p.is_outdated and p.source not in ('ai_generated','user_added','user_submission')
group by p.city_slug;

alter table public.planning_day_templates enable row level security;
revoke all on public.planning_day_templates from public;
do $$
declare role_name text;
begin
  foreach role_name in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname=role_name) then
      execute format('revoke all on planning_day_templates from %I', role_name);
    end if;
  end loop;
end $$;

create table public.planning_ai_attempts (
  claim_token uuid primary key,
  job_id uuid not null references public.itinerary_jobs(id) on delete cascade,
  attempt integer not null,
  strategy text not null check (strategy in ('legacy', 'catalog')),
  outcome text not null,
  catalog_days integer not null,
  ai_days integer not null,
  calls jsonb not null,
  recorded_at timestamptz not null default now()
);
create index planning_ai_attempts_job_idx on public.planning_ai_attempts(job_id);
alter table public.planning_ai_attempts enable row level security;
revoke all on public.planning_ai_attempts from public;
do $$
declare role_name text;
begin
  foreach role_name in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname=role_name) then
      execute format('revoke all on planning_ai_attempts from %I', role_name);
    end if;
  end loop;
end $$;
