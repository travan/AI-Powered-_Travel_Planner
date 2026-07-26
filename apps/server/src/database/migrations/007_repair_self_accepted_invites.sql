-- Repair invitations consumed by their creator before self-join protection was added.

update public.trip_members member
set role = 'host',
    status = 'active',
    joined_at = coalesce(member.joined_at, now())
from public.trips trip
where trip.id = member.trip_id
  and trip.owner_user_id = member.user_id
  and (member.role <> 'host' or member.status <> 'active');

update public.trip_invites
set status = 'pending',
    accepted_by_user_id = null,
    accepted_at = null,
    updated_at = now()
where status = 'accepted'
  and accepted_by_user_id = invited_by_user_id;
