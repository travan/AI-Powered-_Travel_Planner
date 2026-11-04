-- Move the existing cloud bootstrap table into the shared migration contract.
create table if not exists public.bill_ocr_documents (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references public.bill_uploads(id) on delete cascade,
  trip_id uuid not null references public.trips(id) on delete cascade,
  actor_user_id uuid not null references public.users(id),
  raw_text text,
  parsed jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.bill_ocr_documents enable row level security;
revoke all on public.bill_ocr_documents from public;
