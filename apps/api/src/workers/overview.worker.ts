import type { Job } from "bullmq";
import type { ItineraryJobData } from "../lib/queue.js";
import { createAIProvider } from "@travel/ai";
import { getSunriseSunset, getWeatherForecast, buildWeatherNote } from "@travel/scrapers";
import { getDb } from "../db/mongodb.js";
import { redis } from "../db/redis.js";
import { env } from "../env.js";
import type { PreFetchedCityData } from "@travel/ai";
import type { CityMetadata } from "@travel/types";

const ai = createAIProvider(env.AI_PROVIDER);

function formatDaylightHours(dayLength: unknown): string {
  if (typeof dayLength === "string") {
    const [hoursRaw] = dayLength.split(":");
    const parsedHours = Number.parseInt(hoursRaw ?? "", 10);
    if (Number.isFinite(parsedHours)) return `~${parsedHours} hours of daylight`;
  }

  if (typeof dayLength === "number" && Number.isFinite(dayLength) && dayLength > 0) {
    const hours = Math.max(1, Math.round(dayLength / 3600));
    return `~${hours} hours of daylight`;
  }

  return "~12 hours of daylight";
}

/**
 * Phase 1 Worker — generates a lightweight overview (~2-3s).
 * Publishes "overview_ready" SSE event when complete.
 */
export async function processOverview(job: Job<ItineraryJobData>): Promise<void> {
  const { input } = job.data;
  const sourceJobId = job.data.jobId && job.data.jobId.length > 0 ? job.data.jobId : String(job.id);
  const channel = `itinerary:progress:${sourceJobId}`;

  const publish = (type: string, data: unknown) =>
    redis.publish(channel, JSON.stringify({ type, data }));

  try {
    await publish("processing", { step: "fetching_city_data" });

    const db = await getDb();

    // Fetch city metadata for all cities in parallel
    const cityDataList = await Promise.all(
      input.cities.map(async (cityName): Promise<PreFetchedCityData> => {
        const meta = await db
          .collection<CityMetadata>("cities")
          .findOne({ $or: [{ slug: cityName.toLowerCase() }, { "name.en": new RegExp(cityName, "i") }] });

        const lat = meta?.lat ?? 0;
        const lon = meta?.lon ?? 0;
        const date = input.start_date ?? new Date().toISOString().slice(0, 10);

        // Fetch sunrise/sunset and weather in parallel
        const [astro, forecasts] = await Promise.all([
          getSunriseSunset(lat, lon, date).catch(() => ({
            sunrise: "06:00",
            sunset: "18:00",
            day_length: "12:00:00",
            solar_noon: "12:00",
            civil_twilight_begin: "05:30",
            civil_twilight_end: "18:30",
          })),
          input.start_date && input.end_date
            ? getWeatherForecast(lat, lon, input.start_date, input.end_date).catch(() => [])
            : Promise.resolve([]),
        ]);

        const { note, highlights, warnings } = buildWeatherNote(forecasts);
        const daylightHours = formatDaylightHours(astro.day_length);

        return {
          city: meta?.name?.["en"] ?? cityName,
          country: meta?.country ?? "Unknown",
          timezone: meta?.timezone ?? "UTC",
          currency: meta?.currency ?? input.currency,
          lat,
          lon,
          places: [],
          restaurants: [],
          hotels: [],
          sunrise: astro.sunrise,
          sunset: astro.sunset,
          daylight_hours: daylightHours,
          weather_note: note,
          weather_highlights: highlights,
          weather_warnings: warnings,
          transport_options: [],
          ticket_options: {},
        };
      })
    );

    await publish("processing", { step: "generating_overview" });

    const overview = await ai.generateOverview(input, cityDataList);

    await publish("overview_ready", overview);

    // Keep overview for phase 2 worker consumption.
    await redis.setex(`job:overview:${sourceJobId}`, 1800, JSON.stringify(overview));

    // Store city data for Phase 2 workers via Redis (TTL: 30 min)
    await redis.setex(
      `job:citydata:${sourceJobId}`,
      1800,
      JSON.stringify(cityDataList)
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await publish("error", { message, code: "OVERVIEW_FAILED" });
    throw err;
  }
}
