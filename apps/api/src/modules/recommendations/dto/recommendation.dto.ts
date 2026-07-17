import { z } from "zod";

const optionalText = z.string().trim().transform((value) => value || undefined).optional();
const transportModeDto = z.enum([
  "flight",
  "train",
  "bus",
  "car",
  "self_drive",
  "taxi",
  "motorbike",
  "bicycle",
  "boat",
  "ferry",
  "cruise",
  "walk",
  "other",
]);

export const placeRecommendationQueryDto = z.object({
  city_slug: optionalText,
  type: z
    .enum(["hotel", "homestay", "cafe", "restaurant", "attraction", "activity", "transport_hub", "shop", "other"])
    .optional(),
  limit: z.coerce.number().int().min(1).max(30).default(10),
});

export const transportRecommendationQueryDto = z.object({
  mode: transportModeDto.optional(),
  from: optionalText,
  to: optionalText,
  month: z.coerce.number().int().min(1).max(12).optional(),
  limit: z.coerce.number().int().min(1).max(30).default(10),
});

export type PlaceRecommendationQueryDto = z.infer<typeof placeRecommendationQueryDto>;
export type TransportRecommendationQueryDto = z.infer<typeof transportRecommendationQueryDto>;
