import { z } from "zod";

export const searchDraftParamsDto = z.object({
  id: z.string().trim().uuid(),
});

export const createSearchDraftDto = z.object({
  guest_key: z.string().trim().min(16).max(128),
  email_hint: z.string().trim().toLowerCase().email().optional(),
  prompt_text: z.string().trim().min(1).max(4000).optional(),
  search_payload: z.record(z.unknown()),
});

export const claimSearchDraftDto = z.object({
  guest_key: z.string().trim().min(16).max(128),
});

export type SearchDraftParamsDto = z.infer<typeof searchDraftParamsDto>;
export type CreateSearchDraftDto = z.infer<typeof createSearchDraftDto>;
export type ClaimSearchDraftDto = z.infer<typeof claimSearchDraftDto>;
