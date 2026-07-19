import { z } from "zod";

function envBoolean(defaultValue: boolean) {
  return z.preprocess((value) => {
    if (value === undefined || value === "") return defaultValue;
    if (typeof value !== "string") return value;

    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "off"].includes(normalized)) return false;
    return value;
  }, z.boolean());
}

function splitCsv(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function unique(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

const postgresUrls = unique([
  process.env.POSTGRES_URL,
  process.env.DATABASE_URL,
  ...splitCsv(process.env.POSTGRES_URLS),
  ...splitCsv(process.env.DATABASE_URLS),
]);
const mongoUris = unique([
  process.env.MONGODB_URI,
  ...splitCsv(process.env.MONGODB_URIS),
]);

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(3001),
  SERVE_WEB: envBoolean(false),
  WEB_APP_DIR: z.string().default("../web"),

  // AI
  AI_PROVIDER: z.enum(["openai", "gemini", "claude"]).default("openai"),
  OPENAI_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),

  // Database
  DATABASE_PROVIDER: z.enum(["postgres", "supabase"]).default("postgres"),
  POSTGRES_URL: z.string().optional(),
  POSTGRES_URLS: z.string().optional(),
  DB_CONNECT_TIMEOUT_MS: z.coerce.number().int().positive().default(5_000),
  DB_QUERY_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_KEY: z.string().optional(),

  // MongoDB
  MONGODB_URI: z.string().min(1),
  MONGODB_URIS: z.string().optional(),
  MONGODB_DB_NAME: z.string().default("travel_planner"),
  MONGODB_CONNECT_TIMEOUT_MS: z.coerce.number().int().positive().default(5_000),

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
  CORS_ORIGINS: z.string().default("http://localhost:3000,http://localhost:8081"),
}).superRefine((value, ctx) => {
  if (value.DATABASE_PROVIDER === "postgres" && !value.POSTGRES_URL) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["POSTGRES_URL"],
      message: "POSTGRES_URL is required when DATABASE_PROVIDER=postgres",
    });
  }

  if (value.DATABASE_PROVIDER !== "supabase") return;

  if (!value.SUPABASE_URL) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["SUPABASE_URL"],
      message: "SUPABASE_URL is required when DATABASE_PROVIDER=supabase",
    });
  }

  if (!value.SUPABASE_SERVICE_KEY) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["SUPABASE_SERVICE_KEY"],
      message: "SUPABASE_SERVICE_KEY is required when DATABASE_PROVIDER=supabase",
    });
  }
});

const parsed = envSchema.safeParse({
  ...process.env,
  POSTGRES_URL: postgresUrls[0],
  POSTGRES_URLS: postgresUrls.join(","),
  MONGODB_URI: mongoUris[0],
  MONGODB_URIS: mongoUris.join(","),
});

if (!parsed.success) {
  console.error("Invalid environment variables:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
