import type { TripMember } from "../../trips/domain/trip.entity.js";
import type { DataQualitySignal, ReviewDecision, ReviewEntityType, ReviewQueueItem } from "./review.entity.js";

export const REVIEW_REPOSITORY = Symbol("REVIEW_REPOSITORY");

export type ReviewRepository = {
  findTripMember(input: { tripId: string; userId: string }): Promise<TripMember | null>;
  listQueue(tripId: string): Promise<ReviewQueueItem[]>;
  reviewSubmission(input: {
    tripId: string;
    actorUserId: string;
    entityType: ReviewEntityType;
    entityId: string;
    decision: ReviewDecision;
  }): Promise<boolean>;
  listDataQualitySignals(tripId: string): Promise<DataQualitySignal[]>;
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
