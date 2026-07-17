import { z } from "zod";

const uuid = z.string().uuid();
const cleanText = z.string().trim();
const optionalText = cleanText.transform((value) => value || undefined).optional();
const currency = cleanText.length(3).toUpperCase().default("VND");

export const tripIdParamsDto = z.object({
  id: uuid,
});

export const activityStatusParamsDto = z.object({
  id: uuid,
  activityId: uuid,
});

export const checklistStatusParamsDto = z.object({
  id: uuid,
  itemId: uuid,
});

export const changeRequestReviewParamsDto = z.object({
  id: uuid,
  requestId: uuid,
});

export const activityStatusDto = z.object({
  status: z.enum(["planned", "booked", "visited", "skipped"]),
});

export const checklistStatusDto = z.object({
  status: z.enum(["todo", "in_progress", "done", "blocked"]),
});

export const createTripActivityDto = z.object({
  title: cleanText.min(2).max(160),
  notes: optionalText,
  trip_day_id: uuid.nullable().optional(),
  place_id: uuid.nullable().optional(),
  place_name: optionalText,
  address: optionalText,
  price: z.coerce.number().nonnegative().optional(),
  start_time: z.string().datetime().nullable().optional(),
  end_time: z.string().datetime().nullable().optional(),
});

export const createPlaceSubmissionDto = z.object({
  raw_name: cleanText.min(2).max(180),
  raw_type: optionalText,
  raw_address: optionalText,
  raw_notes: optionalText,
  raw_price: z.coerce.number().nonnegative().optional(),
  activity_id: uuid.nullable().optional(),
});

export const createTripExpenseDto = z.object({
  title: cleanText.min(2).max(180),
  amount: z.coerce.number().positive(),
  currency,
  expense_type: z.enum(["accommodation", "food", "activity", "transport", "shopping", "other"]).default("other"),
  activity_id: uuid.nullable().optional(),
  place_id: uuid.nullable().optional(),
  split_user_ids: z.array(uuid).min(1).max(50).optional(),
});

export const reviewTripChangeRequestDto = z.object({
  status: z.enum(["approved", "rejected"]),
});

export type TripIdParamsDto = z.infer<typeof tripIdParamsDto>;
export type ActivityStatusParamsDto = z.infer<typeof activityStatusParamsDto>;
export type ChecklistStatusParamsDto = z.infer<typeof checklistStatusParamsDto>;
export type ChangeRequestReviewParamsDto = z.infer<typeof changeRequestReviewParamsDto>;
export type ActivityStatusDto = z.infer<typeof activityStatusDto>;
export type ChecklistStatusDto = z.infer<typeof checklistStatusDto>;
export type CreateTripActivityDto = z.infer<typeof createTripActivityDto>;
export type CreatePlaceSubmissionDto = z.infer<typeof createPlaceSubmissionDto>;
export type CreateTripExpenseDto = z.infer<typeof createTripExpenseDto>;
export type ReviewTripChangeRequestDto = z.infer<typeof reviewTripChangeRequestDto>;
