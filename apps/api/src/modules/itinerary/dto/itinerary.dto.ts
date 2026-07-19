import { z } from "zod";
import type { TripStyle } from "@travel/types";

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const routeId = z.string().trim().min(1).max(180);

export const itineraryIdParamsDto = z.object({
  id: routeId,
});

export const itineraryJobParamsDto = z.object({
  jobId: routeId,
});

export const itineraryShareTokenParamsDto = z.object({
  shareToken: z.string().trim().min(8).max(180),
});

export const generateItineraryDto = z.object({
  cities: z.array(z.string().trim().min(1).max(120)).min(1).max(10),
  start_date: dateOnly.optional(),
  end_date: dateOnly.optional(),
  num_days: z.coerce.number().int().min(1).max(30).optional(),
  budget: z.coerce.number().positive().optional(),
  currency: z.string().trim().length(3).toUpperCase().default("USD"),
  trip_style: z.enum([
    "adventure",
    "relax",
    "culture",
    "food",
    "mixed",
    "budget",
    "mid_range",
    "luxury",
    "family",
    "romantic",
    "cultural",
  ]).default("mixed"),
  locale: z.string().trim().min(2).max(12).default("en"),
  num_travelers: z.coerce.number().int().min(1).max(20).default(2),
  city_names: z.array(z.string().trim().min(1).max(120)).max(10).optional(),
  prompt_text: z.string().trim().min(1).max(4000).optional(),
}).refine(
  (value) => value.start_date || value.num_days,
  { message: "Either start_date+end_date or num_days is required" }
);

export const shareItineraryDto = z.object({
  is_public: z.boolean().default(true),
});

export type ItineraryIdParamsDto = z.infer<typeof itineraryIdParamsDto>;
export type ItineraryJobParamsDto = z.infer<typeof itineraryJobParamsDto>;
export type ItineraryShareTokenParamsDto = z.infer<typeof itineraryShareTokenParamsDto>;
export type GenerateItineraryDto = z.infer<typeof generateItineraryDto>;
export type ShareItineraryDto = z.infer<typeof shareItineraryDto>;

export function normalizeTripStyle(style: GenerateItineraryDto["trip_style"]): TripStyle {
  switch (style) {
    case "budget":
    case "mid_range":
    case "luxury":
      return "mixed";
    case "family":
      return "relax";
    case "romantic":
      return "food";
    case "cultural":
      return "culture";
    default:
      return style;
  }
}
