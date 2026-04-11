import type { TransportOption, TransportSegment } from "@travel/types";

// Transport source routing by country
const TRANSPORT_SOURCES: Record<string, string[]> = {
  VN: ["12go", "baolau", "skyscanner"],
  JP: ["hyperdia", "skyscanner"],
  TH: ["12go", "skyscanner"],
  EU: ["trainline", "omio", "skyscanner"],
  US: ["amtrak", "skyscanner"],
  DEFAULT: ["skyscanner", "12go"],
};

export function getTransportSources(countryCode: string): string[] {
  return TRANSPORT_SOURCES[countryCode] ?? TRANSPORT_SOURCES["DEFAULT"]!;
}

export function build12GoSearchUrl(
  fromCity: string,
  toCity: string,
  date: string
): string {
  return `https://12go.asia/en/travel/${encodeURIComponent(fromCity.toLowerCase())}/${encodeURIComponent(toCity.toLowerCase())}?date=${date}`;
}

export function buildBaolauSearchUrl(
  from: string,
  to: string,
  date: string
): string {
  return `https://www.baolau.com/en/route/${encodeURIComponent(from)}/${encodeURIComponent(to)}?date=${date}`;
}

export function buildVietRailUrl(date: string): string {
  return `https://dsvn.vn/?page=booking&date=${date}`;
}

export function buildGrabRentalUrl(city: string): string {
  return `https://www.grab.com/vn/transport/car/`;
}

export function buildCarRentalUrl(city: string, pickupDate: string, dropoffDate: string): string {
  return `https://www.rentalcars.com/SearchResults.do?city=${encodeURIComponent(city)}&puDay=${pickupDate}&doDay=${dropoffDate}`;
}

/**
 * Generate static transport options for a city pair.
 * In production, these would be populated from scraping 12go / Skyscanner.
 * For now, we build deep-link URLs for each platform.
 */
export function buildTransportSegment(
  from: string,
  to: string,
  fromCountry: string,
  date: string,
  distanceKm: number
): TransportSegment {
  const options: TransportOption[] = [];

  // Train / bus for short distances (< 600 km)
  if (distanceKm < 600) {
    options.push({
      provider: "12go Asia",
      type: "train",
      price_range: "From $5",
      booking_url: build12GoSearchUrl(from, to, date),
      note: "Check schedule on 12go — trains recommended for comfort",
    });
    options.push({
      provider: "Baolau",
      type: "bus",
      price_range: "From $3",
      booking_url: buildBaolauSearchUrl(from, to, date),
      note: "Sleeper bus available for overnight trips",
    });
  }

  // Flight for longer distances
  options.push({
    provider: "Skyscanner",
    type: "flight",
    price_range: "From $15",
    booking_url: buildSkyscannerLinkFromCities(from, to, date),
    note: "Compare prices across all airlines",
  });

  // Self-drive option
  options.push({
    provider: "RentalCars",
    type: "self_drive",
    price_range: "From $20/day",
    booking_url: buildCarRentalUrl(from, date, date),
    note: "International driving license required in most countries",
  });

  return {
    segment: `${from} → ${to}`,
    from,
    to,
    recommended_mode: distanceKm < 300 ? "train" : distanceKm < 600 ? "bus" : "flight",
    options,
  };
}

function buildSkyscannerLinkFromCities(from: string, to: string, date: string): string {
  return `https://www.skyscanner.com/transport/flights/${encodeURIComponent(from)}/${encodeURIComponent(to)}/${date.replace(/-/g, "").slice(2)}/`;
}
