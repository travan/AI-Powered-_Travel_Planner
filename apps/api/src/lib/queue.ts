import { Queue, Worker, type Job } from "bullmq";
import { redis } from "../db/redis.js";
import type { ItineraryInput } from "@travel/types";

export const QUEUE_NAME = "itinerary";

export interface ItineraryJobData {
  jobId: string;
  input: ItineraryInput;
  cacheKey: string;
  userId?: string;
}

// Shared queue instance (used by API to enqueue)
export const itineraryQueue = new Queue<ItineraryJobData>(QUEUE_NAME, {
  connection: redis,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: { age: 3600 }, // keep completed jobs 1h
    removeOnFail: { age: 86400 },    // keep failed jobs 24h
  },
});

export function createWorker(
  processor: (job: Job<ItineraryJobData>) => Promise<void>
): Worker<ItineraryJobData> {
  return new Worker<ItineraryJobData>(QUEUE_NAME, processor, {
    connection: redis,
    concurrency: 10,
  });
}
