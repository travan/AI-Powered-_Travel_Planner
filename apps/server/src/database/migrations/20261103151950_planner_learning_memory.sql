create table if not exists public.planner_learning_settings (
  user_id uuid primary key references public.users(id) on delete cascade,
  memory_enabled boolean not null default true,
  training_consent boolean not null default false,
  updated_at timestamptz not null default now()
);
create table if not exists public.planner_learning_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  itinerary_id uuid references public.itineraries(id) on delete cascade,
  trip_id uuid references public.trips(id) on delete cascade,
  event_type text not null,
  source_id text,
  payload jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists planner_learning_events_user_recent_idx on public.planner_learning_events(user_id,created_at desc);
create index if not exists planner_learning_events_itinerary_idx on public.planner_learning_events(itinerary_id) where itinerary_id is not null;
create table if not exists public.planner_feedback (
  user_id uuid not null references public.users(id) on delete cascade,
  itinerary_id uuid not null references public.itineraries(id) on delete cascade,
  rating smallint not null check(rating between 1 and 5),
  plan_snapshot jsonb not null,
  note text not null default '' check(length(note)<=2000),
  updated_at timestamptz not null default now(),
  primary key(user_id,itinerary_id)
);
alter table public.planner_learning_settings enable row level security;
alter table public.planner_learning_events enable row level security;
alter table public.planner_feedback enable row level security;
revoke all on public.planner_learning_settings,public.planner_learning_events,public.planner_feedback from public;
alter table public.trip_plan_revisions add column if not exists instruction text;
alter table public.trip_plan_revisions add column if not exists scope text;

-- Transactional capture: a business write and its learning snapshot commit together.
-- Invoker privileges and a private function schema; no new Data API access.
create or replace function journey_internal.capture_planner_learning() returns trigger
language plpgsql set search_path=pg_catalog as $$
declare body jsonb := to_jsonb(new); actor uuid; itinerary uuid; trip uuid; kind text;
begin
  if tg_op='UPDATE' and to_jsonb(old)=body then return new; end if;
  if tg_table_name='itineraries' then
    actor:=(body->>'user_id')::uuid; itinerary:=(body->>'id')::uuid;
    kind:='plan_' || (body->>'status');
  elsif tg_table_name='saved_trips' then
    actor:=(body->>'user_id')::uuid; itinerary:=(body->>'itinerary_id')::uuid;kind:='plan_saved';
  elsif tg_table_name='trip_plan_revisions' then
    actor:=(body->>'user_id')::uuid; trip:=(body->>'trip_id')::uuid;
    kind:=case when body->>'status'='applied' then 'revision_applied' else 'revision_proposed' end;
  elsif tg_table_name='expenses' then
    actor:=coalesce(body->>'updated_by_user_id',body->>'created_by_user_id')::uuid;trip:=(body->>'trip_id')::uuid;
    kind:='expense_' || lower(tg_op);
  elsif tg_table_name='trip_activities' then
    actor:=(body->>'created_by_user_id')::uuid;trip:=(body->>'trip_id')::uuid;kind:='activity_' || lower(tg_op);
  elsif tg_table_name='planner_feedback' then
    actor:=(body->>'user_id')::uuid;itinerary:=(body->>'itinerary_id')::uuid;kind:='feedback';
  end if;
  if actor is not null then
    execute format('insert into %I.planner_learning_events(user_id,itinerary_id,trip_id,event_type,source_id,payload) values($1,$2,$3,$4,$5,$6)',tg_table_schema)
    using actor,itinerary,trip,kind,coalesce(body->>'id',body->>'itinerary_id'),body;
  end if;
  return new;
end $$;
create trigger capture_itinerary_learning after insert on public.itineraries for each row execute function journey_internal.capture_planner_learning();
create trigger capture_saved_plan_learning after insert on public.saved_trips for each row execute function journey_internal.capture_planner_learning();
create trigger capture_revision_learning after insert or update on public.trip_plan_revisions for each row execute function journey_internal.capture_planner_learning();
create trigger capture_expense_learning after insert or update on public.expenses for each row execute function journey_internal.capture_planner_learning();
create trigger capture_activity_learning after insert or update on public.trip_activities for each row execute function journey_internal.capture_planner_learning();
create trigger capture_feedback_learning after insert or update on public.planner_feedback for each row execute function journey_internal.capture_planner_learning();
-- Preserve existing generated plans without implying that unreviewed outputs are good examples.
insert into public.planner_learning_events(user_id,itinerary_id,event_type,source_id,payload)
select u.id,i.id,'imported_plan',i.id::text,jsonb_build_object('status',i.status,'result',i.result,'cities',to_jsonb(i.cities))
from public.itineraries i join public.users u on u.id::text=i.user_id::text;

-- Accent-insensitive bilingual identity keys; city names are presentation labels, never IDs.
alter table public.cities add column if not exists lookup_keys text[] not null default '{}';
create or replace function journey_internal.refresh_city_lookup_keys() returns trigger
language plpgsql set search_path=pg_catalog as $$
begin
 new.lookup_keys:=array(select distinct key from (
   select regexp_replace(translate(lower(normalize(label,NFD)),'đ','d'),'[^a-z0-9]','','g') as key
   from unnest(coalesce(new.aliases,'{}'::text[]) || array[new.slug,new.name->>'en',new.name->>'vi']) label
 ) normalized where key<>'' order by key);
 return new;
end $$;
create trigger refresh_city_lookup_keys before insert or update of name,aliases on public.cities for each row execute function journey_internal.refresh_city_lookup_keys();
update public.cities set name=name;
create index if not exists cities_lookup_keys_idx on public.cities using gin(lookup_keys);
-- Existing unambiguous city inputs get verified canonical labels and geography in place.
insert into public.cities(slug,name,country,timezone,currency,lat,lon,popular,aliases,search_text) values
 ('beijing','{"en":"Beijing","vi":"Bắc Kinh"}','CN','Asia/Shanghai','CNY',39.9042,116.4074,false,array['Peking','Bac Kinh','Bắc Kinh'],'beijing peking bac kinh bắc kinh'),
 ('tokyo','{"en":"Tokyo","vi":"Tokyo"}','JP','Asia/Tokyo','JPY',35.6762,139.6503,false,array['Tokyo','Tōkyō','Đông Kinh','Dong Kinh'],'tokyo tōkyō đông kinh dong kinh'),
 ('busan','{"en":"Busan","vi":"Busan"}','KR','Asia/Seoul','KRW',35.1796,129.0756,false,array['Pusan','Phủ Sơn','Phu Son'],'busan pusan phủ sơn phu son'),
 ('taipei','{"en":"Taipei","vi":"Đài Bắc"}','TW','Asia/Taipei','TWD',25.0330,121.5654,false,array['Taipei','Taipei City','Đài Bắc','Dai Bac'],'taipei đài bắc dai bac')
on conflict(slug) do update set name=excluded.name,country=excluded.country,timezone=excluded.timezone,currency=excluded.currency,lat=excluded.lat,lon=excluded.lon,aliases=array(select distinct value from unnest(cities.aliases || excluded.aliases) value),search_text=excluded.search_text
where cities.country='' or (cities.country=excluded.country and abs(cities.lat-excluded.lat)<0.5 and abs(cities.lon-excluded.lon)<0.5);
