import { z } from "zod";

export const citySearchQueryDto = z.object({
  q: z.string().trim().min(0).max(120).default(""),
});

export const citySlugParamsDto = z.object({
  slug: z.string().trim().min(1).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
});

export type CitySearchQueryDto = z.infer<typeof citySearchQueryDto>;
export type CitySlugParamsDto = z.infer<typeof citySlugParamsDto>;
