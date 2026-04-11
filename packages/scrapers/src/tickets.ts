import type { TicketOption } from "@travel/types";

// Ticket source routing by country
const TICKET_SOURCES: Record<string, string[]> = {
  VN: ["klook", "traveloka", "trip-com"],
  JP: ["klook", "viator", "getyourguide"],
  TH: ["klook", "viator", "traveloka"],
  EU: ["getyourguide", "viator", "klook"],
  US: ["viator", "getyourguide", "klook"],
  DEFAULT: ["klook", "viator", "getyourguide"],
};

export function getTicketSources(countryCode: string): string[] {
  return TICKET_SOURCES[countryCode] ?? TICKET_SOURCES["DEFAULT"]!;
}

export function buildTicketOptions(
  attractionName: string,
  city: string,
  country: string
): TicketOption[] {
  const sources = getTicketSources(country);
  const options: TicketOption[] = [];

  for (const source of sources) {
    switch (source) {
      case "klook":
        options.push({
          platform: "Klook",
          url: `https://www.klook.com/search/?query=${encodeURIComponent(`${attractionName} ${city}`)}`,
          note: "Skip-the-line tickets available on Klook",
        });
        break;
      case "traveloka":
        options.push({
          platform: "Traveloka",
          url: `https://www.traveloka.com/en-vn/activities/search?keyword=${encodeURIComponent(attractionName)}`,
          note: "Book in advance for discounts",
        });
        break;
      case "trip-com":
        options.push({
          platform: "Trip.com",
          url: `https://www.trip.com/travel-guide/attraction/search/?keyword=${encodeURIComponent(attractionName)}`,
        });
        break;
      case "getyourguide":
        options.push({
          platform: "GetYourGuide",
          url: `https://www.getyourguide.com/s/?q=${encodeURIComponent(`${attractionName} ${city}`)}`,
        });
        break;
      case "viator":
        options.push({
          platform: "Viator",
          url: `https://www.viator.com/search/${encodeURIComponent(city)}?text=${encodeURIComponent(attractionName)}`,
        });
        break;
    }
  }

  return options;
}
