import { Inject, Injectable } from "@nestjs/common";
import { forbidden, notFound, ok, type ServiceResult } from "../../../shared/application/service-result.js";
import type { DataQualitySignal, ReviewQueueItem } from "../domain/review.entity.js";
import { REVIEW_REPOSITORY, type ReviewRepository } from "../domain/review.repository.js";
import type { ReviewSubmissionDto } from "../dto/review.dto.js";

@Injectable()
export class ReviewService {
  constructor(@Inject(REVIEW_REPOSITORY) private readonly review: ReviewRepository) {}

  async listQueue(input: { tripId: string; actorUserId: string }): Promise<ServiceResult<ReviewQueueItem[]>> {
    const member = await this.review.findTripMember({ tripId: input.tripId, userId: input.actorUserId });
    if (!member || member.status !== "active") return notFound("Trip not found");
    if (!["host", "admin"].includes(member.role)) {
      return forbidden("Only host or admin can review submissions", "review_forbidden");
    }
    return ok(await this.review.listQueue(input.tripId));
  }

  async reviewSubmission(input: {
    tripId: string;
    actorUserId: string;
    dto: ReviewSubmissionDto;
  }): Promise<ServiceResult<ReviewQueueItem[]>> {
    const member = await this.review.findTripMember({ tripId: input.tripId, userId: input.actorUserId });
    if (!member || member.status !== "active") return notFound("Trip not found");
    if (!["host", "admin"].includes(member.role)) {
      return forbidden("Only host or admin can review submissions", "review_forbidden");
    }

    const reviewed = await this.review.reviewSubmission({
      tripId: input.tripId,
      actorUserId: input.actorUserId,
      entityType: input.dto.entity_type,
      entityId: input.dto.entity_id,
      decision: input.dto.decision,
    });
    if (!reviewed) return notFound("Review target not found");

    await this.review.audit({
      tripId: input.tripId,
      actorUserId: input.actorUserId,
      entityType: input.dto.entity_type === "bill" ? "bill_upload" : input.dto.entity_type,
      entityId: input.dto.entity_id,
      action: `host_${input.dto.decision}`,
      after: { decision: input.dto.decision, notes: input.dto.notes ?? null },
    });

    return ok(await this.review.listQueue(input.tripId));
  }

  async listDataQualitySignals(input: {
    tripId: string;
    actorUserId: string;
  }): Promise<ServiceResult<DataQualitySignal[]>> {
    const member = await this.review.findTripMember({ tripId: input.tripId, userId: input.actorUserId });
    if (!member || member.status !== "active") return notFound("Trip not found");
    return ok(await this.review.listDataQualitySignals(input.tripId));
  }
}
