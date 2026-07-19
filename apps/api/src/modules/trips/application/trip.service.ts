import type {
  TripActivitySummary,
  TripChangeRequestSummary,
  TripChecklistItem,
  TripDetail,
  TripExpenseSummary,
  TripSummary,
  UserPlaceSubmissionSummary,
  UserProfileSummary,
} from "@travel/types";
import {
  createPlaceSubmission,
  createTripActivity,
  createTripExpense,
  getProfileSummary,
  getTripDetailForUser,
  listTripsForUser,
  reviewTripChangeRequest,
  updateChecklistStatus,
  updateTripActivityStatus,
} from "../../../db/trip-store.js";
import type {
  ActivityStatusDto,
  ChecklistStatusDto,
  CreatePlaceSubmissionDto,
  CreateTripActivityDto,
  CreateTripExpenseDto,
  ReviewTripChangeRequestDto,
} from "../dto/trip.dto.js";

type ServiceErrorCode = "not_found" | "forbidden";
type ServiceError = {
  code: ServiceErrorCode;
  statusCode: 403 | 404;
  message: string;
};
type ServiceResult<T> = { ok: true; value: T } | { ok: false; error: ServiceError };

const forbidden = (message: string): ServiceResult<never> => ({
  ok: false,
  error: { code: "forbidden", statusCode: 403, message },
});

const notFound = (message: string): ServiceResult<never> => ({
  ok: false,
  error: { code: "not_found", statusCode: 404, message },
});

export class TripService {
  async getProfile(userId: string): Promise<ServiceResult<UserProfileSummary>> {
    const profile = await getProfileSummary(userId);
    return profile ? { ok: true, value: profile } : notFound("Profile not found");
  }

  listTrips(userId: string): Promise<TripSummary[]> {
    return listTripsForUser(userId);
  }

  async getTripDetail(input: {
    tripId: string;
    userId: string;
  }): Promise<ServiceResult<TripDetail>> {
    const trip = await getTripDetailForUser(input);
    return trip ? { ok: true, value: trip } : notFound("Trip not found or access denied");
  }

  async updateActivityStatus(input: {
    tripId: string;
    activityId: string;
    userId: string;
    dto: ActivityStatusDto;
  }): Promise<ServiceResult<TripActivitySummary>> {
    const activity = await updateTripActivityStatus({
      tripId: input.tripId,
      activityId: input.activityId,
      userId: input.userId,
      status: input.dto.status,
    });
    return activity ? { ok: true, value: activity } : forbidden("You cannot update this activity");
  }

  async updateChecklistStatus(input: {
    tripId: string;
    itemId: string;
    userId: string;
    dto: ChecklistStatusDto;
  }): Promise<ServiceResult<TripChecklistItem>> {
    const checklistItem = await updateChecklistStatus({
      tripId: input.tripId,
      itemId: input.itemId,
      userId: input.userId,
      status: input.dto.status,
    });
    return checklistItem
      ? { ok: true, value: checklistItem }
      : forbidden("You cannot update this checklist item");
  }

  async addActivity(input: {
    tripId: string;
    userId: string;
    dto: CreateTripActivityDto;
  }): Promise<ServiceResult<TripActivitySummary>> {
    const activity = await createTripActivity({
      tripId: input.tripId,
      userId: input.userId,
      body: input.dto,
    });
    return activity ? { ok: true, value: activity } : forbidden("You cannot add activities to this trip");
  }

  async addPlaceSubmission(input: {
    tripId: string;
    userId: string;
    dto: CreatePlaceSubmissionDto;
  }): Promise<ServiceResult<UserPlaceSubmissionSummary>> {
    const submission = await createPlaceSubmission({
      tripId: input.tripId,
      userId: input.userId,
      body: input.dto,
    });
    return submission ? { ok: true, value: submission } : forbidden("You cannot add places to this trip");
  }

  async addExpense(input: {
    tripId: string;
    userId: string;
    dto: CreateTripExpenseDto;
  }): Promise<ServiceResult<TripExpenseSummary>> {
    const expense = await createTripExpense({
      tripId: input.tripId,
      userId: input.userId,
      body: input.dto,
    });
    return expense ? { ok: true, value: expense } : forbidden("You cannot add this expense to the trip");
  }

  async reviewChangeRequest(input: {
    tripId: string;
    requestId: string;
    userId: string;
    dto: ReviewTripChangeRequestDto;
  }): Promise<ServiceResult<TripChangeRequestSummary>> {
    const changeRequest = await reviewTripChangeRequest({
      tripId: input.tripId,
      requestId: input.requestId,
      userId: input.userId,
      status: input.dto.status,
    });
    return changeRequest
      ? { ok: true, value: changeRequest }
      : forbidden("You cannot review this change request");
  }
}

export const tripService = new TripService();
