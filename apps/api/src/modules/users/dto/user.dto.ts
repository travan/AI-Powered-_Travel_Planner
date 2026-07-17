import { z } from "zod";

export const promptHistoryQueryDto = z.object({
  limit: z.coerce.number().int().min(1).max(20).default(5),
});

export type PromptHistoryQueryDto = z.infer<typeof promptHistoryQueryDto>;
