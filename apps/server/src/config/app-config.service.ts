import { Injectable } from "@nestjs/common";

function csv(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
  return values.find((value) => value && value.trim().length > 0)?.trim();
}

type RawEnv = NodeJS.ProcessEnv;

const DEFAULT_CORS_ORIGINS =
  "http://localhost:3000,http://127.0.0.1:3000,http://localhost:8081,http://127.0.0.1:8081";

type ParsedEnv = {
  NODE_ENV: "development" | "production" | "test";
  PORT: number;
  SERVE_WEB: boolean;
  WEB_APP_DIR: string;
  NEXT_PUBLIC_APP_URL: string;
  CORS_ORIGINS: string;
  ALLOW_QUICK_TUNNEL_ORIGINS: boolean;
  RATE_LIMIT_MAX: number;
  RATE_LIMIT_WINDOW_MS: number;
  TRUST_PROXY_HOPS: number;
  DB_POOL_MAX: number;
  DB_CONNECT_TIMEOUT_MS: number;
  DB_QUERY_TIMEOUT_MS: number;
  DB_IDLE_TIMEOUT_MS: number;
  JWT_SECRET: string;
  TEST_ENABLE_MOCK_TOKENS: boolean;
  DATABASE_PROVIDER: "postgres" | "supabase";
  POSTGRES_URL?: string;
  DATABASE_URL?: string;
  SUPABASE_DATABASE_URL?: string;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_KEY?: string;
  MONGODB_URI: string;
  MONGODB_DB_NAME: string;
};

function resolvePostgresUrl(value: {
  DATABASE_PROVIDER?: "postgres" | "supabase" | string;
  POSTGRES_URL?: string;
  DATABASE_URL?: string;
  SUPABASE_DATABASE_URL?: string;
}) {
  if (value.DATABASE_PROVIDER === "supabase") {
    return firstNonEmpty(value.SUPABASE_DATABASE_URL, value.DATABASE_URL, value.POSTGRES_URL);
  }

  return firstNonEmpty(value.POSTGRES_URL, value.DATABASE_URL);
}

@Injectable()
export class AppConfigService {
  private readonly env: ParsedEnv;

  constructor() {
    this.env = parseEnv(process.env);
  }

  get nodeEnv() {
    return this.env.NODE_ENV;
  }

  get port() {
    return this.env.PORT;
  }

  get serveWeb() {
    return this.env.SERVE_WEB;
  }

  get webAppDir() {
    return this.env.WEB_APP_DIR;
  }

  get allowedOrigins() {
    return new Set([this.env.NEXT_PUBLIC_APP_URL, ...csv(this.env.CORS_ORIGINS)]);
  }

  get allowQuickTunnelOrigins() {
    return this.env.NODE_ENV === "development" && this.env.ALLOW_QUICK_TUNNEL_ORIGINS;
  }

  get rateLimit() {
    return {
      max: this.env.RATE_LIMIT_MAX,
      windowMs: this.env.RATE_LIMIT_WINDOW_MS,
    };
  }

  get trustProxyHops() {
    return this.env.TRUST_PROXY_HOPS;
  }

  get databasePool() {
    return {
      max: this.env.DB_POOL_MAX,
      connectionTimeoutMillis: this.env.DB_CONNECT_TIMEOUT_MS,
      query_timeout: this.env.DB_QUERY_TIMEOUT_MS,
      idleTimeoutMillis: this.env.DB_IDLE_TIMEOUT_MS,
    };
  }

  get jwtSecret() {
    return this.env.JWT_SECRET;
  }

  get mockTokensEnabled() {
    return this.env.TEST_ENABLE_MOCK_TOKENS;
  }

  get databaseProvider() {
    return this.env.DATABASE_PROVIDER;
  }

  get postgresUrl() {
    return resolvePostgresUrl(this.env)!;
  }

  get supabaseApiConfig() {
    if (!this.env.SUPABASE_URL || !this.env.SUPABASE_SERVICE_KEY) return null;
    return {
      url: this.env.SUPABASE_URL,
      serviceKey: this.env.SUPABASE_SERVICE_KEY,
    };
  }

  get passwordRecovery() {
    const provider = parseEnum(process.env.AUTH_PROVIDER, ["local", "supabase"], "local", "AUTH_PROVIDER");
    const appUrl = new URL(this.env.NEXT_PUBLIC_APP_URL);
    if (!["http:", "https:"].includes(appUrl.protocol) || (this.nodeEnv === "production" && appUrl.protocol !== "https:")) {
      throw new Error("Password recovery requires a valid HTTP(S) app URL (HTTPS in production)");
    }
    return {
      provider,
      resetUrl: new URL("/reset-password", appUrl).toString(),
      ...this.smtp,
    };
  }

  get smtp() {
    return {
      smtpHost: process.env.SMTP_HOST?.trim(),
      smtpPort: parsePositiveInt(process.env.SMTP_PORT, 587, "SMTP_PORT"),
      smtpSecure: parseBoolean(process.env.SMTP_SECURE, false),
      smtpUser: process.env.SMTP_USER,
      smtpPassword: process.env.SMTP_PASSWORD,
      from: process.env.SMTP_FROM?.trim(),
    };
  }

  get mongo() {
    return {
      uri: this.env.MONGODB_URI,
      dbName: this.env.MONGODB_DB_NAME,
    };
  }

  get documentStore() {
    return parseEnum(process.env.DOCUMENT_STORE, ["mongo", "postgres"], "mongo", "DOCUMENT_STORE");
  }
}

function parseEnv(raw: RawEnv): ParsedEnv {
  const env: ParsedEnv = {
    NODE_ENV: parseEnum(raw.NODE_ENV, ["development", "production", "test"], "development", "NODE_ENV"),
    PORT: parsePositiveInt(raw.PORT, 3001, "PORT"),
    SERVE_WEB: parseBoolean(raw.SERVE_WEB, false),
    WEB_APP_DIR: raw.WEB_APP_DIR?.trim() || "../web",
    NEXT_PUBLIC_APP_URL: parseUrl(raw.NEXT_PUBLIC_APP_URL, "http://localhost:3000", "NEXT_PUBLIC_APP_URL"),
    CORS_ORIGINS: raw.CORS_ORIGINS?.trim() || DEFAULT_CORS_ORIGINS,
    ALLOW_QUICK_TUNNEL_ORIGINS: parseBoolean(raw.ALLOW_QUICK_TUNNEL_ORIGINS, false),
    RATE_LIMIT_MAX: parsePositiveInt(raw.RATE_LIMIT_MAX, 60, "RATE_LIMIT_MAX"),
    RATE_LIMIT_WINDOW_MS: parsePositiveInt(raw.RATE_LIMIT_WINDOW_MS, 60_000, "RATE_LIMIT_WINDOW_MS"),
    TRUST_PROXY_HOPS: parseNonNegativeInt(raw.TRUST_PROXY_HOPS, 0, "TRUST_PROXY_HOPS"),
    DB_POOL_MAX: parsePositiveInt(raw.DB_POOL_MAX, 10, "DB_POOL_MAX"),
    DB_CONNECT_TIMEOUT_MS: parsePositiveInt(raw.DB_CONNECT_TIMEOUT_MS, 5_000, "DB_CONNECT_TIMEOUT_MS"),
    DB_QUERY_TIMEOUT_MS: parsePositiveInt(raw.DB_QUERY_TIMEOUT_MS, 15_000, "DB_QUERY_TIMEOUT_MS"),
    DB_IDLE_TIMEOUT_MS: parsePositiveInt(raw.DB_IDLE_TIMEOUT_MS, 30_000, "DB_IDLE_TIMEOUT_MS"),
    JWT_SECRET: requiredMin(raw.JWT_SECRET, 32, "JWT_SECRET"),
    TEST_ENABLE_MOCK_TOKENS: parseBoolean(raw.TEST_ENABLE_MOCK_TOKENS, false),
    DATABASE_PROVIDER: parseEnum(raw.DATABASE_PROVIDER, ["postgres", "supabase"], "postgres", "DATABASE_PROVIDER"),
    POSTGRES_URL: optionalTrim(raw.POSTGRES_URL),
    DATABASE_URL: optionalTrim(raw.DATABASE_URL),
    SUPABASE_DATABASE_URL: optionalTrim(raw.SUPABASE_DATABASE_URL),
    SUPABASE_URL: optionalUrl(raw.SUPABASE_URL, "SUPABASE_URL"),
    SUPABASE_SERVICE_KEY: optionalTrim(raw.SUPABASE_SERVICE_KEY),
    MONGODB_URI: raw.DOCUMENT_STORE === "postgres" ? "" : requiredMin(raw.MONGODB_URI, 1, "MONGODB_URI"),
    MONGODB_DB_NAME: raw.MONGODB_DB_NAME?.trim() || "travel_planner",
  };

  if (!resolvePostgresUrl(env)) {
    const key = env.DATABASE_PROVIDER === "supabase" ? "SUPABASE_DATABASE_URL" : "POSTGRES_URL";
    throw new Error(
      `Invalid server environment: ${key} or DATABASE_URL is required when DATABASE_PROVIDER=${env.DATABASE_PROVIDER}`
    );
  }

  if (env.NODE_ENV === "production" && isKnownDevelopmentSecret(env.JWT_SECRET)) {
    throw new Error("Invalid server environment: JWT_SECRET must be replaced with a unique production secret.");
  }

  return env;
}

function optionalTrim(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function requiredMin(value: string | undefined, min: number, key: string): string {
  const trimmed = optionalTrim(value);
  if (!trimmed || trimmed.length < min) {
    throw new Error(`Invalid server environment: ${key} must contain at least ${min} character(s)`);
  }
  return trimmed;
}

function parsePositiveInt(value: string | undefined, fallback: number, key: string): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid server environment: ${key} must be a positive integer`);
  }
  return parsed;
}

function parseNonNegativeInt(value: string | undefined, fallback: number, key: string): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`Invalid server environment: ${key} must be a non-negative integer`);
  }
  return parsed;
}

function isKnownDevelopmentSecret(value: string) {
  return /change.?this|change.?me|development|example|placeholder|local.?docker/i.test(value);
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (!value) return fallback;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function parseEnum<T extends string>(value: string | undefined, allowed: readonly T[], fallback: T, key: string): T {
  if (!value) return fallback;
  if (allowed.includes(value as T)) return value as T;
  throw new Error(`Invalid server environment: ${key} must be one of ${allowed.join(", ")}`);
}

function parseUrl(value: string | undefined, fallback: string, key: string): string {
  return optionalUrl(value ?? fallback, key)!;
}

function optionalUrl(value: string | undefined, key: string): string | undefined {
  const trimmed = optionalTrim(value);
  if (!trimmed) return undefined;
  try {
    new URL(trimmed);
    return trimmed;
  } catch {
    throw new Error(`Invalid server environment: ${key} must be a valid URL`);
  }
}
