import type { TripMember } from "../../trips/domain/trip.entity.js";
import type { ActivityCatalogItem, TripActivity, TripActivityParticipant } from "./activity.entity.js";

export const ACTIVITY_REPOSITORY = Symbol("ACTIVITY_REPOSITORY");

export type ActivityRepository = {
  findTripMember(input: { tripId: string; userId: string }): Promise<TripMember | null>;
  searchCatalog(input: {
    citySlug?: string;
    category?: string;
    q?: string;
    limit: number;
  }): Promise<ActivityCatalogItem[]>;
  listTripActivities(tripId: string): Promise<TripActivity[]>;
  findTripActivity(input: { tripId: string; activityId: string }): Promise<TripActivity | null>;
  createTripActivity(input: {
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
  }): Promise<TripActivity>;
  updateTripActivity(input: {
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
  }): Promise<TripActivity | null>;
  upsertParticipant(input: {
    tripId: string;
    activityId: string;
    userId: string;
    status: TripActivityParticipant["status"];
  }): Promise<TripActivityParticipant | null>;
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
