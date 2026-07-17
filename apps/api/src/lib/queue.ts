import { Queue, Worker, type Job } from "bullmq";
import { redis } from "../db/redis.js";
import type { ItineraryInput } from "@travel/types";

export const OVERVIEW_QUEUE_NAME = "itinerary_overview";
export const DETAIL_QUEUE_NAME = "itinerary_detail";
export const PROMPT_ANALYSIS_QUEUE_NAME = "prompt_analysis";

export interface ItineraryJobData {
  jobId: string;
  input: ItineraryInput;
  cacheKey: string;
  userId?: string;
}

export interface PromptAnalysisJobData {
  promptEventId: string;
}

// Shared queue instance (used by API to enqueue)
export const itineraryQueue = new Queue<ItineraryJobData>(OVERVIEW_QUEUE_NAME, {
  connection: redis,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: { age: 3600 }, // keep completed jobs 1h
    removeOnFail: { age: 86400 },    // keep failed jobs 24h
  },
});

export const itineraryDetailQueue = new Queue<ItineraryJobData>(DETAIL_QUEUE_NAME, {
  connection: redis,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: { age: 3600 }, // keep completed jobs 1h
    removeOnFail: { age: 86400 },    // keep failed jobs 24h
  },
});

export const promptAnalysisQueue = new Queue<PromptAnalysisJobData>(PROMPT_ANALYSIS_QUEUE_NAME, {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 1000 },
    removeOnComplete: { age: 3600 },
    removeOnFail: { age: 86400 },
  },
});

export function createWorker<TData>(
  queueName: string,
  processor: (job: Job<TData>) => Promise<unknown>
): Worker<TData> {
  return new Worker<TData>(queueName, processor, {
    connection: redis,
    concurrency: 10,
  });
}
