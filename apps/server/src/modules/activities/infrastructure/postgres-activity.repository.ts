import { Inject, Injectable } from "@nestjs/common";
import { SQL_CLIENT, type SqlClient } from "../../../database/database.tokens.js";
import type { TripMember, TripMemberRole, TripMemberStatus } from "../../trips/domain/trip.entity.js";
import type { ActivityCatalogItem, TripActivity, TripActivityParticipant } from "../domain/activity.entity.js";
import type { ActivityRepository } from "../domain/activity.repository.js";

type TripMemberRow = {
  trip_id: string;
  user_id: string;
  role: TripMemberRole;
  status: TripMemberStatus;
  invited_by_user_id: string | null;
  joined_at: string;
};

type CatalogRow = {
  id: string;
  canonical_name: string;
  category: string;
  city_slug: string | null;
  address: string | null;
  source: string;
  quality_score: string | number;
  is_outdated: boolean;
  last_verified_at: string | null;
};

type ActivityRow = {
  id: string;
  trip_id: string;
  activity_catalog_id: string | null;
  title: string;
  category: string;
  scheduled_at: string | null;
  location_name: string | null;
  address: string | null;
  estimated_cost: string | number | null;
  currency: string;
  created_by_user_id: string;
  updated_by_user_id: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

type ParticipantRow = {
  activity_id: string;
  user_id: string;
  status: TripActivityParticipant["status"];
  joined_at: string;
};

@Injectable()
export class PostgresActivityRepository implements ActivityRepository {
  constructor(@Inject(SQL_CLIENT) private readonly sql: SqlClient) {}

  async findTripMember(input: { tripId: string; userId: string }): Promise<TripMember | null> {
    const result = await this.sql.query<TripMemberRow>(
      `select trip_id::text, user_id::text, role, status, invited_by_user_id::text, joined_at::text
       from trip_members
       where trip_id = $1 and user_id = $2
       limit 1`,
      [input.tripId, input.userId]
    );
    return result.rows[0] ? mapMember(result.rows[0]) : null;
  }

  async searchCatalog(input: {
    citySlug?: string;
    category?: string;
    q?: string;
    limit: number;
  }): Promise<ActivityCatalogItem[]> {
    const result = await this.sql.query<CatalogRow>(
      `select id::text, canonical_name, category, city_slug, address, source,
              quality_score, is_outdated, last_verified_at::text
       from activity_catalog
       where ($1::text is null or city_slug = $1)
         and ($2::text is null or category = $2)
         and ($3::text is null or canonical_name ilike '%' || $3 || '%' or address ilike '%' || $3 || '%')
         and is_outdated = false
       order by quality_score desc, last_verified_at desc nulls last
       limit $4`,
      [input.citySlug ?? null, input.category ?? null, input.q ?? null, input.limit]
    );
    return result.rows.map(mapCatalog);
  }

  async listTripActivities(tripId: string): Promise<TripActivity[]> {
    const result = await this.sql.query<ActivityRow>(
      `${activitySelectSql}
       where trip_id = $1
       order by scheduled_at asc nulls last, created_at asc`,
      [tripId]
    );
    return this.hydrateActivities(result.rows);
  }

  async findTripActivity(input: { tripId: string; activityId: string }): Promise<TripActivity | null> {
    const result = await this.sql.query<ActivityRow>(
      `${activitySelectSql}
       where trip_id = $1 and id = $2
       limit 1`,
      [input.tripId, input.activityId]
    );
    const [activity] = await this.hydrateActivities(result.rows);
    return activity ?? null;
  }

  async createTripActivity(input: {
    tripId: string;
    activityCatalogId?: string | null;
    title: string;
    category: string;
    scheduledAt?: string | null;
    locationName?: string | null;
    address?: string | null;
    estimatedCost?: number | null;
    currency: string;
    createdByUserId: string;
    status: string;
  }): Promise<TripActivity> {
    const result = await this.sql.query<ActivityRow>(
      `insert into trip_activities (
         trip_id, activity_catalog_id, title, category, scheduled_at, location_name,
         address, estimated_cost, currency, created_by_user_id, status
       )
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       returning ${activityReturningSql}`,
      [
        input.tripId,
        input.activityCatalogId ?? null,
        input.title,
        input.category,
        input.scheduledAt ?? null,
        input.locationName ?? null,
        input.address ?? null,
        input.estimatedCost ?? null,
        input.currency,
        input.createdByUserId,
        input.status,
      ]
    );
    return (await this.findTripActivity({ tripId: input.tripId, activityId: result.rows[0]!.id }))!;
  }

  async updateTripActivity(input: {
    tripId: string;
    activityId: string;
    title?: string;
    category?: string;
    scheduledAt?: string | null;
    locationName?: string | null;
    address?: string | null;
    estimatedCost?: number | null;
    currency?: string;
    status?: string;
    updatedByUserId: string;
  }): Promise<TripActivity | null> {
    const result = await this.sql.query<ActivityRow>(
      `update trip_activities
       set title = coalesce($3, title),
           category = coalesce($4, category),
           scheduled_at = coalesce($5, scheduled_at),
           location_name = coalesce($6, location_name),
           address = coalesce($7, address),
           estimated_cost = coalesce($8, estimated_cost),
           currency = coalesce($9, currency),
           status = coalesce($10, status),
           updated_by_user_id = $11,
           updated_at = now()
       where trip_id = $1 and id = $2
       returning ${activityReturningSql}`,
      [
        input.tripId,
        input.activityId,
        input.title ?? null,
        input.category ?? null,
        input.scheduledAt ?? null,
        input.locationName ?? null,
        input.address ?? null,
        input.estimatedCost ?? null,
        input.currency ?? null,
        input.status ?? null,
        input.updatedByUserId,
      ]
    );
    if (!result.rows[0]) return null;
    return this.findTripActivity({ tripId: input.tripId, activityId: input.activityId });
  }

  async upsertParticipant(input: {
    tripId: string;
    activityId: string;
    userId: string;
    status: TripActivityParticipant["status"];
  }): Promise<TripActivityParticipant | null> {
    const activity = await this.findTripActivity({ tripId: input.tripId, activityId: input.activityId });
    if (!activity) return null;
    const result = await this.sql.query<ParticipantRow>(
      `insert into trip_activity_participants (activity_id, user_id, status)
       values ($1, $2, $3)
       on conflict (activity_id, user_id)
       do update set status = excluded.status
       returning activity_id::text, user_id::text, status, joined_at::text`,
      [input.activityId, input.userId, input.status]
    );
    return mapParticipant(result.rows[0]!);
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
      ]
    );
  }

  private async hydrateActivities(rows: ActivityRow[]): Promise<TripActivity[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((row) => row.id);
    const participants = await this.sql.query<ParticipantRow>(
      `select activity_id::text, user_id::text, status, joined_at::text
       from trip_activity_participants
       where activity_id = any($1::uuid[])
       order by joined_at asc`,
      [ids]
    );
    const byActivity = new Map<string, TripActivityParticipant[]>();
    for (const row of participants.rows) {
      const current = byActivity.get(row.activity_id) ?? [];
      current.push(mapParticipant(row));
      byActivity.set(row.activity_id, current);
    }
    return rows.map((row) => ({ ...mapActivity(row), participants: byActivity.get(row.id) ?? [] }));
  }
}

const activitySelectSql = `select id::text, trip_id::text, activity_catalog_id::text, title, category,
                                  scheduled_at::text, location_name, address, estimated_cost, currency,
                                  created_by_user_id::text, updated_by_user_id::text, status,
                                  created_at::text, updated_at::text
                           from trip_activities`;

const activityReturningSql = `id::text, trip_id::text, activity_catalog_id::text, title, category,
                              scheduled_at::text, location_name, address, estimated_cost, currency,
                              created_by_user_id::text, updated_by_user_id::text, status,
                              created_at::text, updated_at::text`;

function mapMember(row: TripMemberRow): TripMember {
  return {
    tripId: row.trip_id,
    userId: row.user_id,
    role: row.role,
    status: row.status,
    invitedByUserId: row.invited_by_user_id,
    joinedAt: row.joined_at,
  };
}

function mapCatalog(row: CatalogRow): ActivityCatalogItem {
  return {
    id: row.id,
    canonicalName: row.canonical_name,
    category: row.category,
    citySlug: row.city_slug,
    address: row.address,
    source: row.source,
    qualityScore: Number(row.quality_score),
    isOutdated: row.is_outdated,
    lastVerifiedAt: row.last_verified_at,
  };
}

function mapActivity(row: ActivityRow): TripActivity {
  return {
    id: row.id,
    tripId: row.trip_id,
    activityCatalogId: row.activity_catalog_id,
    title: row.title,
    category: row.category,
    scheduledAt: row.scheduled_at,
    locationName: row.location_name,
    address: row.address,
    estimatedCost: row.estimated_cost === null ? null : Number(row.estimated_cost),
    currency: row.currency,
    createdByUserId: row.created_by_user_id,
    updatedByUserId: row.updated_by_user_id,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    participants: [],
  };
}

function mapParticipant(row: ParticipantRow): TripActivityParticipant {
  return {
    activityId: row.activity_id,
    userId: row.user_id,
    status: row.status,
    joinedAt: row.joined_at,
  };
}
