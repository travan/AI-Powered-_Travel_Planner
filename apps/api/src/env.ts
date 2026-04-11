import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(3001),

  // AI
  AI_PROVIDER: z.enum(["openai", "gemini", "claude"]).default("openai"),
  OPENAI_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),

  // Supabase
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_KEY: z.string(),

  // MongoDB
  MONGODB_URI: z.string(),
  MONGODB_DB_NAME: z.string().default("travel_planner"),

  // Redis
  REDIS_URL: z.string(),

  // External
  GOOGLE_PLACES_API_KEY: z.string().optional(),
  BOOKING_AFFILIATE_ID: z.string().default(""),

  // Auth
  JWT_SECRET: z.string().min(32),

  // Rate limiting
  RATE_LIMIT_MAX: z.coerce.number().default(60),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60_000),
  FREE_DAILY_GENERATE_LIMIT: z.coerce.number().default(3),

  // App
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
