-- ============================================================
-- 002_itineraries.sql — Itineraries table and seeded demo data for Supabase
-- ============================================================

create table if not exists public.itineraries (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.users(id) on delete cascade,
  job_id      text unique,                    -- BullMQ job ID
  cities      text[],                         -- ["Da Nang", "Hoi An"]
  countries   text[],                         -- ["VN"]
  start_date  date,
  end_date    date,
  num_days    integer,
  budget      numeric,
  currency    text default 'VND',
  trip_style  text,                           -- adventure/relax/culture/food
  status      text default 'generating'       -- generating/complete/failed
              check (status in ('generating', 'complete', 'failed')),
  result      jsonb,                          -- full AI output JSON
  is_public   boolean default false,
  share_token text unique,
  created_at  timestamptz default now()
);

-- Indexes
create index if not exists idx_itineraries_user_id on public.itineraries(user_id);
create index if not exists idx_itineraries_share_token on public.itineraries(share_token);
create index if not exists idx_itineraries_status on public.itineraries(status);

-- Disable RLS for demo purposes (service key operations)
alter table public.itineraries disable row level security;

-- Insert demo data (public itineraries for testing)
insert into public.itineraries (
  cities,
  countries,
  start_date,
  end_date,
  num_days,
  budget,
  currency,
  trip_style,
  status,
  is_public,
  result
) values
  (
    array['Hanoi'],
    array['VN'],
    '2026-06-12',
    '2026-06-14',
    3,
    420.50,
    'USD',
    'culture',
    'complete',
    true,
    jsonb_build_object(
      'title', 'Weekend in Hanoi',
      'overview', 'A short cultural escape with street food and historic temples.',
      'total_cost', 420.50,
      'currency', 'USD',
      'num_days', 3,
      'num_travelers', 2,
      'days', jsonb_build_array(
        jsonb_build_object(
          'day_number', 1,
          'date', '2026-06-12',
          'city', 'Hanoi',
          'title', 'Old Quarter Exploration',
          'activities', jsonb_build_array(
            jsonb_build_object(
              'time', '08:00',
              'name', 'Hoan Kiem Lake',
              'description', 'Morning walk around the iconic lake',
              'duration', '2 hours',
              'cost', 0,
              'currency', 'USD',
              'category', 'attraction',
              'maps_link', 'https://maps.google.com/?q=Hoan+Kiem+Lake+Hanoi'
            )
          )
        )
      )
    )
  ),
  (
    array['Da Nang', 'Hoi An'],
    array['VN'],
    '2026-06-10',
    '2026-06-15',
    6,
    850.00,
    'USD',
    'food',
    'complete',
    true,
    jsonb_build_object(
      'title', 'Da Nang & Hoi An Food Adventure',
      'overview', 'Culinary journey through Central Vietnam',
      'total_cost', 850.00,
      'currency', 'USD',
      'num_days', 6,
      'num_travelers', 2,
      'days', jsonb_build_array(
        jsonb_build_object(
          'day_number', 1,
          'date', '2026-06-10',
          'city', 'Da Nang',
          'title', 'Da Nang Arrival & Beach',
          'activities', jsonb_build_array(
            jsonb_build_object(
              'time', '14:00',
              'name', 'My Khe Beach',
              'description', 'Relax at the beautiful beach',
              'duration', '3 hours',
              'cost', 0,
              'currency', 'USD',
              'category', 'leisure',
              'maps_link', 'https://maps.google.com/?q=My+Khe+Beach+Da+Nang'
            )
          )
        )
      )
    )
  );
  (
    array['Da Nang'],
    array['VN'],
    '2026-07-20',
    '2026-07-25',
    6,
    1580.00,
    'USD',
    'relax',
    'complete',
    false,
    jsonb_build_object(
      'title', 'Da Nang Beach Break',
      'overview', 'Relaxing beach stay with family-friendly activities and local cuisine.',
      'total_cost', 1580.00,
      'currency', 'USD',
      'num_days', 6,
      'num_travelers', 4,
      'days', jsonb_build_array(
        jsonb_build_object(
          'day_number', 1,
          'date', '2026-07-20',
          'city', 'Da Nang',
          'title', 'Beach Arrival',
          'activities', jsonb_build_array(
            jsonb_build_object(
              'time', '15:00',
              'name', 'My Khe Beach',
              'description', 'Check into hotel and relax at the beach',
              'duration', '4 hours',
              'cost', 0,
              'currency', 'USD',
              'category', 'leisure',
              'maps_link', 'https://maps.google.com/?q=My+Khe+Beach+Da+Nang'
            )
          )
        )
      )
    )
  );
