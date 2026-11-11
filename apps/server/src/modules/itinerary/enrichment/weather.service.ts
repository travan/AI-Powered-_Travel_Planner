import { Inject, Injectable } from "@nestjs/common";
import type { Itinerary, TripWeather } from "@travel/types";
import {
  SQL_CLIENT,
  type SqlClient,
} from "../../../database/database.tokens.js";

type Cached = { body: any; expires_at: string; modified: string | null };
const validNumber = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n) && n > -900;
const dayAt = (date: string, timezone: string) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(date));

@Injectable()
export class WeatherService {
  constructor(@Inject(SQL_CLIENT) private readonly sql: SqlClient) {}

  private async cached(key: string, url: string, nasa = false): Promise<any> {
    const found = await this.sql.query<Cached>(
      "select body, expires_at::text, modified from travel_external_cache where cache_key=$1",
      [key],
    );
    const previous = found.rows[0];
    if (previous && Date.parse(previous.expires_at) > Date.now())
      return previous.body;
    // A genuine configured contact/domain is required by MET Norway.
    const contact =
      process.env.WEATHER_CONTACT_URL || process.env.NEXT_PUBLIC_APP_URL;
    if (!nasa && !contact) throw new Error("WEATHER_CONTACT_MISSING");
    const response = await fetch(url, {
      redirect: "error",
      headers: {
        "User-Agent": `TravelPlanner/1.0 (${contact ?? "NASA POWER client"})`,
        ...(previous?.modified
          ? { "If-Modified-Since": previous.modified }
          : {}),
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok && response.status !== 304)
      throw new Error("WEATHER_UPSTREAM");
    const body =
      response.status === 304 ? previous?.body : await response.json();
    if (!body) throw new Error("WEATHER_EMPTY");
    const expires = response.headers.get("expires");
    const expiresAt =
      expires && Number.isFinite(Date.parse(expires))
        ? new Date(expires)
        : new Date(Date.now() + (nasa ? 30 * 86400000 : 3600000));
    await this.sql.query(
      `insert into travel_external_cache(cache_key,body,expires_at,modified) values($1,$2,$3,$4)
      on conflict(cache_key) do update set body=excluded.body,expires_at=excluded.expires_at,modified=excluded.modified`,
      [
        key,
        body,
        expiresAt,
        response.headers.get("last-modified") ?? previous?.modified ?? null,
      ],
    );
    return body;
  }

  async forPlan(
    plan: {
      days: { city_slug?: string; date: string }[];
      city_catalog?: Itinerary["city_catalog"];
    },
    coordinates: Map<string, { lat: number | null; lon: number | null }>,
  ): Promise<TripWeather[]> {
    if (process.env.AI_PROVIDER === "mock" && process.env.JOURNEY_STAGING_DELAY_MS === "30000")
      return [];
    const rows: TripWeather[] = [];
    for (const [slug, city] of Object.entries(plan.city_catalog ?? {})) {
      const dates = [
        ...new Set(
          plan.days
            .filter((d) => d.city_slug === slug)
            .map((d) => d.date.slice(0, 10))
            .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)),
        ),
      ];
      const referenceOnly = dates.length === 0;
      if (referenceOnly)
        dates.push(dayAt(new Date().toISOString(), city.timezone || "UTC"));
      const location = coordinates.get(slug);
      let forecast: any;
      if (location?.lat != null && location.lon != null && dates.length) {
        try {
          const lat = location.lat.toFixed(4),
            lon = location.lon.toFixed(4);
          forecast = await this.cached(
            `met:${lat}:${lon}`,
            `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${lat}&lon=${lon}`,
          );
        } catch {
          /* An unavailable provider must never break a plan. */
        }
      }
      let climateRequest: Promise<any> | undefined;
      for (const date of dates) {
        const base = {
          reference_only: referenceOnly,
          city_slug: slug,
          date,
          timezone: city.timezone || "UTC",
          source: "MET Norway",
          source_url: "https://www.met.no/en/free-meteorological-data",
        };
        const samples = (forecast?.properties?.timeseries ?? []).filter(
          (s: any) => dayAt(s.time, base.timezone) === date,
        );
        const temperatures = samples
          .map((s: any) => s.data?.instant?.details?.air_temperature)
          .filter(validNumber);
        if (temperatures.length) {
          // Use non-overlapping precipitation intervals; never sum next_1h and next_6h together.
          let until = 0;
          const rain: number[] = [];
          for (const sample of samples) {
            const instant = Date.parse(sample.time);
            if (instant < until) continue;
            const hours = sample.data?.next_1_hours
              ? 1
              : sample.data?.next_6_hours
                ? 6
                : 0;
            const amount =
              sample.data?.[`next_${hours}_hours`]?.details
                ?.precipitation_amount;
            if (hours && validNumber(amount)) {
              const end = instant + hours * 3600000;
              if (
                dayAt(new Date(end - 1).toISOString(), base.timezone) === date
              )
                rain.push(amount);
              until = end;
            }
          }
          const hours = samples.map((s: any) =>
            Number(
              new Intl.DateTimeFormat("en-GB", {
                timeZone: base.timezone,
                hour: "2-digit",
                hourCycle: "h23",
              }).format(new Date(s.time)),
            ),
          );
          rows.push({
            ...base,
            status: "forecast",
            temperature_min: Math.min(...temperatures),
            temperature_max: Math.max(...temperatures),
            precipitation_mm: rain.length
              ? rain.reduce((a, b) => a + b, 0)
              : undefined,
            partial: Math.min(...hours) > 0 || Math.max(...hours) < 23,
            symbol:
              samples[0]?.data?.next_1_hours?.summary?.symbol_code ??
              samples[0]?.data?.next_6_hours?.summary?.symbol_code,
            updated_at: forecast?.properties?.meta?.updated_at,
          });
          continue;
        }
        // Seasonal normals are only used outside the provider's forecast horizon, not to mask an outage.
        const horizon = forecast?.properties?.timeseries?.at(-1)?.time;
        if (
          (horizon
            ? date > dayAt(horizon, base.timezone)
            : date >
              new Date(Date.now() + 10 * 86400000)
                .toISOString()
                .slice(0, 10)) &&
          location?.lat != null &&
          location.lon != null
        ) {
          try {
            const lat = location.lat.toFixed(2),
              lon = location.lon.toFixed(2);
            const climate = await (climateRequest ??= this.cached(
              `nasa:2001-2020:${lat}:${lon}`,
              `https://power.larc.nasa.gov/api/temporal/climatology/point?parameters=T2M_MIN,T2M_MAX,PRECTOTCORR&community=RE&latitude=${lat}&longitude=${lon}&start=2001&end=2020&format=JSON`,
              true,
            ));
            const month = new Date(`${date}T00:00:00Z`)
              .toLocaleString("en-US", { month: "short", timeZone: "UTC" })
              .toUpperCase();
            const p = climate?.properties?.parameter;
            const min = p?.T2M_MIN?.[month],
              max = p?.T2M_MAX?.[month],
              rain = p?.PRECTOTCORR?.[month];
            if (validNumber(min) && validNumber(max)) {
              rows.push({
                ...base,
                status: "climate",
                source: "NASA POWER",
                source_url: "https://power.larc.nasa.gov/",
                climate_period: "2001–2020",
                temperature_min: min,
                temperature_max: max,
                precipitation_mm: validNumber(rain) ? rain : undefined,
              });
              continue;
            }
          } catch {
            /* Keep an explicit missing state. */
          }
        }
        rows.push({ ...base, status: "unavailable" });
      }
    }
    return rows;
  }
}
