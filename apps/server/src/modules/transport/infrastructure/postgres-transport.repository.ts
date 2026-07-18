import { Inject, Injectable } from "@nestjs/common";
import { SQL_CLIENT, type SqlClient } from "../../../database/database.tokens.js";
import type { TripMember, TripMemberRole, TripMemberStatus } from "../../trips/domain/trip.entity.js";
import type { TransportBooking, TransportMode } from "../domain/transport.entity.js";
import type { TransportRepository } from "../domain/transport.repository.js";

type TripMemberRow = {
  trip_id: string;
  user_id: string;
  role: TripMemberRole;
  status: TripMemberStatus;
  invited_by_user_id: string | null;
  joined_at: string;
};

type TransportRow = {
  id: string;
  trip_id: string;
  activity_id: string | null;
  mode: TransportMode;
  provider_name: string | null;
  booking_reference: string | null;
  origin_name: string;
  destination_name: string;
  departure_at: string | null;
  arrival_at: string | null;
  price: string | number | null;
  currency: string;
  booking_status: string;
  notes: string | null;
  created_by_user_id: string;
  updated_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

type ParticipantRow = {
  transport_booking_id: string;
  user_id: string;
};

@Injectable()
export class PostgresTransportRepository implements TransportRepository {
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

  async listActiveTripMemberIds(tripId: string): Promise<string[]> {
    const result = await this.sql.query<{ user_id: string }>(
      `select user_id::text
       from trip_members
       where trip_id = $1 and status = 'active'
       order by joined_at asc`,
      [tripId]
    );
    return result.rows.map((row) => row.user_id);
  }

  async listForTrip(tripId: string): Promise<TransportBooking[]> {
    const result = await this.sql.query<TransportRow>(
      `${transportSelectSql}
       where trip_id = $1
       order by departure_at asc nulls last, created_at asc`,
      [tripId]
    );
    return this.hydrate(result.rows);
  }

  async findForTrip(input: { tripId: string; bookingId: string }): Promise<TransportBooking | null> {
    const result = await this.sql.query<TransportRow>(
      `${transportSelectSql}
       where trip_id = $1 and id = $2
       limit 1`,
      [input.tripId, input.bookingId]
    );
    const [booking] = await this.hydrate(result.rows);
    return booking ?? null;
  }

  async create(input: {
    tripId: string;
    activityId?: string | null;
    mode: TransportMode;
    providerName?: string | null;
    bookingReference?: string | null;
    originName: string;
    destinationName: string;
    departureAt?: string | null;
    arrivalAt?: string | null;
    price?: number | null;
    currency: string;
    bookingStatus: string;
    notes?: string | null;
    createdByUserId: string;
    participantUserIds: string[];
  }): Promise<TransportBooking> {
    const result = await this.sql.query<TransportRow>(
      `insert into transport_bookings (
         trip_id, activity_id, mode, provider_name, booking_reference, origin_name,
         destination_name, departure_at, arrival_at, price, currency, booking_status,
         notes, created_by_user_id
       )
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       returning ${transportReturningSql}`,
      [
        input.tripId,
        input.activityId ?? null,
        input.mode,
        input.providerName ?? null,
        input.bookingReference ?? null,
        input.originName,
        input.destinationName,
        input.departureAt ?? null,
        input.arrivalAt ?? null,
        input.price ?? null,
        input.currency,
        input.bookingStatus,
        input.notes ?? null,
        input.createdByUserId,
      ]
    );
    await this.replaceParticipants(result.rows[0]!.id, input.participantUserIds);
    return (await this.findForTrip({ tripId: input.tripId, bookingId: result.rows[0]!.id }))!;
  }

  async update(input: {
    tripId: string;
    bookingId: string;
    activityId?: string | null;
    mode?: TransportMode;
    providerName?: string | null;
    bookingReference?: string | null;
    originName?: string;
    destinationName?: string;
    departureAt?: string | null;
    arrivalAt?: string | null;
    price?: number | null;
    currency?: string;
    bookingStatus?: string;
    notes?: string | null;
    updatedByUserId: string;
    participantUserIds?: string[];
  }): Promise<TransportBooking | null> {
    const result = await this.sql.query<TransportRow>(
      `update transport_bookings
       set activity_id = coalesce($3, activity_id),
           mode = coalesce($4, mode),
           provider_name = coalesce($5, provider_name),
           booking_reference = coalesce($6, booking_reference),
           origin_name = coalesce($7, origin_name),
           destination_name = coalesce($8, destination_name),
           departure_at = coalesce($9, departure_at),
           arrival_at = coalesce($10, arrival_at),
           price = coalesce($11, price),
           currency = coalesce($12, currency),
           booking_status = coalesce($13, booking_status),
           notes = coalesce($14, notes),
           updated_by_user_id = $15,
           updated_at = now()
       where trip_id = $1 and id = $2
       returning ${transportReturningSql}`,
      [
        input.tripId,
        input.bookingId,
        input.activityId ?? null,
        input.mode ?? null,
        input.providerName ?? null,
        input.bookingReference ?? null,
        input.originName ?? null,
        input.destinationName ?? null,
        input.departureAt ?? null,
        input.arrivalAt ?? null,
        input.price ?? null,
        input.currency ?? null,
        input.bookingStatus ?? null,
        input.notes ?? null,
        input.updatedByUserId,
      ]
    );
    if (!result.rows[0]) return null;
    if (input.participantUserIds) await this.replaceParticipants(input.bookingId, input.participantUserIds);
    return this.findForTrip({ tripId: input.tripId, bookingId: input.bookingId });
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

  private async replaceParticipants(bookingId: string, userIds: string[]): Promise<void> {
    await this.sql.query(`delete from transport_booking_participants where transport_booking_id = $1`, [bookingId]);
    for (const userId of userIds) {
      await this.sql.query(
        `insert into transport_booking_participants (transport_booking_id, user_id)
         values ($1, $2)
         on conflict (transport_booking_id, user_id) do nothing`,
        [bookingId, userId]
      );
    }
  }

  private async hydrate(rows: TransportRow[]): Promise<TransportBooking[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((row) => row.id);
    const participants = await this.sql.query<ParticipantRow>(
      `select transport_booking_id::text, user_id::text
       from transport_booking_participants
       where transport_booking_id = any($1::uuid[])`,
      [ids]
    );
    const byBooking = new Map<string, string[]>();
    for (const row of participants.rows) {
      const userIds = byBooking.get(row.transport_booking_id) ?? [];
      userIds.push(row.user_id);
      byBooking.set(row.transport_booking_id, userIds);
    }
    return rows.map((row) => ({ ...mapBooking(row), participantUserIds: byBooking.get(row.id) ?? [] }));
  }
}

const transportSelectSql = `select id::text, trip_id::text, activity_id::text, mode, provider_name,
                                   booking_reference, origin_name, destination_name, departure_at::text,
                                   arrival_at::text, price, currency, booking_status, notes,
                                   created_by_user_id::text, updated_by_user_id::text,
                                   created_at::text, updated_at::text
                            from transport_bookings`;

const transportReturningSql = `id::text, trip_id::text, activity_id::text, mode, provider_name,
                               booking_reference, origin_name, destination_name, departure_at::text,
                               arrival_at::text, price, currency, booking_status, notes,
                               created_by_user_id::text, updated_by_user_id::text,
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

function mapBooking(row: TransportRow): TransportBooking {
  return {
    id: row.id,
    tripId: row.trip_id,
    activityId: row.activity_id,
    mode: row.mode,
    providerName: row.provider_name,
    bookingReference: row.booking_reference,
    originName: row.origin_name,
    destinationName: row.destination_name,
    departureAt: row.departure_at,
    arrivalAt: row.arrival_at,
    price: row.price === null ? null : Number(row.price),
    currency: row.currency,
    bookingStatus: row.booking_status,
    notes: row.notes,
    createdByUserId: row.created_by_user_id,
    updatedByUserId: row.updated_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    participantUserIds: [],
  };
}
