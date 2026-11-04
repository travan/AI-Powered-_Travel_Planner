import { logEvent } from "../../../observability/logger.js";
import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import * as travelTypes from "@travel/types";
import { SQL_CLIENT, type SqlClient } from "../../../database/database.tokens.js";

const MAX_ATTEMPTS = 5;
const POLL_INTERVAL_MS = 1_500;

type CatalogCityReference = {
  slug: string;
  name: string;
};

type CatalogJob = {
  id: string;
  attempts: number;
  payload: unknown;
  result: unknown;
};

type ItineraryActivity = {
  citySlug: string;
  name: string;
  category: string;
  cost: number | null;
  currency: string;
  durationMinutes: number | null;
};

type CatalogPlace = {
  citySlug: string;
  name: string;
  category: "hotel" | "restaurant";
  address: string | null;
};

// tsx exposes this CommonJS workspace package through default; bundlers use named exports.
const { slugifyCityName } = (travelTypes as unknown as { default?: typeof travelTypes }).default ?? travelTypes;

@Injectable()
export class CityCatalogWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CityCatalogWorker.name);
  private timer: ReturnType<typeof setInterval> | undefined;
  private processing = false;

  constructor(@Inject(SQL_CLIENT) private readonly sql: SqlClient) {}

  onModuleInit(): void {
    // Workers run this queue from their scheduled handler instead of a timer.
    if (process.env.RUNTIME_TARGET === "cloudflare") return;
    this.timer = setInterval(() => {
      void this.processNextJob();
    }, POLL_INTERVAL_MS);
    this.timer.unref?.();
    void this.processNextJob();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async processNextJob(): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    let job: CatalogJob | undefined;

    try {
      const claimed = await this.sql.query<CatalogJob>(
        `with candidate as (
           select id
           from city_catalog_ingestion_jobs
           where (status = 'pending' and available_at <= now())
              or (status = 'processing' and locked_until <= now())
           order by created_at asc
           for update skip locked
           limit 1
         )
         update city_catalog_ingestion_jobs as jobs
         set status = 'processing',
             attempts = jobs.attempts + 1,
             locked_until = now() + interval '2 minutes'
         from candidate, itineraries
         where jobs.id = candidate.id
           and itineraries.id = jobs.itinerary_id
         returning jobs.id::text,
                   jobs.attempts,
                   jobs.payload,
                   itineraries.result`,
      );
      job = claimed.rows[0];
      if (!job) return;

      await this.persistCatalog(job);
      await this.sql.query(
        `update city_catalog_ingestion_jobs
         set status = 'completed',
             completed_at = now(),
             locked_until = null,
             last_error = null
         where id = $1`,
        [job.id],
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (job) {
        try {
          await this.sql.query(
            `update city_catalog_ingestion_jobs
             set status = case when attempts >= $2 then 'failed' else 'pending' end,
                 available_at = now() + least(300, power(2, attempts)) * interval '1 second',
                 locked_until = null,
                 last_error = $3
             where id = $1`,
            [job.id, MAX_ATTEMPTS, message.slice(0, 4_000)],
          );
        } catch (updateError) {
          const updateMessage =
            updateError instanceof Error
              ? updateError.stack ?? updateError.message
              : String(updateError);
          this.logger.error(
            `Could not record the failure for city catalog job ${job.id}`,
            updateMessage,
          );
        }
        if (process.env.NODE_ENV === "production") logEvent("catalog.job_failed", "error", { jobId: job.id, code: "CATALOG_JOB_FAILED" });
        else this.logger.error(`City catalog job ${job.id} failed`, message);
      } else {
        const details = error instanceof Error ? error.stack ?? error.message : message;
        this.logger.error("Could not poll the city catalog ingestion queue", details);
      }
    } finally {
      this.processing = false;
    }
  }

  private async persistCatalog(job: CatalogJob): Promise<void> {
    const payload = asRecord(job.payload);
    const cities = parseCityReferences(payload?.["cities"]);
    const itinerary = asRecord(job.result);
    if (!cities.length || !itinerary) {
      throw new Error("The catalog job is missing its city references or itinerary result.");
    }

    const activities = collectActivities(itinerary, cities);
    for (const activity of activities) {
      await this.sql.query(
        `insert into activity_catalog (
           city_slug, title, canonical_name, category, estimated_cost,
           currency, duration_minutes, source, quality_score, is_outdated,
           created_at, updated_at
         )
         select $1, $2, $2, $3, $4, $5, $6, 'ai_generated', 0, false, now(), now()
         where not exists (
           select 1
           from activity_catalog
           where city_slug = $1
             and lower(coalesce(canonical_name, title)) = lower($2)
             and is_outdated = false
         )
         on conflict (city_slug, lower(canonical_name))
           where source = 'ai_generated' and city_slug is not null
         do nothing`,
        [
          activity.citySlug,
          activity.name,
          activity.category,
          activity.cost,
          activity.currency,
          activity.durationMinutes,
        ],
      );
    }

    for (const place of collectPlaces(itinerary, cities)) {
      await this.sql.query(
        `insert into place_catalog (
           name, category, city_slug, address, quality_score, source
         )
         values ($1, $2, $3, $4, 0, 'ai_generated')
         on conflict (name, city_slug) do nothing`,
        [place.name, place.category, place.citySlug, place.address],
      );
    }
  }
}

function collectActivities(
  itinerary: Record<string, unknown>,
  cities: CatalogCityReference[],
): ItineraryActivity[] {
  const days = Array.isArray(itinerary["days"]) ? itinerary["days"] : [];
  const activities: ItineraryActivity[] = [];
  const seen = new Set<string>();

  for (const dayValue of days) {
    const day = asRecord(dayValue);
    const citySlug = resolveCitySlug(getString(day, "city"), cities);
    const dayActivities = day && Array.isArray(day["activities"]) ? day["activities"] : [];
    if (!citySlug) continue;

    for (const activityValue of dayActivities) {
      const activity = asRecord(activityValue);
      const name = getString(activity, "name");
      if (!name || getString(activity, "category") === "transport") continue;
      const key = `${citySlug}:${name.trim().toLocaleLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);

      activities.push({
        citySlug,
        name: name.trim(),
        category: getString(activity, "category") ?? "activity",
        cost: getFiniteNumber(activity, "cost"),
        currency: getString(activity, "currency") ?? "USD",
        durationMinutes: parseDuration(getString(activity, "duration")),
      });
    }
  }

  return activities;
}

function collectPlaces(
  itinerary: Record<string, unknown>,
  cities: CatalogCityReference[],
): CatalogPlace[] {
  if (cities.length !== 1) return [];
  const citySlug = cities[0]!.slug;
  const places: CatalogPlace[] = [];

  for (const [field, category] of [
    ["restaurants", "restaurant"],
    ["hotels", "hotel"],
  ] as const) {
    const entries = Array.isArray(itinerary[field]) ? itinerary[field] : [];
    for (const entryValue of entries) {
      const entry = asRecord(entryValue);
      const name = getString(entry, "name");
      if (!name) continue;
      places.push({
        citySlug,
        name: name.trim(),
        category,
        address: getString(entry, "address"),
      });
    }
  }

  return places;
}

function parseCityReferences(value: unknown): CatalogCityReference[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const reference = asRecord(item);
    const slug = getString(reference, "slug");
    const name = getString(reference, "name");
    return slug && name ? [{ slug, name }] : [];
  });
}

function resolveCitySlug(
  name: string | null,
  cities: CatalogCityReference[],
): string | null {
  if (!name) return cities.length === 1 ? cities[0]!.slug : null;
  const normalized = slugifyCityName(name);
  return (
    cities.find(
      (city) =>
        city.slug === normalized || slugifyCityName(city.name) === normalized,
    )?.slug ?? (cities.length === 1 ? cities[0]!.slug : null)
  );
}

function parseDuration(value: string | null): number | null {
  if (!value) return null;
  const hours = value.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b/i);
  const minutes = value.match(/(\d+)\s*(?:minutes?|mins?|m)\b/i);
  const total =
    (hours ? Number(hours[1]) * 60 : 0) + (minutes ? Number(minutes[1]) : 0);
  return Number.isFinite(total) && total > 0 ? Math.round(total) : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function getString(
  record: Record<string, unknown> | null,
  key: string,
): string | null {
  const value = record?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getFiniteNumber(
  record: Record<string, unknown> | null,
  key: string,
): number | null {
  const value = record?.[key];
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}
