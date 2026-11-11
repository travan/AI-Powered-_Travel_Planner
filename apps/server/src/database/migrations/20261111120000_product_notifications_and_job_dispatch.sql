alter table public.itinerary_jobs add column idempotency_key text;
create unique index itinerary_jobs_idempotency_idx
  on public.itinerary_jobs(user_id, idempotency_key) where idempotency_key is not null;

create table public.journey_job_dispatch (
  job_id uuid primary key references public.itinerary_jobs(id) on delete cascade,
  available_at timestamptz not null
);
create index journey_job_dispatch_due_idx on public.journey_job_dispatch(available_at, job_id);
insert into public.journey_job_dispatch
select id, case when status = 'processing' then coalesce(locked_until, now()) else available_at end
from public.itinerary_jobs where status in ('queued', 'processing');

create table public.product_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.users(id) on delete cascade,
  subject_id uuid not null,
  trip_id uuid references public.trips(id) on delete cascade,
  category text not null,
  event text not null,
  attempt integer,
  created_at timestamptz not null default clock_timestamp(),
  read_at timestamptz,
  unique (recipient_id, subject_id, category, event, attempt)
);
create index product_notifications_inbox_idx
  on public.product_notifications(recipient_id, created_at desc, id desc);
create index product_notifications_unread_idx
  on public.product_notifications(recipient_id) where read_at is null;

alter table public.journey_job_dispatch enable row level security;
alter table public.product_notifications enable row level security;
revoke all on public.journey_job_dispatch, public.product_notifications from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.journey_job_dispatch, public.product_notifications from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on public.journey_job_dispatch, public.product_notifications from authenticated;
  end if;
end $$;

create function journey_internal.record_job_activity() returns trigger
language plpgsql set search_path = pg_catalog as $$
declare
  event_name text;
  target_trip uuid;
begin
  if tg_op = 'UPDATE' and
     (old.status, old.attempts) is not distinct from (new.status, new.attempts) then
    if new.status = 'processing' and old.locked_until is distinct from new.locked_until then
      update public.journey_job_dispatch set available_at = new.locked_until where job_id = new.id;
    end if;
    return new;
  end if;

  if new.status in ('queued', 'processing') then
    insert into public.journey_job_dispatch(job_id, available_at)
    values(new.id, case when new.status = 'processing' then coalesce(new.locked_until, now()) else new.available_at end)
    on conflict(job_id) do update set available_at = excluded.available_at;
  else
    delete from public.journey_job_dispatch where job_id = new.id;
  end if;

  if new.kind = 'revision' then
    target_trip := (new.payload->>'tripId')::uuid;
  elsif new.kind = 'translate' and new.payload->>'sourceKind' = 'trip' then
    target_trip := (new.payload->>'sourceId')::uuid;
  end if;
  -- A trip can disappear while a worker still owns a job.
  if target_trip is not null and not exists(select 1 from public.trips where id = target_trip) then
    return new;
  end if;
  event_name := case when new.status = 'queued' and new.attempts > 0 then 'retry' else new.status end;
  insert into public.product_notifications(recipient_id, subject_id, trip_id, category, event, attempt)
  values(new.user_id, new.id, target_trip, new.kind, event_name, new.attempts)
  on conflict do nothing;
  return new;
end $$;
revoke all on function journey_internal.record_job_activity() from public;
create trigger journey_job_activity after insert or update of status, attempts, locked_until on public.itinerary_jobs
  for each row execute function journey_internal.record_job_activity();

alter table public.product_notifications add column access_scope text not null default 'member'
  check (access_scope in ('member', 'finance', 'manager', 'recipient'));

create function journey_internal.record_product_activity() returns trigger
language plpgsql set search_path = pg_catalog as $$
declare
  item jsonb := to_jsonb(new);
  previous jsonb;
  category_name text := tg_argv[0];
  status_key text := tg_argv[1];
  access_name text := tg_argv[2];
  event_name text;
  target_trip uuid;
  subject uuid := coalesce(item->>'id', item->>'activity_id', item->>'transport_booking_id')::uuid;
  direct_user uuid;
  other_user uuid;
begin
  if tg_op = 'UPDATE' then
    previous := to_jsonb(old);
    if (item - array['updated_at','planning_version','restored_at','expires_at'])
       = (previous - array['updated_at','planning_version','restored_at','expires_at']) then
      return new;
    end if;
  end if;

  event_name := case
    when nullif(status_key, '') is not null and
      (previous is null or item->>status_key is distinct from previous->>status_key)
      then item->>status_key
    when previous is not null and item->>'approval_status' is distinct from previous->>'approval_status'
      then item->>'approval_status'
    when previous is null then 'created'
    else 'updated'
  end;
  target_trip := (item->>'trip_id')::uuid;

  if category_name = 'account' then
    if new.password_hash is not distinct from old.password_hash then return new; end if;
    event_name := 'password_changed';
    direct_user := new.id;
  elsif category_name in ('draft', 'saved') then
    select id into direct_user from public.users where id::text = item->>'user_id';
    if direct_user is null then return new; end if;
  elsif category_name = 'trip' then
    target_trip := new.id;
    direct_user := new.owner_user_id;
    if previous is not null and
       (new.share_enabled, new.share_role, new.share_token) is distinct from
       (old.share_enabled, old.share_role, old.share_token) then
      event_name := 'sharing_changed';
      access_name := 'manager';
    end if;
  elsif category_name = 'member' then
    direct_user := new.user_id;
    if new.status = 'removed' then
      insert into public.product_notifications(recipient_id, subject_id, category, event, access_scope)
      values(direct_user, subject, category_name, 'removed', 'recipient');
      direct_user := null;
    elsif previous is not null and new.role is distinct from old.role then
      event_name := 'role_changed';
    end if;
  elsif category_name = 'invite' then
    direct_user := coalesce(new.accepted_by_user_id,
      (select id from public.users where email::text = lower(new.email) limit 1));
    if direct_user is not null then
      -- A pending invite can precede membership. Expose only the fact of the invitation.
      insert into public.product_notifications(recipient_id, subject_id, category, event, access_scope)
      values(direct_user, subject, category_name, event_name, 'recipient');
    end if;
    direct_user := null;
  elsif category_name = 'split' then
    select trip_id, created_by_user_id into target_trip, other_user
    from public.expenses where id = new.expense_id;
    direct_user := new.user_id;
  elsif category_name = 'expense' then
    direct_user := new.created_by_user_id;
    other_user := new.paid_by_user_id;
  elsif category_name = 'bill' then
    direct_user := new.uploaded_by_user_id;
  elsif category_name = 'review' then
    direct_user := new.requested_by_user_id;
  elsif category_name = 'participant' then
    select trip_id into target_trip from public.trip_activities where id = new.activity_id;
    direct_user := new.user_id;
  elsif category_name = 'transport_participant' then
    select trip_id into target_trip from public.transport_bookings where id = new.transport_booking_id;
    direct_user := new.user_id;
  end if;

  if category_name = 'revision_applied' and event_name <> 'applied' then return new; end if;
  if target_trip is null then
    if access_name = 'recipient' and direct_user is not null then
      insert into public.product_notifications(recipient_id, subject_id, category, event, access_scope)
      values(direct_user, subject, category_name, event_name, 'recipient');
    end if;
    return new;
  end if;

  insert into public.product_notifications(recipient_id, subject_id, trip_id, category, event, access_scope)
  select distinct recipient, subject, target_trip, category_name, event_name, scope
  from (
    select m.user_id as recipient, access_name as scope
    from public.trip_members m where m.trip_id = target_trip and m.status = 'active'
    and (
      access_name = 'member'
      or (access_name in ('manager','finance') and m.role in ('host','co_host'))
    )
    union
    select u.id, case when access_name = 'finance' then 'finance' else 'member' end
    from public.users u where u.id in (direct_user, other_user)
    and not exists (
      select 1 from public.trip_members m where m.trip_id = target_trip and m.user_id = u.id
        and m.status = 'active' and (access_name = 'member' or m.role in ('host','co_host'))
    )
  ) recipients;
  return new;
end $$;
revoke all on function journey_internal.record_product_activity() from public;

create trigger product_trip_activity after insert or update on public.trips
  for each row execute function journey_internal.record_product_activity('trip','status','member');
create trigger product_member_activity after insert or update on public.trip_members
  for each row execute function journey_internal.record_product_activity('member','status','manager');
create trigger product_invite_activity after insert or update on public.trip_invites
  for each row execute function journey_internal.record_product_activity('invite','status','manager');
create trigger product_schedule_activity after insert or update on public.trip_activities
  for each row execute function journey_internal.record_product_activity('activity','status','member');
create trigger product_participant_activity after insert or update on public.trip_activity_participants
  for each row execute function journey_internal.record_product_activity('participant','status','member');
create trigger product_checklist_activity after insert or update on public.trip_checklist_items
  for each row execute function journey_internal.record_product_activity('checklist','status','member');
create trigger product_transport_activity after insert or update on public.transport_bookings
  for each row execute function journey_internal.record_product_activity('transport','booking_status','member');
create trigger product_transport_participant_activity after insert on public.transport_booking_participants
  for each row execute function journey_internal.record_product_activity('transport_participant','','member');
create trigger product_stay_activity after insert or update on public.accommodations
  for each row execute function journey_internal.record_product_activity('stay','booking_status','member');
create trigger product_bill_activity after insert or update on public.bill_uploads
  for each row execute function journey_internal.record_product_activity('bill','status','finance');
create trigger product_expense_activity after insert or update on public.expenses
  for each row execute function journey_internal.record_product_activity('expense','approval_status','finance');
create trigger product_split_activity after insert or update on public.expense_splits
  for each row execute function journey_internal.record_product_activity('split','status','finance');
create trigger product_review_activity after insert or update on public.trip_change_requests
  for each row execute function journey_internal.record_product_activity('review','status','manager');
create trigger product_applied_revision_activity after update of status on public.trip_plan_revisions
  for each row execute function journey_internal.record_product_activity('revision_applied','status','member');
create trigger product_saved_activity after insert on public.saved_trips
  for each row execute function journey_internal.record_product_activity('saved','','recipient');
create trigger product_draft_activity after insert or update of user_id, status on public.search_drafts
  for each row execute function journey_internal.record_product_activity('draft','status','recipient');
create trigger product_account_activity after update of password_hash on public.users
  for each row execute function journey_internal.record_product_activity('account','','recipient');
