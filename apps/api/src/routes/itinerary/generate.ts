import type { FastifyInstance } from "fastify";
import type { ItineraryInput } from "@travel/types";
import { itineraryQueue } from "../../lib/queue.js";
import { buildCacheKey } from "../../lib/cache-key.js";
import { cacheDel, cacheGet } from "../../db/redis.js";
import { savePromptHistory } from "../users.js";
import { generateItineraryDto, normalizeTripStyle } from "../../modules/itinerary/dto/itinerary.dto.js";
import { parseDto } from "../../shared/http/validation.js";

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

    const rawInput = parseDto(generateItineraryDto, request.body, reply);
    if (!rawInput) return;

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
      userId,
    });

    // Update jobId after creation
    await job.updateData({ jobId: job.id!, input, cacheKey, userId });

    // 3. Fire-and-forget: save to user prompt history (does not block response)
    savePromptHistory({
      userId,
      cacheKey,
      cities: input.cities,
      cityNames: rawInput.city_names ?? input.cities,
      input: input as unknown as Record<string, unknown>,
      rawPromptText: rawInput.prompt_text,
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
  verify: (token: string) => unknown;
};

const MOCK_TOKENS_ENABLED = process.env.TEST_ENABLE_MOCK_TOKENS === "true";

function resolveUserIdFromAuthorizationHeader(
  jwt: JwtDecoderInstance,
  header: string
): string | null {
  const token = header.replace("Bearer ", "").trim();
  if (!token) return null;

  if (MOCK_TOKENS_ENABLED) {
    if (token.startsWith("mock-access-")) {
      const mockUserId = token.slice("mock-access-".length);
      return mockUserId || null;
    }

    if (token.startsWith("mock-mobile-access-")) {
      const mockMobileUserId = token.slice("mock-mobile-access-".length);
      return mockMobileUserId || null;
    }
  }

  try {
    const payload = jwt.verify(token) as { sub?: string } | null;
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
