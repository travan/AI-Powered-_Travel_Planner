import { Inject, Injectable } from "@nestjs/common";
import { notFound, ok, type ServiceResult } from "../../../shared/application/service-result.js";
import type { ItineraryDetail } from "../domain/itinerary.entity.js";
import { ITINERARY_REPOSITORY, type ItineraryRepository } from "../domain/itinerary.repository.js";
import { createAIProvider, MockAIProvider, type PreFetchedCityData } from "@travel/ai";
import type { ItineraryInput, TripStyle } from "@travel/types";
import type { GenerateItineraryDto } from "../dto/itinerary.dto.js";

@Injectable()
export class ItineraryService {
  constructor(@Inject(ITINERARY_REPOSITORY) private readonly itineraries: ItineraryRepository) {}

  async getVisible(input: { itineraryId: string; userId?: string | null }): Promise<ServiceResult<ItineraryDetail>> {
    const itinerary = await this.itineraries.findVisible(input);
    return itinerary ? ok(itinerary) : notFound("Itinerary not found");
  }

  async save(input: { itineraryId: string; userId: string }) {
    const saved = await this.itineraries.saveAsTrip(input);
    return saved
      ? ok({ saved: true as const, trip_id: saved.tripId })
      : notFound("Itinerary not found");
  }

  async generate(input: { userId: string; dto: GenerateItineraryDto }) {
    const request: ItineraryInput = {
      cities: input.dto.cities,
      start_date: input.dto.start_date,
      end_date: input.dto.end_date,
      num_days: input.dto.num_days,
      budget: input.dto.budget,
      currency: input.dto.currency,
      trip_style: normalizeTripStyle(input.dto.trip_style),
      locale: input.dto.locale ?? "en",
      num_travelers: input.dto.num_travelers,
    };
    const names = input.dto.city_names?.length ? input.dto.city_names : input.dto.cities;
    const cityData = names.map(toMinimalCityData);
    const providerName = process.env["AI_PROVIDER"] ?? "mock";
    const provider = providerName === "mock"
      ? new MockAIProvider()
      : createAIProvider(providerName as "openai" | "gemini" | "claude");
    const overview = await provider.generateOverview(request, cityData);
    const detail = await provider.generateDetail(request, overview, cityData);
    const itineraryId = await this.itineraries.createComplete({
      userId: input.userId,
      request,
      result: detail,
    });
    return { status: "cached" as const, itinerary_id: itineraryId, result: detail };
  }
}

function normalizeTripStyle(style: string): TripStyle {
  if (style === "budget" || style === "mid_range" || style === "luxury") return "mixed";
  if (style === "family") return "relax";
  if (style === "romantic") return "food";
  if (style === "cultural") return "culture";
  return style as TripStyle;
}

function toMinimalCityData(city: string): PreFetchedCityData {
  return {
    city,
    country: "",
    timezone: "UTC",
    currency: "USD",
    lat: 0,
    lon: 0,
    places: [],
    restaurants: [],
    hotels: [],
    sunrise: "06:00",
    sunset: "18:00",
    daylight_hours: "~12 hours",
    weather_note: "Check the local forecast before departure.",
    weather_highlights: [],
    weather_warnings: [],
    transport_options: [],
    ticket_options: {},
  };
}
