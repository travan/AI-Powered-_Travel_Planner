import { Inject, Injectable } from "@nestjs/common";
import {
  SQL_CLIENT,
  type SqlClient,
} from "../../../database/database.tokens.js";
import type {
  Trip,
  TripAuditLog,
  TripInvite,
  TripMember,
  TripMemberRole,
  TripMemberStatus,
  TripShareLink,
} from "../domain/trip.entity.js";
import type { TripRepository } from "../domain/trip.repository.js";
import type { TripSummary } from "@travel/types";

type TripRow = {
  id: string;
  title: string;
  status: string;
  visibility: string;
  owner_user_id: string;
  created_at: string;
};

type TripSummaryRow = {
  id: string;
  title: string;
  description: string | null;
  primary_city_slug: string | null;
  start_date: string | null;
  end_date: string | null;
  status: string;
  visibility: string;
  budget: string | number | null;
  currency: string;
  role: TripMemberRole;
  member_count: string | number;
  activity_count: string | number;
  checklist_done: string | number;
  checklist_total: string | number;
  expense_total: string | number;
  created_at: string;
};

type TripMemberRow = {
  trip_id: string;
  user_id: string;
  display_name: string | null;
  email: string | null;
  role: TripMemberRole;
  status: TripMemberStatus;
  invited_by_user_id: string | null;
  invited_by_display_name: string | null;
  invited_by_email: string | null;
  joined_at: string;
};

type TripInviteRow = {
  id: string;
  trip_id: string;
  invited_by_user_id: string;
  email: string | null;
  role: TripMemberRole;
  token: string;
  status: "pending" | "accepted" | "revoked" | "expired";
  expires_at: string | null;
  accepted_by_user_id: string | null;
  accepted_at: string | null;
  created_at: string;
};

type TripShareLinkRow = {
  trip_id: string;
  share_enabled: boolean;
  share_token: string | null;
  share_role: TripMemberRole;
};

type TripAuditLogRow = {
  id: string;
  trip_id: string | null;
  actor_user_id: string | null;
  entity_type: string;
  entity_id: string | null;
  action: string;
  before_snapshot: Record<string, unknown> | null;
  after_snapshot: Record<string, unknown> | null;
  created_at: string;
};

@Injectable()
export class PostgresTripRepository implements TripRepository {
  constructor(@Inject(SQL_CLIENT) private readonly sql: SqlClient) {}

  async listForUser(userId: string): Promise<TripSummary[]> {
    const result = await this.sql.query<TripSummaryRow>(
      `select t.id::text,
              t.title,
              t.description,
              t.primary_city_slug,
              t.start_date::text,
              t.end_date::text,
              t.status,
              t.visibility,
              t.budget,
              t.currency,
              tm.role,
              (select count(*) from trip_members members where members.trip_id = t.id and members.status = 'active') as member_count,
              (select count(*) from trip_activities activities where activities.trip_id = t.id) as activity_count,
              (select count(*) from trip_checklist_items checklist where checklist.trip_id = t.id and checklist.status = 'done') as checklist_done,
              (select count(*) from trip_checklist_items checklist where checklist.trip_id = t.id) as checklist_total,
              coalesce((
                select sum(expenses.amount)
                from expenses
                where expenses.trip_id = t.id
                  and expenses.approval_status = 'approved'
              ), 0) as expense_total,
              t.created_at::text
       from trips t
       join trip_members tm on tm.trip_id = t.id
       where tm.user_id = $1 and tm.status = 'active'
       order by t.created_at desc`,
      [userId],
    );
    return result.rows.map(mapTripSummary);
  }

  async findForUser(input: {
    tripId: string;
    userId: string;
  }): Promise<Trip | null> {
    const result = await this.sql.query<TripRow>(
      `select t.id::text, t.title, t.status, t.visibility, t.owner_user_id::text, t.created_at::text
       from trips t
       join trip_members tm on tm.trip_id = t.id
       where t.id = $1 and tm.user_id = $2
       limit 1`,
      [input.tripId, input.userId],
    );
    return result.rows[0] ? mapTrip(result.rows[0]) : null;
  }

  async findMember(input: {
    tripId: string;
    userId: string;
  }): Promise<TripMember | null> {
    const result = await this.sql.query<TripMemberRow>(
      `select tm.trip_id::text,
              tm.user_id::text,
              coalesce(nullif(btrim(member_user.display_name), ''), split_part(member_user.email::text, '@', 1)) as display_name,
              member_user.email::text as email,
              tm.role,
              tm.status,
              tm.invited_by_user_id::text,
              coalesce(nullif(btrim(inviter.display_name), ''), split_part(inviter.email::text, '@', 1)) as invited_by_display_name,
              inviter.email::text as invited_by_email,
              tm.joined_at::text
       from trip_members tm
       join users member_user on member_user.id = tm.user_id
       left join users inviter on inviter.id = tm.invited_by_user_id
       where tm.trip_id = $1 and tm.user_id = $2
       limit 1`,
      [input.tripId, input.userId],
    );
    return result.rows[0] ? mapMember(result.rows[0]) : null;
  }

  async listMembers(tripId: string): Promise<TripMember[]> {
    const result = await this.sql.query<TripMemberRow>(
      `select tm.trip_id::text,
              tm.user_id::text,
              coalesce(nullif(btrim(member_user.display_name), ''), split_part(member_user.email::text, '@', 1)) as display_name,
              member_user.email::text as email,
              tm.role,
              tm.status,
              tm.invited_by_user_id::text,
              coalesce(nullif(btrim(inviter.display_name), ''), split_part(inviter.email::text, '@', 1)) as invited_by_display_name,
              inviter.email::text as invited_by_email,
              tm.joined_at::text
       from trip_members tm
       join users member_user on member_user.id = tm.user_id
       left join users inviter on inviter.id = tm.invited_by_user_id
       where tm.trip_id = $1
       order by tm.role asc, tm.joined_at asc`,
      [tripId],
    );
    return result.rows.map(mapMember);
  }

  async createInvite(input: {
    tripId: string;
    invitedByUserId: string;
    email?: string;
    role: TripMemberRole;
    token: string;
    expiresAt?: string;
  }): Promise<TripInvite> {
    const result = await this.sql.query<TripInviteRow>(
      `insert into trip_invites (trip_id, invited_by_user_id, email, role, token, expires_at)
       values ($1, $2, $3, $4, $5, $6)
       returning id::text, trip_id::text, invited_by_user_id::text, email, role, token, status,
                 expires_at::text, accepted_by_user_id::text, accepted_at::text, created_at::text`,
      [
        input.tripId,
        input.invitedByUserId,
        input.email ?? null,
        input.role,
        input.token,
        input.expiresAt ?? null,
      ],
    );
    return mapInvite(result.rows[0]!);
  }

  async findInviteByToken(token: string): Promise<TripInvite | null> {
    const result = await this.sql.query<TripInviteRow>(
      `select id::text, trip_id::text, invited_by_user_id::text, email, role, token, status,
              expires_at::text, accepted_by_user_id::text, accepted_at::text, created_at::text
       from trip_invites
       where token = $1
       limit 1`,
      [token],
    );
    return result.rows[0] ? mapInvite(result.rows[0]) : null;
  }

  async acceptInvite(input: {
    inviteId: string;
    userId: string;
  }): Promise<TripInvite> {
    const result = await this.sql.query<TripInviteRow>(
      `update trip_invites
       set status = 'accepted', accepted_by_user_id = $2, accepted_at = now(), updated_at = now()
       where id = $1
       returning id::text, trip_id::text, invited_by_user_id::text, email, role, token, status,
                 expires_at::text, accepted_by_user_id::text, accepted_at::text, created_at::text`,
      [input.inviteId, input.userId],
    );
    return mapInvite(result.rows[0]!);
  }

  async upsertMember(input: {
    tripId: string;
    userId: string;
    role: TripMemberRole;
    invitedByUserId?: string | null;
  }): Promise<TripMember> {
    const result = await this.sql.query<TripMemberRow>(
      `with saved_member as (
         insert into trip_members (trip_id, user_id, role, status, invited_by_user_id)
         values ($1, $2, $3, 'active', $4)
         on conflict (trip_id, user_id)
         do update set
           role = case when trip_members.role = 'host' then 'host' else excluded.role end,
           status = 'active',
           joined_at = coalesce(trip_members.joined_at, now())
         returning trip_id, user_id, role, status, invited_by_user_id, joined_at
       )
       select saved_member.trip_id::text,
              saved_member.user_id::text,
              coalesce(nullif(btrim(member_user.display_name), ''), split_part(member_user.email::text, '@', 1)) as display_name,
              member_user.email::text as email,
              saved_member.role,
              saved_member.status,
              saved_member.invited_by_user_id::text,
              coalesce(nullif(btrim(inviter.display_name), ''), split_part(inviter.email::text, '@', 1)) as invited_by_display_name,
              inviter.email::text as invited_by_email,
              saved_member.joined_at::text
       from saved_member
       join users member_user on member_user.id = saved_member.user_id
       left join users inviter on inviter.id = saved_member.invited_by_user_id`,
      [input.tripId, input.userId, input.role, input.invitedByUserId ?? null],
    );
    return mapMember(result.rows[0]!);
  }

  async setShareLink(input: {
    tripId: string;
    enabled: boolean;
    role: TripMemberRole;
    token?: string | null;
  }): Promise<TripShareLink> {
    const result = await this.sql.query<TripShareLinkRow>(
      `update trips
       set share_enabled = $2,
           share_role = $3,
           share_token = case
             when $2 = false then null
             when share_token is null then $4
             else share_token
           end,
           updated_at = now()
       where id = $1
       returning id::text as trip_id, share_enabled, share_token, share_role`,
      [input.tripId, input.enabled, input.role, input.token ?? null],
    );
    return mapShareLink(result.rows[0]!);
  }

  async findShareLink(token: string): Promise<TripShareLink | null> {
    const result = await this.sql.query<TripShareLinkRow>(
      `select id::text as trip_id, share_enabled, share_token, share_role
       from trips
       where share_token = $1
       limit 1`,
      [token],
    );
    return result.rows[0] ? mapShareLink(result.rows[0]) : null;
  }

  async updateMember(input: {
    tripId: string;
    userId: string;
    role?: TripMemberRole;
    status?: TripMemberStatus;
  }): Promise<TripMember | null> {
    const result = await this.sql.query<TripMemberRow>(
      `with saved_member as (
         update trip_members
         set role = coalesce($3, role),
             status = coalesce($4, status)
         where trip_id = $1 and user_id = $2
         returning trip_id, user_id, role, status, invited_by_user_id, joined_at
       )
       select saved_member.trip_id::text,
              saved_member.user_id::text,
              coalesce(nullif(btrim(member_user.display_name), ''), split_part(member_user.email::text, '@', 1)) as display_name,
              member_user.email::text as email,
              saved_member.role,
              saved_member.status,
              saved_member.invited_by_user_id::text,
              coalesce(nullif(btrim(inviter.display_name), ''), split_part(inviter.email::text, '@', 1)) as invited_by_display_name,
              inviter.email::text as invited_by_email,
              saved_member.joined_at::text
       from saved_member
       join users member_user on member_user.id = saved_member.user_id
       left join users inviter on inviter.id = saved_member.invited_by_user_id`,
      [input.tripId, input.userId, input.role ?? null, input.status ?? null],
    );
    return result.rows[0] ? mapMember(result.rows[0]) : null;
  }

  async audit(input: {
    tripId: string;
    actorUserId: string;
    entityType: string;
    entityId?: string;
    action: string;
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
  }): Promise<void> {
    await this.sql.query(
      `insert into audit_logs (trip_id, actor_user_id, entity_type, entity_id, action, before_snapshot, after_snapshot)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [
        input.tripId,
        input.actorUserId,
        input.entityType,
        input.entityId ?? null,
        input.action,
        input.before ?? null,
        input.after ?? null,
      ],
    );
  }

  async listAuditLogs(input: {
    tripId: string;
    limit: number;
  }): Promise<TripAuditLog[]> {
    const result = await this.sql.query<TripAuditLogRow>(
      `select id::text, trip_id::text, actor_user_id::text, entity_type, entity_id::text,
              action, before_snapshot, after_snapshot, created_at::text
       from audit_logs
       where trip_id = $1
       order by created_at desc
       limit $2`,
      [input.tripId, input.limit],
    );
    return result.rows.map(mapAuditLog);
  }
}

function mapTrip(row: TripRow): Trip {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    visibility: row.visibility,
    ownerUserId: row.owner_user_id,
    createdAt: row.created_at,
  };
}

function mapTripSummary(row: TripSummaryRow): TripSummary {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    primary_city_slug: row.primary_city_slug,
    start_date: row.start_date,
    end_date: row.end_date,
    status: row.status,
    visibility: row.visibility,
    budget: row.budget === null ? null : Number(row.budget),
    currency: row.currency,
    role: row.role,
    member_count: Number(row.member_count),
    activity_count: Number(row.activity_count),
    checklist_done: Number(row.checklist_done),
    checklist_total: Number(row.checklist_total),
    expense_total: Number(row.expense_total),
    created_at: row.created_at,
  };
}

function mapMember(row: TripMemberRow): TripMember {
  return {
    tripId: row.trip_id,
    userId: row.user_id,
    displayName: row.display_name,
    email: row.email,
    role: row.role,
    status: row.status,
    invitedByUserId: row.invited_by_user_id,
    invitedByDisplayName: row.invited_by_display_name,
    invitedByEmail: row.invited_by_email,
    joinedAt: row.joined_at,
  };
}

function mapInvite(row: TripInviteRow): TripInvite {
  return {
    id: row.id,
    tripId: row.trip_id,
    invitedByUserId: row.invited_by_user_id,
    email: row.email,
    role: row.role,
    token: row.token,
    status: row.status,
    expiresAt: row.expires_at,
    acceptedByUserId: row.accepted_by_user_id,
    acceptedAt: row.accepted_at,
    createdAt: row.created_at,
  };
}

function mapShareLink(row: TripShareLinkRow): TripShareLink {
  return {
    tripId: row.trip_id,
    enabled: row.share_enabled,
    shareToken: row.share_token,
    role: row.share_role,
  };
}

function mapAuditLog(row: TripAuditLogRow): TripAuditLog {
  return {
    id: row.id,
    tripId: row.trip_id,
    actorUserId: row.actor_user_id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    action: row.action,
    beforeSnapshot: row.before_snapshot,
    afterSnapshot: row.after_snapshot,
    createdAt: row.created_at,
  };
}
