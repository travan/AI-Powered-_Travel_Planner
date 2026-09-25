import { Inject, Injectable } from "@nestjs/common";
import {
  forbidden,
  notFound,
  ok,
  type ServiceResult,
} from "../../../shared/application/service-result.js";
import { getTripRolePermissions } from "../../../shared/application/trip-role-permissions.js";
import type {
  ActivityCatalogItem,
  TripActivity,
  TripActivityParticipant,
} from "../domain/activity.entity.js";
import {
  ACTIVITY_REPOSITORY,
  type ActivityRepository,
} from "../domain/activity.repository.js";
import type {
  ActivityCatalogQueryDto,
  CreateTripActivityDto,
  UpdateActivityParticipantDto,
  UpdateTripActivityDto,
} from "../dto/activity.dto.js";

@Injectable()
export class ActivitiesService {
  constructor(
    @Inject(ACTIVITY_REPOSITORY)
    private readonly activities: ActivityRepository,
  ) {}

  searchCatalog(
    query: ActivityCatalogQueryDto,
  ): Promise<ActivityCatalogItem[]> {
    return this.activities.searchCatalog(query);
  }

  async listTripActivities(input: {
    tripId: string;
    actorUserId: string;
  }): Promise<ServiceResult<TripActivity[]>> {
    const member = await this.activities.findTripMember({
      tripId: input.tripId,
      userId: input.actorUserId,
    });
    if (!member || member.status !== "active")
      return notFound("Trip not found");
    return ok(await this.activities.listTripActivities(input.tripId));
  }

  async createTripActivity(input: {
    tripId: string;
    actorUserId: string;
    dto: CreateTripActivityDto;
  }): Promise<ServiceResult<TripActivity>> {
    const member = await this.activities.findTripMember({
      tripId: input.tripId,
      userId: input.actorUserId,
    });
    if (!member || member.status !== "active")
      return notFound("Trip not found");
    if (!getTripRolePermissions(member.role).contribute) {
      return forbidden(
        "Viewers cannot add activities",
        "activity_create_forbidden",
      );
    }

    const activity = await this.activities.createTripActivity({
      tripId: input.tripId,
      activityCatalogId: input.dto.activity_catalog_id ?? null,
      title: input.dto.title.trim(),
      category: input.dto.category.trim(),
      scheduledAt: input.dto.scheduled_at ?? null,
      locationName: input.dto.location_name?.trim() || null,
      address: input.dto.address?.trim() || null,
      estimatedCost: input.dto.estimated_cost ?? null,
      currency: input.dto.currency.toUpperCase(),
      createdByUserId: input.actorUserId,
      status: ["host", "co_host"].includes(member.role)
        ? "approved"
        : "pending_review",
    });
    await this.activities.audit({
      tripId: input.tripId,
      actorUserId: input.actorUserId,
      entityType: "trip_activity",
      entityId: activity.id,
      action: "created",
      after: activity,
    });
    return ok(activity);
  }

  async updateTripActivity(input: {
    tripId: string;
    activityId: string;
    actorUserId: string;
    dto: UpdateTripActivityDto;
  }): Promise<ServiceResult<TripActivity>> {
    const before = await this.activities.findTripActivity({
      tripId: input.tripId,
      activityId: input.activityId,
    });
    if (!before) return notFound("Activity not found");

    const member = await this.activities.findTripMember({
      tripId: input.tripId,
      userId: input.actorUserId,
    });
    if (!member || member.status !== "active")
      return notFound("Trip not found");
    const permissions = getTripRolePermissions(member.role);
    if (!permissions.contribute) {
      return forbidden(
        "Viewers cannot edit activities",
        "activity_edit_forbidden",
      );
    }
    if (
      before.createdByUserId !== input.actorUserId &&
      !["host", "co_host"].includes(member.role)
    ) {
      return forbidden(
        "Only host/co-host or creator can edit this activity",
        "activity_edit_forbidden",
      );
    }
    const reviewOnlyStatuses = ["pending_review", "approved", "rejected"];
    if (
      input.dto.status !== undefined &&
      reviewOnlyStatuses.includes(input.dto.status) &&
      !permissions.reviewSubmissions
    ) {
      return forbidden(
        "Only host/co-host can change activity review status",
        "activity_status_forbidden",
      );
    }

    const updated = await this.activities.updateTripActivity({
      tripId: input.tripId,
      activityId: input.activityId,
      title: input.dto.title?.trim(),
      category: input.dto.category?.trim(),
      scheduledAt: input.dto.scheduled_at,
      locationName: input.dto.location_name?.trim(),
      address: input.dto.address?.trim(),
      estimatedCost: input.dto.estimated_cost,
      currency: input.dto.currency?.toUpperCase(),
      status: input.dto.status,
      updatedByUserId: input.actorUserId,
    });
    if (!updated) return notFound("Activity not found");

    await this.activities.audit({
      tripId: input.tripId,
      actorUserId: input.actorUserId,
      entityType: "trip_activity",
      entityId: updated.id,
      action: "updated",
      before,
      after: updated,
    });
    return ok(updated);
  }

  async updateParticipant(input: {
    tripId: string;
    activityId: string;
    targetUserId: string;
    actorUserId: string;
    dto: UpdateActivityParticipantDto;
  }): Promise<ServiceResult<TripActivityParticipant>> {
    const member = await this.activities.findTripMember({
      tripId: input.tripId,
      userId: input.actorUserId,
    });
    if (!member || member.status !== "active")
      return notFound("Trip not found");
    if (
      input.actorUserId !== input.targetUserId &&
      !["host", "co_host"].includes(member.role)
    ) {
      return forbidden(
        "Only host/co-host can update another user's activity participation",
        "participant_edit_forbidden",
      );
    }

    const participant = await this.activities.upsertParticipant({
      tripId: input.tripId,
      activityId: input.activityId,
      userId: input.targetUserId,
      status: input.dto.status,
    });
    if (!participant) return notFound("Activity not found");
    await this.activities.audit({
      tripId: input.tripId,
      actorUserId: input.actorUserId,
      entityType: "trip_activity_participant",
      entityId: input.activityId,
      action: `participant_${input.dto.status}`,
      after: participant,
    });
    return ok(participant);
  }
}
