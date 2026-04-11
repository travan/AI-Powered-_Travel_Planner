import Redis from "ioredis";
import { env } from "../env.js";

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  lazyConnect: true,
  enableReadyCheck: true,
});

redis.on("error", (err) => {
  console.error("Redis error:", err);
});

redis.on("connect", () => {
  console.info("Redis connected");
});

// ─── Cache helpers ────────────────────────────────────────────────────────────

export async function cacheGet<T>(key: string): Promise<T | null> {
  const raw = await redis.get(key);
  if (!raw) return null;
  return JSON.parse(raw) as T;
}

export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  await redis.setex(key, ttlSeconds, JSON.stringify(value));
}

export async function cacheDel(key: string): Promise<void> {
  await redis.del(key);
}

// ─── Cache TTLs (seconds) ─────────────────────────────────────────────────────

export const TTL = {
  ITINERARY_RESULT: 3_600,       // 1 hour — same params = same result
  CITY_METADATA: 2_592_000,      // 30 days
  PLACES: 604_800,               // 7 days
  TRANSPORT: 86_400,             // 24 hours (prices change daily)
  HOTELS: 21_600,                // 6 hours (dynamic pricing)
  TICKETS: 86_400,               // 24 hours
} as const;
