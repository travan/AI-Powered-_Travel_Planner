create table if not exists trip_checklist_items (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  title text not null,
  category text not null default 'general'
    check (category in ('transport', 'hotel', 'activity', 'document', 'payment', 'general')),
  status text not null default 'todo'
    check (status in ('todo', 'in_progress', 'done', 'blocked')),
  due_date date,
  assigned_to_user_id uuid references users(id) on delete set null,
  related_activity_id uuid references trip_activities(id) on delete set null,
  related_accommodation_id uuid,
  created_by_user_id uuid references users(id) on delete set null,
  updated_by_user_id uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists trip_checklist_trip_status_idx
  on trip_checklist_items(trip_id, status, due_date);

create unique index if not exists trip_checklist_trip_title_idx
  on trip_checklist_items(trip_id, title);
