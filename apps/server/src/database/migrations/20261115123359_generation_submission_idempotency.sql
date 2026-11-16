create table public.planning_submission_keys (
  user_id uuid not null references public.users(id) on delete cascade,
  key text not null,
  job_id uuid not null references public.itinerary_jobs(id) on delete cascade,
  payload jsonb not null,
  primary key(user_id,key)
);
create index planning_submission_keys_job_idx on public.planning_submission_keys(job_id);
alter table public.planning_submission_keys enable row level security;
revoke all on public.planning_submission_keys from public;
do $$ declare role_name text; begin
  foreach role_name in array array['anon','authenticated'] loop
    if exists(select 1 from pg_roles where rolname=role_name) then
      execute format('revoke all on planning_submission_keys from %I',role_name);
    end if;
  end loop;
end $$;
