create table public.trip_invite_mail (
  invite_id uuid primary key references public.trip_invites(id) on delete cascade,
  status text not null default 'pending' check(status in ('pending','sending','sent','failed','cancelled')),
  attempts integer not null default 0 check(attempts >= 0),
  delivery_round integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  sent_at timestamptz,
  claim_token uuid,
  last_error_code text
);
create index trip_invite_mail_due_idx on public.trip_invite_mail(next_attempt_at) where status in ('pending','sending','failed');
alter table public.trip_invite_mail enable row level security;
revoke all on public.trip_invite_mail from public;
do $$ declare role_name text; begin
  foreach role_name in array array['anon','authenticated'] loop
    if exists(select 1 from pg_roles where rolname=role_name) then
      execute format('revoke all on public.trip_invite_mail from %I',role_name);
    end if;
  end loop;
end $$;
-- Existing invitations are not mass-mailed. Only new invites or explicit resends enqueue delivery.
