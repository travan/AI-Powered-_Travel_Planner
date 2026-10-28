begin;
-- The PostgreSQL document store must also work on installations initialized by
-- the standard migration runner (Cloudflare bootstrap already creates this table).
create table if not exists public.user_prompt_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  prompt_text text not null default '', normalized_query jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists user_prompt_history_user_created_idx on public.user_prompt_history(user_id,created_at desc);
alter table public.user_prompt_history enable row level security;
do $$ begin
  if exists(select 1 from pg_roles where rolname='anon') then revoke all on public.user_prompt_history from anon; end if;
  if exists(select 1 from pg_roles where rolname='authenticated') then revoke all on public.user_prompt_history from authenticated; end if;
end $$;
commit;
