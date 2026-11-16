-- Additive: old jobs remain on their original pipeline.
alter table public.itinerary_jobs add column pipeline_version integer not null default 1;
alter table public.itinerary_jobs add column generation_id uuid;
alter table public.itinerary_jobs add column request_hash text;
alter table public.itinerary_jobs add column deadline_at timestamptz;
create unique index itinerary_jobs_active_generation_idx
  on public.itinerary_jobs(user_id,request_hash)
  where pipeline_version=2 and status in ('queued','processing');
create index itinerary_jobs_generation_idx on public.itinerary_jobs(generation_id);
alter table public.planning_ai_attempts drop constraint planning_ai_attempts_strategy_check;
alter table public.planning_ai_attempts add constraint planning_ai_attempts_strategy_check check(strategy in ('legacy','catalog','catalog_v2'));

create table public.planning_generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  request_hash text not null,
  checkpoint jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.itinerary_jobs add constraint itinerary_jobs_generation_fk
  foreign key(generation_id) references public.planning_generations(id);
create table public.planning_generation_ai (
  generation_id uuid primary key references public.planning_generations(id) on delete cascade,
  state text not null check(state in ('calling','received','unknown','failed')),
  response jsonb,
  error_code text,
  usage jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);
-- A short atomic update replaces scans under the old global advisory lock.
create table public.planning_admission_capacity (
  id integer primary key check(id=1),
  outstanding integer not null check(outstanding>=0),
  total_outstanding integer not null check(total_outstanding>=0)
);
insert into public.planning_admission_capacity select 1,0,count(*) from public.itinerary_jobs where status in ('queued','processing');
create function journey_internal.track_generation_capacity() returns trigger
language plpgsql set search_path=pg_catalog as $$
declare before_active boolean:=false; after_active boolean:=false; before_all boolean:=false; after_all boolean:=false; delta integer; delta_all integer;
begin
  if tg_op<>'INSERT' then before_all:=old.status in ('queued','processing'); before_active:=old.pipeline_version=2 and before_all; end if;
  if tg_op<>'DELETE' then after_all:=new.status in ('queued','processing'); after_active:=new.pipeline_version=2 and after_all; end if;
  delta:=after_active::integer-before_active::integer;
  delta_all:=after_all::integer-before_all::integer;
  if delta<>0 or delta_all<>0 then
    update public.planning_admission_capacity set outstanding=outstanding+delta,total_outstanding=total_outstanding+delta_all
      where id=1 and (delta<=0 or outstanding+delta<=100) and (delta_all<=0 or total_outstanding+delta_all<=1500);
    if not found then raise exception 'generation capacity exceeded' using errcode='P0001'; end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
create trigger generation_capacity after insert or update of status or delete on public.itinerary_jobs
for each row execute function journey_internal.track_generation_capacity();

create table public.planning_ai_slots (
  id integer primary key,
  token uuid,
  locked_until timestamptz
);
insert into public.planning_ai_slots(id) select generate_series(1,16);

alter table public.planning_generations enable row level security;
alter table public.planning_generation_ai enable row level security;
alter table public.planning_admission_capacity enable row level security;
alter table public.planning_ai_slots enable row level security;
revoke all on public.planning_generations,public.planning_generation_ai,
  public.planning_admission_capacity,public.planning_ai_slots from public;
revoke all on function journey_internal.track_generation_capacity() from public;
do $$ declare role_name text; begin
  foreach role_name in array array['anon','authenticated'] loop
    if exists(select 1 from pg_roles where rolname=role_name) then
      execute format('revoke all on planning_generations,planning_generation_ai,planning_admission_capacity,planning_ai_slots from %I',role_name);
    end if;
  end loop;
end $$;
