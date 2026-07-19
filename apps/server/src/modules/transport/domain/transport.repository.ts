import type { TripMember } from "../../trips/domain/trip.entity.js";
import type { TransportBooking, TransportMode } from "./transport.entity.js";

export const TRANSPORT_REPOSITORY = Symbol("TRANSPORT_REPOSITORY");

export type TransportRepository = {
  findTripMember(input: { tripId: string; userId: string }): Promise<TripMember | null>;
  listActiveTripMemberIds(tripId: string): Promise<string[]>;
  listForTrip(tripId: string): Promise<TransportBooking[]>;
  findForTrip(input: { tripId: string; bookingId: string }): Promise<TransportBooking | null>;
  create(input: {
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
  }): Promise<TransportBooking>;
  update(input: {
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
  }): Promise<TransportBooking | null>;
  audit(input: {
    tripId: string;
    actorUserId: string;
    entityType: string;
    entityId?: string;
    action: string;
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
  }): Promise<void>;
};
