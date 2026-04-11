import axios from "axios";
import type { Place, CityMetadata } from "@travel/types";

const BASE_URL = "https://maps.googleapis.com/maps/api/place";

export async function searchNearbyPlaces(
  city: CityMetadata,
  type: "tourist_attraction" | "restaurant" | "lodging",
  limit = 20
): Promise<Place[]> {
  const apiKey = process.env["GOOGLE_PLACES_API_KEY"];
  if (!apiKey) throw new Error("GOOGLE_PLACES_API_KEY is not set");

  const response = await axios.get(`${BASE_URL}/nearbysearch/json`, {
    params: {
      location: `${city.lat},${city.lon}`,
      radius: 15000,
      type,
      key: apiKey,
      language: "en",
    },
  });

  const results: unknown[] = (response.data as { results: unknown[] }).results ?? [];

  return results.slice(0, limit).map((r) => {
    const result = r as Record<string, unknown>;
    const geometry = result["geometry"] as { location: { lat: number; lng: number } } | undefined;
    const openingHours = result["opening_hours"] as { weekday_text?: string[] } | undefined;

    return {
      city_slug: city.slug,
      type:
        type === "tourist_attraction"
          ? "attraction"
          : type === "restaurant"
            ? "restaurant"
            : "hotel",
      name: String(result["name"] ?? ""),
      rating: typeof result["rating"] === "number" ? result["rating"] : undefined,
      price_range: typeof result["price_level"] === "number"
        ? "$".repeat(result["price_level"] as number)
        : undefined,
      address: String(result["vicinity"] ?? ""),
      lat: geometry?.location.lat,
      lon: geometry?.location.lng,
      maps_link: `https://maps.google.com/?q=${encodeURIComponent(String(result["name"] ?? "") + " " + city.name["en"])}`,
      categories: (result["types"] as string[] | undefined) ?? [],
      opening_hours: openingHours?.weekday_text
        ? Object.fromEntries(
            openingHours.weekday_text.map((t) => {
              const [day, ...rest] = t.split(": ");
              return [day ?? "", rest.join(": ")];
            })
          )
        : undefined,
      source: "google_places",
    } satisfies Place;
  });
}

export async function searchTextPlaces(
  query: string,
  city: CityMetadata
): Promise<Place[]> {
  const apiKey = process.env["GOOGLE_PLACES_API_KEY"];
  if (!apiKey) throw new Error("GOOGLE_PLACES_API_KEY is not set");

  const response = await axios.get(`${BASE_URL}/textsearch/json`, {
    params: {
      query: `${query} in ${city.name["en"]}`,
      key: apiKey,
      language: "en",
    },
  });

  const results: unknown[] = (response.data as { results: unknown[] }).results ?? [];

  return results.slice(0, 10).map((r) => {
    const result = r as Record<string, unknown>;
    const geometry = result["geometry"] as { location: { lat: number; lng: number } } | undefined;

    return {
      city_slug: city.slug,
      type: "attraction",
      name: String(result["name"] ?? ""),
      rating: typeof result["rating"] === "number" ? result["rating"] : undefined,
      address: String(result["formatted_address"] ?? ""),
      lat: geometry?.location.lat,
      lon: geometry?.location.lng,
      maps_link: `https://maps.google.com/?q=${encodeURIComponent(String(result["name"] ?? ""))}`,
      categories: (result["types"] as string[] | undefined) ?? [],
      source: "google_places",
    } satisfies Place;
  });
}
