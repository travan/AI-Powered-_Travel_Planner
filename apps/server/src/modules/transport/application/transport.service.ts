import { Inject, Injectable } from "@nestjs/common";
import { badRequest, forbidden, notFound, ok, type ServiceResult } from "../../../shared/application/service-result.js";
import type { TransportBooking } from "../domain/transport.entity.js";
import { TRANSPORT_REPOSITORY, type TransportRepository } from "../domain/transport.repository.js";
import type { CreateTransportBookingDto, UpdateTransportBookingDto } from "../dto/transport.dto.js";

@Injectable()
export class TransportService {
  constructor(@Inject(TRANSPORT_REPOSITORY) private readonly transport: TransportRepository) {}

  async listForTrip(input: { tripId: string; actorUserId: string }): Promise<ServiceResult<TransportBooking[]>> {
    const member = await this.transport.findTripMember({ tripId: input.tripId, userId: input.actorUserId });
    if (!member || member.status !== "active") return notFound("Trip not found");
    return ok(await this.transport.listForTrip(input.tripId));
  }

  async create(input: {
    tripId: string;
    actorUserId: string;
    dto: CreateTransportBookingDto;
  }): Promise<ServiceResult<TransportBooking>> {
    const member = await this.transport.findTripMember({ tripId: input.tripId, userId: input.actorUserId });
    if (!member || member.status !== "active") return notFound("Trip not found");

    const participants = await this.resolveParticipants(input.tripId, input.dto.participant_user_ids);
    if (!participants.ok) return participants;

    const booking = await this.transport.create({
      tripId: input.tripId,
      activityId: input.dto.activity_id ?? null,
      mode: input.dto.mode,
      providerName: input.dto.provider_name ?? null,
      bookingReference: input.dto.booking_reference ?? null,
      originName: input.dto.origin_name.trim(),
      destinationName: input.dto.destination_name.trim(),
      departureAt: input.dto.departure_at ?? null,
      arrivalAt: input.dto.arrival_at ?? null,
      price: input.dto.price ?? null,
      currency: input.dto.currency.toUpperCase(),
      bookingStatus: input.dto.booking_status,
      notes: input.dto.notes ?? null,
      createdByUserId: input.actorUserId,
      participantUserIds: participants.value,
    });
    await this.transport.audit({
      tripId: input.tripId,
      actorUserId: input.actorUserId,
      entityType: "transport_booking",
      entityId: booking.id,
      action: "created",
      after: booking,
    });
    return ok(booking);
  }

  async update(input: {
    tripId: string;
    bookingId: string;
    actorUserId: string;
    dto: UpdateTransportBookingDto;
  }): Promise<ServiceResult<TransportBooking>> {
    const before = await this.transport.findForTrip({ tripId: input.tripId, bookingId: input.bookingId });
    if (!before) return notFound("Transport booking not found");

    const member = await this.transport.findTripMember({ tripId: input.tripId, userId: input.actorUserId });
    if (!member || member.status !== "active") return notFound("Trip not found");
    if (before.createdByUserId !== input.actorUserId && !["host", "admin"].includes(member.role)) {
      return forbidden("Only host/admin or creator can edit this transport booking", "transport_edit_forbidden");
    }

    let participantUserIds: string[] | undefined;
    if (input.dto.participant_user_ids) {
      const participants = await this.resolveParticipants(input.tripId, input.dto.participant_user_ids);
      if (!participants.ok) return participants;
      participantUserIds = participants.value;
    }

    const updated = await this.transport.update({
      tripId: input.tripId,
      bookingId: input.bookingId,
      activityId: input.dto.activity_id,
      mode: input.dto.mode,
      providerName: input.dto.provider_name,
      bookingReference: input.dto.booking_reference,
      originName: input.dto.origin_name?.trim(),
      destinationName: input.dto.destination_name?.trim(),
      departureAt: input.dto.departure_at,
      arrivalAt: input.dto.arrival_at,
      price: input.dto.price,
      currency: input.dto.currency?.toUpperCase(),
      bookingStatus: input.dto.booking_status,
      notes: input.dto.notes,
      updatedByUserId: input.actorUserId,
      participantUserIds,
    });
    if (!updated) return notFound("Transport booking not found");
    await this.transport.audit({
      tripId: input.tripId,
      actorUserId: input.actorUserId,
      entityType: "transport_booking",
      entityId: updated.id,
      action: "updated",
      before,
      after: updated,
    });
    return ok(updated);
  }

  private async resolveParticipants(tripId: string, requested?: string[]): Promise<ServiceResult<string[]>> {
    const activeMembers = await this.transport.listActiveTripMemberIds(tripId);
    const participants = requested?.length ? requested : activeMembers;
    const invalid = participants.find((userId) => !activeMembers.includes(userId));
    if (invalid) return badRequest("Every transport participant must be an active trip member", "transport_participant_not_member");
    return ok([...new Set(participants)]);
  }
}
