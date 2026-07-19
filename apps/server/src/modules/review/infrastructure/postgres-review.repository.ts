import { Inject, Injectable } from "@nestjs/common";
import { SQL_CLIENT, type SqlClient } from "../../../database/database.tokens.js";
import type { TripMember, TripMemberRole, TripMemberStatus } from "../../trips/domain/trip.entity.js";
import type { DataQualitySignal, ReviewDecision, ReviewEntityType, ReviewQueueItem } from "../domain/review.entity.js";
import type { ReviewRepository } from "../domain/review.repository.js";

type TripMemberRow = {
  trip_id: string;
  user_id: string;
  role: TripMemberRole;
  status: TripMemberStatus;
  invited_by_user_id: string | null;
  joined_at: string;
};

type ReviewQueueRow = {
  id: string;
  entity_type: ReviewEntityType;
  entity_id: string;
  title: string;
  subtitle: string | null;
  status: string;
  submitted_by_user_id: string | null;
  amount: string | number | null;
  currency: string | null;
  linked_activity_id: string | null;
  created_at: string;
};

type DataQualitySignalRow = {
  id: string;
  signal_type: DataQualitySignal["signalType"];
  severity: DataQualitySignal["severity"];
  title: string;
  detail: string;
  entity_type: string;
  entity_id: string | null;
  status: DataQualitySignal["status"];
};

@Injectable()
export class PostgresReviewRepository implements ReviewRepository {
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

  async listQueue(tripId: string): Promise<ReviewQueueItem[]> {
    const result = await this.sql.query<ReviewQueueRow>(
      `select *
       from (
         select
           'activity:' || id::text as id,
           'activity'::text as entity_type,
           id::text as entity_id,
           title,
           coalesce(location_name, address) as subtitle,
           status,
           created_by_user_id::text as submitted_by_user_id,
           estimated_cost as amount,
           currency,
           id::text as linked_activity_id,
           created_at::text as created_at
         from trip_activities
         where trip_id = $1 and status in ('pending_review', 'rejected')

         union all

         select
           'bill:' || id::text as id,
           'bill'::text as entity_type,
           id::text as entity_id,
           coalesce(merchant_name, 'Unverified bill') as title,
           coalesce(left(raw_text, 120), storage_url) as subtitle,
           status,
           uploaded_by_user_id::text as submitted_by_user_id,
           total_amount as amount,
           currency,
           activity_id::text as linked_activity_id,
           created_at::text as created_at
         from bill_uploads
         where trip_id = $1 and status not in ('approved', 'rejected')

         union all

         select
           'expense:' || id::text as id,
           'expense'::text as entity_type,
           id::text as entity_id,
           title,
           description as subtitle,
           status,
           created_by_user_id::text as submitted_by_user_id,
           amount,
           currency,
           activity_id::text as linked_activity_id,
           created_at::text as created_at
         from expenses
         where trip_id = $1 and status = 'pending_review'

         union all

         select
           'place_signal:' || id::text as id,
           'place_signal'::text as entity_type,
           id::text as entity_id,
           title,
           detail as subtitle,
           status,
           null::text as submitted_by_user_id,
           null::numeric as amount,
           null::text as currency,
           null::text as linked_activity_id,
           created_at::text as created_at
         from data_quality_signals
         where trip_id = $1 and status = 'open'
       ) queue
       order by created_at desc`,
      [tripId]
    );
    return result.rows.map(mapReviewQueueItem);
  }

  async reviewSubmission(input: {
    tripId: string;
    actorUserId: string;
    entityType: ReviewEntityType;
    entityId: string;
    decision: ReviewDecision;
  }): Promise<boolean> {
    if (input.entityType === "activity") {
      const result = await this.sql.query(
        `update trip_activities
         set status = $4, updated_by_user_id = $3, updated_at = now()
         where trip_id = $1 and id = $2
         returning id::text`,
        [input.tripId, input.entityId, input.actorUserId, input.decision]
      );
      return result.rows.length > 0;
    }

    if (input.entityType === "bill") {
      const result = await this.sql.query(
        `update bill_uploads
         set status = $3, updated_at = now()
         where trip_id = $1 and id = $2
         returning id::text`,
        [input.tripId, input.entityId, input.decision]
      );
      return result.rows.length > 0;
    }

    if (input.entityType === "expense") {
      const result = await this.sql.query(
        `update expenses
         set status = $4, updated_by_user_id = $3, updated_at = now()
         where trip_id = $1 and id = $2
         returning id::text`,
        [input.tripId, input.entityId, input.actorUserId, input.decision]
      );
      return result.rows.length > 0;
    }

    const result = await this.sql.query(
      `update data_quality_signals
       set status = 'reviewed', reviewed_by_user_id = $3, reviewed_at = now()
       where trip_id = $1 and id = $2
       returning id::text`,
      [input.tripId, input.entityId, input.actorUserId]
    );
    return result.rows.length > 0;
  }

  async listDataQualitySignals(tripId: string): Promise<DataQualitySignal[]> {
    const result = await this.sql.query<DataQualitySignalRow>(
      `select id::text, signal_type, severity, title, detail, entity_type, entity_id::text, status
       from data_quality_signals
       where trip_id = $1
       order by created_at desc
       limit 50`,
      [tripId]
    );
    return result.rows.map(mapDataQualitySignal);
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
}

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

function mapReviewQueueItem(row: ReviewQueueRow): ReviewQueueItem {
  return {
    id: row.id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    title: row.title,
    subtitle: row.subtitle,
    status: row.status,
    submittedByUserId: row.submitted_by_user_id,
    amount: row.amount === null ? null : Number(row.amount),
    currency: row.currency,
    linkedActivityId: row.linked_activity_id,
    createdAt: row.created_at,
  };
}

function mapDataQualitySignal(row: DataQualitySignalRow): DataQualitySignal {
  return {
    id: row.id,
    signalType: row.signal_type,
    severity: row.severity,
    title: row.title,
    detail: row.detail,
    entityType: row.entity_type,
    entityId: row.entity_id,
    status: row.status,
  };
}
