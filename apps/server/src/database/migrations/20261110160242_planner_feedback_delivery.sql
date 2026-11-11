create table public.planner_feedback_mail (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  itinerary_id uuid not null,
  rating smallint not null check (rating between 1 and 5),
  note text not null check (length(note) <= 2000),
  route text not null,
  created_at timestamptz not null default now(),
  next_attempt_at timestamptz not null default now(),
  attempts integer not null default 0,
  claim_token uuid,
  sent_at timestamptz,
  foreign key (user_id, itinerary_id)
    references public.planner_feedback(user_id, itinerary_id) on delete cascade
);
create index planner_feedback_mail_due_idx
  on public.planner_feedback_mail(next_attempt_at, id) where sent_at is null;
create index planner_feedback_mail_feedback_idx
  on public.planner_feedback_mail(user_id, itinerary_id);

alter table public.planner_feedback_mail enable row level security;
revoke all on public.planner_feedback_mail from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.planner_feedback_mail from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on public.planner_feedback_mail from authenticated;
  end if;
end $$;

insert into public.cities(slug,name,country,timezone,currency,lat,lon,popular,aliases,search_text)
values('moscow','{"en":"Moscow","vi":"Moskva"}','RU','Europe/Moscow','RUB',
  55.75222,37.61556,true,array['Moskva','Mát-xcơ-va','Москва'],'moscow moskva mát-xcơ-va москва')
on conflict(slug) do update set
  name=excluded.name, country=excluded.country, timezone=excluded.timezone,
  currency=excluded.currency, lat=excluded.lat, lon=excluded.lon, popular=excluded.popular,
  aliases=excluded.aliases, search_text=excluded.search_text
where cities.country='' or
  (cities.country=excluded.country and abs(cities.lat-excluded.lat)<0.5 and abs(cities.lon-excluded.lon)<0.5);
