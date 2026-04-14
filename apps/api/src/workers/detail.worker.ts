import type { Job } from "bullmq";
import type { ItineraryJobData } from "../lib/queue.js";
import { createAIProvider } from "@travel/ai";
import {
  searchNearbyPlaces,
  buildBookingSearchUrl,
  buildAirbnbSearchUrl,
  buildTransportSegment,
  buildTicketOptions,
  buildSocialLinks,
} from "@travel/scrapers";
import { getDb } from "../db/mongodb.js";
import { redis, cacheSet, TTL } from "../db/redis.js";
import { supabase } from "../db/supabase.js";
import { env } from "../env.js";
import type { PreFetchedCityData } from "@travel/ai";
import type { ItineraryOverview, CityMetadata } from "@travel/types";

const ai = createAIProvider(env.AI_PROVIDER);

/**
 * Phase 2 Worker — fetches all data and generates full itinerary detail.
 * Publishes city_ready, transport_ready, restaurants_ready, complete events.
 */
export async function processDetail(job: Job<ItineraryJobData>): Promise<{ itinerary_id: string; status: "complete" }> {
  const { input, cacheKey } = job.data;
  const sourceJobId =
    job.data.jobId && job.data.jobId.length > 0
      ? job.data.jobId
      : String(job.id).replace(/^detail-/, "");
  const channel = `itinerary:progress:${sourceJobId}`;

  const publish = (type: string, data: unknown) =>
    redis.publish(channel, JSON.stringify({ type, data }));

  try {
    // Retrieve city data from Phase 1
    const cityDataRaw = await redis.get(`job:citydata:${sourceJobId}`);
    if (!cityDataRaw) throw new Error("City data from Phase 1 not found — Phase 1 may have failed");

    const cityDataList = JSON.parse(cityDataRaw) as PreFetchedCityData[];

    // Retrieve overview (stored by Phase 1 in a separate key)
    const overviewRaw = await redis.get(`job:overview:${sourceJobId}`);
    if (!overviewRaw) throw new Error("Overview from Phase 1 not found");
    const overview = JSON.parse(overviewRaw) as ItineraryOverview;

    const db = await getDb();

    // Enrich each city in parallel
    const enrichedCityData = await Promise.all(
      cityDataList.map(async (cityData) => {
        const meta = await db
          .collection<CityMetadata>("cities")
          .findOne({ "name.en": new RegExp(cityData.city, "i") });

        if (!meta) return cityData;

        // Fetch places, restaurants in parallel
        const [attractions, restaurants, hotels] = await Promise.all([
          searchNearbyPlaces(meta, "tourist_attraction", 20).catch(() => []),
          searchNearbyPlaces(meta, "restaurant", 15).catch(() => []),
          searchNearbyPlaces(meta, "lodging", 10).catch(() => []),
        ]);

        // Build ticket options for top attractions
        const ticketOptions: Record<string, unknown[]> = {};
        for (const place of attractions.slice(0, 8)) {
          ticketOptions[place.name] = buildTicketOptions(place.name, cityData.city, meta.country);
        }

        // Build social links for restaurants
        const restaurantsWithSocial = restaurants.map((r) => ({
          ...r,
          ...buildSocialLinks(r.name, cityData.city),
        }));

        // Build booking links for hotels
        const checkIn = input.start_date ?? new Date().toISOString().slice(0, 10);
        const checkOut = input.end_date ?? new Date(Date.now() + input.num_days! * 86400000).toISOString().slice(0, 10);

        const hotelsWithLinks = hotels.map((h) => ({
          ...h,
          booking_url: buildBookingSearchUrl(cityData.city, checkIn, checkOut, input.num_travelers),
          airbnb_url: buildAirbnbSearchUrl(cityData.city, checkIn, checkOut, input.num_travelers),
        }));

        // Build transport between cities
        const cityIndex = cityDataList.findIndex((c) => c.city === cityData.city);
        const nextCity = cityDataList[cityIndex + 1];
        let transportOptions: unknown[] = [];

        if (nextCity && meta) {
          const nextMeta = await db
            .collection<CityMetadata>("cities")
            .findOne({ "name.en": new RegExp(nextCity.city, "i") });

          if (nextMeta) {
            const distance = Math.round(
              haversineKm(meta.lat, meta.lon, nextMeta.lat, nextMeta.lon)
            );
            const segment = buildTransportSegment(
              cityData.city, nextCity.city, meta.country,
              checkIn, distance
            );
            transportOptions = [segment];
          }
        }

        const enriched: PreFetchedCityData = {
          ...cityData,
          places: attractions,
          restaurants: restaurantsWithSocial,
          hotels: hotelsWithLinks,
          transport_options: transportOptions,
          ticket_options: ticketOptions,
        };

        await publish("city_ready", { city: cityData.city });
        return enriched;
      })
    );

    await publish("transport_ready", { status: "fetched" });
    await publish("restaurants_ready", { status: "fetched" });
    await publish("processing", { step: "generating_full_itinerary" });

    const itinerary = await ai.generateDetail(input, overview, enrichedCityData);

    let itineraryId: string;

    // Save to Supabase; in local dev, fall back to Redis-only persistence.
    const { data: saved, error } = await supabase
      .from("itineraries")
      .insert({
        job_id: sourceJobId,
        cities: input.cities,
        countries: enrichedCityData.map((c) => c.country),
        start_date: input.start_date,
        end_date: input.end_date,
        num_days: overview.total_days,
        budget: input.budget,
        currency: input.currency,
        trip_style: input.trip_style,
        status: "complete",
        result: itinerary,
      })
      .select("id")
      .single();

    if (error || !saved?.id) {
      if (env.NODE_ENV === "production") {
        throw new Error(`Failed to save itinerary: ${error?.message ?? "unknown error"}`);
      }
      itineraryId = `local-${sourceJobId}`;
      await cacheSet(`itinerary:${itineraryId}`, itinerary, TTL.ITINERARY_RESULT);
    } else {
      itineraryId = saved.id;
    }

    // Cache result in Redis
    await cacheSet(
      `cache:itinerary:${cacheKey}`,
      { itinerary_id: itineraryId, itinerary },
      TTL.ITINERARY_RESULT
    );

    const completePayload: { itinerary_id: string; status: "complete" } = {
      itinerary_id: itineraryId,
      status: "complete",
    };
    await redis.setex(`job:result:${sourceJobId}`, 1800, JSON.stringify(completePayload));
    await publish("complete", completePayload);
    return completePayload;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await publish("error", { message, code: "DETAIL_FAILED" });

    // Mark itinerary as failed in Supabase
    await supabase
      .from("itineraries")
      .update({ status: "failed" })
      .eq("job_id", sourceJobId);

    throw err;
  }
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
