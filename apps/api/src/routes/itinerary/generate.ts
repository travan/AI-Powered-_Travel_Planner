import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { itineraryQueue } from "../../lib/queue.js";
import { buildCacheKey } from "../../lib/cache-key.js";
import { cacheGet } from "../../db/redis.js";
import { savePromptHistory } from "../users.js";

const generateSchema = z.object({
  cities: z.array(z.string().min(1)).min(1).max(10),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  num_days: z.number().int().min(1).max(30).optional(),
  budget: z.number().positive().optional(),
  currency: z.string().length(3).default("USD"),
  trip_style: z.enum(["adventure", "relax", "culture", "food", "mixed", "budget", "mid_range", "luxury", "family", "romantic", "cultural"]).default("mixed"),
  locale: z.string().default("en"),
  num_travelers: z.number().int().min(1).max(20).default(2),
  // Optional: human-readable city names for display (e.g. ["Tokyo", "Kyoto"])
  city_names: z.array(z.string()).optional(),
}).refine(
  (d) => d.start_date || d.num_days,
  { message: "Either start_date+end_date or num_days is required" }
);

export async function generateRoutes(fastify: FastifyInstance) {
  fastify.post("/generate", {
    schema: { body: { type: "object" } },
  }, async (request, reply) => {
    const parsed = generateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: parsed.error.flatten().fieldErrors,
      });
    }

    const input = parsed.data;
    const cacheKey = buildCacheKey(input);

    // 1. Check Redis cache first
    const cached = await cacheGet(`cache:itinerary:${cacheKey}`);
    if (cached) {
      return reply.send({ status: "cached", result: cached });
    }

    // 2. Enqueue job
    const job = await itineraryQueue.add("generate", {
      jobId: "", // will be set below
      input,
      cacheKey,
    });

    // Update jobId after creation
    await job.updateData({ jobId: job.id!, input, cacheKey });

    // 3. Fire-and-forget: save to user prompt history (does not block response)
    const userId = request.headers.authorization
      ? (() => {
          try {
            type JwtPayload = { sub: string };
            const payload = request.server.jwt.decode<JwtPayload>(
              request.headers.authorization!.replace("Bearer ", "")
            );
            return payload?.sub ?? null;
          } catch {
            return null;
          }
        })()
      : null;

    savePromptHistory({
      userId,
      cacheKey,
      cities: input.cities,
      cityNames: input.city_names ?? input.cities,
      input: input as Record<string, unknown>,
    }).catch(() => {/* non-critical, swallow errors */});

    return reply.status(202).send({
      job_id: job.id,
      status: "queued",
      stream_url: `/api/itinerary/stream/${job.id}`,
      estimated_wait_seconds: 10,
    });
  });
}
