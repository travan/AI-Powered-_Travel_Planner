import { Body, Controller, Get, HttpCode, Param, Patch, Post, Req, Res, UseGuards } from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { ItineraryInput, SSEEventType } from "@travel/types";
import { buildCacheKey } from "../../../../lib/cache-key.js";
import { cacheDel, cacheGet, redis } from "../../../../db/redis.js";
import { itineraryQueue } from "../../../../lib/queue.js";
import { closeSSE, initSSE, sendHeartbeat, sendSSEEvent } from "../../../../lib/sse.js";
import { savePromptHistoryToMongo } from "../../../../db/prompt-history-store.js";
import { itineraryService } from "../../application/itinerary.service.js";
import {
  generateItineraryDto,
  itineraryIdParamsDto,
  itineraryJobParamsDto,
  itineraryShareTokenParamsDto,
  normalizeTripStyle,
  shareItineraryDto,
  type GenerateItineraryDto,
  type ShareItineraryDto,
} from "../../dto/itinerary.dto.js";
import { CurrentUser, type CurrentUserValue } from "../../../../shared/nest/current-user.decorator.js";
import { JwtAuthGuard } from "../../../../shared/nest/jwt-auth.guard.js";
import { throwServiceError } from "../../../../shared/nest/http-errors.js";
import { ZodValidationPipe } from "../../../../shared/nest/zod-validation.pipe.js";

@Controller("api/itinerary")
export class ItineraryController {
  @Post("generate")
  @HttpCode(202)
  @UseGuards(JwtAuthGuard)
  async generate(
    @Body(new ZodValidationPipe(generateItineraryDto)) rawInput: GenerateItineraryDto,
    @CurrentUser() user: CurrentUserValue,
    @Res({ passthrough: true }) reply: FastifyReply
  ) {
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

    const cached = await cacheGet(`cache:itinerary:${cacheKey}`);
    if (cached) {
      if (isCachedItineraryRecord(cached)) {
        reply.status(200);
        return {
          status: "cached",
          itinerary_id: cached.itinerary_id,
          result: cached.itinerary,
        };
      }

      await cacheDel(`cache:itinerary:${cacheKey}`);
    }

    const job = await itineraryQueue.add("generate", {
      jobId: "",
      input,
      cacheKey,
      userId: user.sub,
    });

    await job.updateData({ jobId: job.id!, input, cacheKey, userId: user.sub });

    savePromptHistoryToMongo({
      userId: user.sub,
      cacheKey,
      cities: input.cities,
      cityNames: rawInput.city_names ?? input.cities,
      input: input as unknown as Record<string, unknown>,
      rawPromptText: rawInput.prompt_text,
    }).catch(() => {
      // Prompt history is useful for cost optimization, but should never block generation.
    });

    reply.status(202);
    return {
      job_id: job.id,
      status: "queued",
      stream_url: `/api/itinerary/stream/${job.id}`,
      estimated_wait_seconds: 10,
    };
  }

  @Get("stream/:jobId")
  async stream(
    @Param(new ZodValidationPipe(itineraryJobParamsDto)) params: { jobId: string },
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply
  ) {
    const { jobId } = params;
    initSSE(reply);

    const job = await itineraryQueue.getJob(jobId);
    if (!job) {
      sendSSEEvent(reply, "error", { message: "Job not found", code: "JOB_NOT_FOUND" });
      closeSSE(reply);
      return;
    }

    const state = await job.getState();
    sendSSEEvent(reply, "queued", { status: state, job_id: jobId });

    if (state === "completed") {
      const resultRaw = await redis.get(`job:result:${jobId}`);
      if (resultRaw) {
        sendSSEEvent(reply, "complete", JSON.parse(resultRaw));
        closeSSE(reply);
        return;
      }

      sendSSEEvent(reply, "processing", { step: "awaiting_detail_phase", job_id: jobId });
    }

    if (state === "failed") {
      sendSSEEvent(reply, "error", {
        message: "Job failed before stream subscription",
        code: "JOB_FAILED",
        job_id: jobId,
      });
      closeSSE(reply);
      return;
    }

    const channel = `itinerary:progress:${jobId}`;
    const subscriber = redis.duplicate();
    await subscriber.subscribe(channel);

    const heartbeatInterval = setInterval(() => {
      sendHeartbeat(reply);
    }, 15_000);

    const timeout = setTimeout(() => {
      sendSSEEvent(reply, "error", {
        message: "Generation timed out",
        code: "TIMEOUT",
      });
      cleanup();
    }, 180_000);

    subscriber.on("message", (_channel: string, message: string) => {
      const event = JSON.parse(message) as { type: SSEEventType; data: unknown };
      sendSSEEvent(reply, event.type, event.data);

      if (event.type === "complete" || event.type === "error") {
        cleanup();
      }
    });

    request.raw.on("close", cleanup);

    function cleanup() {
      clearInterval(heartbeatInterval);
      clearTimeout(timeout);
      subscriber.unsubscribe(channel).catch(() => undefined);
      subscriber.quit().catch(() => undefined);
      closeSSE(reply);
    }
  }

  @Get("job/:jobId")
  async getByJobId(@Param(new ZodValidationPipe(itineraryJobParamsDto)) params: { jobId: string }) {
    const result = await itineraryService.getByJobId(params.jobId);
    if (!result.ok) throwServiceError(result.error);
    return result.value;
  }

  @Get("shared/:shareToken")
  async getShared(@Param(new ZodValidationPipe(itineraryShareTokenParamsDto)) params: { shareToken: string }) {
    const result = await itineraryService.getShared(params.shareToken);
    if (!result.ok) throwServiceError(result.error);
    return result.value;
  }

  @Get(":id")
  async getById(@Param(new ZodValidationPipe(itineraryIdParamsDto)) params: { id: string }) {
    const result = await itineraryService.getById(params.id);
    if (!result.ok) throwServiceError(result.error);
    return result.value;
  }

  @Post(":id/save")
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  async save(
    @Param(new ZodValidationPipe(itineraryIdParamsDto)) params: { id: string },
    @CurrentUser() user: CurrentUserValue
  ) {
    const result = await itineraryService.save({ itineraryId: params.id, userId: user.sub });
    if (!result.ok) throwServiceError(result.error);
    return result.value;
  }

  @Patch(":id/share")
  @UseGuards(JwtAuthGuard)
  async share(
    @Param(new ZodValidationPipe(itineraryIdParamsDto)) params: { id: string },
    @Body(new ZodValidationPipe(shareItineraryDto)) dto: ShareItineraryDto,
    @CurrentUser() user: CurrentUserValue
  ) {
    const result = await itineraryService.share({ itineraryId: params.id, userId: user.sub, dto });
    if (!result.ok) throwServiceError(result.error);
    return result.value;
  }
}

function isCachedItineraryRecord(
  value: unknown
): value is { itinerary_id: string; itinerary: unknown } {
  if (!value || typeof value !== "object") return false;

  const record = value as Record<string, unknown>;
  return typeof record.itinerary_id === "string" && "itinerary" in record;
}
