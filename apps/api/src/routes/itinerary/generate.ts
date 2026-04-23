import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ItineraryInput, TripStyle } from "@travel/types";
import { itineraryQueue } from "../../lib/queue.js";
import { buildCacheKey } from "../../lib/cache-key.js";
import { cacheDel, cacheGet } from "../../db/redis.js";
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

type GenerateInput = z.infer<typeof generateSchema>;

function normalizeTripStyle(style: GenerateInput["trip_style"]): TripStyle {
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

export async function generateRoutes(fastify: FastifyInstance) {
  fastify.post("/itinerary/generate", {
    schema: { body: { type: "object" } },
  }, async (request, reply) => {
    const authorizationHeader = request.headers.authorization;
    if (!authorizationHeader) {
      return reply.status(401).send({
        statusCode: 401,
        error: "Unauthorized",
        message: "Authentication is required to generate itineraries",
      });
    }

    const parsed = generateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: parsed.error.flatten().fieldErrors,
      });
    }

    const rawInput = parsed.data;
    const input: ItineraryInput = {
      cities: rawInput.cities,
      start_date: rawInput.start_date,
      end_date: rawInput.end_date,
      num_days: rawInput.num_days,
      budget: rawInput.budget,
      currency: rawInput.currency,
      trip_style: normalizeTripStyle(rawInput.trip_style),
      locale: rawInput.locale,
      num_travelers: rawInput.num_travelers,
    };
    const cacheKey = buildCacheKey(input);

    // 1. Check Redis cache first
    const cached = await cacheGet(`cache:itinerary:${cacheKey}`);
    if (cached) {
      if (isCachedItineraryRecord(cached)) {
        return reply.send({
          status: "cached",
          itinerary_id: cached.itinerary_id,
          result: cached.itinerary,
        });
      }

      // Discard stale cache entries that do not include an itinerary id.
      await cacheDel(`cache:itinerary:${cacheKey}`);
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
    const userId = resolveUserIdFromAuthorizationHeader(
      request.server.jwt,
      authorizationHeader
    );

    if (!userId) {
      return reply.status(401).send({
        statusCode: 401,
        error: "Unauthorized",
        message: "Invalid authentication token",
      });
    }

    savePromptHistory({
      userId,
      cacheKey,
      cities: input.cities,
      cityNames: rawInput.city_names ?? input.cities,
      input: input as unknown as Record<string, unknown>,
    }).catch(() => {/* non-critical, swallow errors */});

    return reply.status(202).send({
      job_id: job.id,
      status: "queued",
      stream_url: `/api/itinerary/stream/${job.id}`,
      estimated_wait_seconds: 10,
    });
  });
}

type JwtDecoderInstance = {
  decode: (token: string) => unknown;
};

function resolveUserIdFromAuthorizationHeader(
  jwt: JwtDecoderInstance,
  header: string
): string | null {
  const token = header.replace("Bearer ", "").trim();
  if (!token) return null;

  if (token.startsWith("mock-access-")) {
    const mockUserId = token.slice("mock-access-".length);
    return mockUserId || null;
  }

  if (token.startsWith("mock-mobile-access-")) {
    const mockMobileUserId = token.slice("mock-mobile-access-".length);
    return mockMobileUserId || null;
  }

  try {
    const payload = jwt.decode(token) as { sub?: string } | null;
    return payload?.sub ?? null;
  } catch {
    return null;
  }
}

function isCachedItineraryRecord(
  value: unknown
): value is { itinerary_id: string; itinerary: unknown } {
  if (!value || typeof value !== "object") return false;

  const record = value as Record<string, unknown>;
  return typeof record.itinerary_id === "string" && "itinerary" in record;
}
