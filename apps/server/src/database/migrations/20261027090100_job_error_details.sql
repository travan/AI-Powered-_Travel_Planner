begin;
alter table public.itinerary_jobs add column error_code text, add column error_params jsonb;
commit;
