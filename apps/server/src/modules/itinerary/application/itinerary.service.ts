import { Inject, Injectable, Optional } from "@nestjs/common";
import { notFound, ok, type ServiceResult } from "../../../shared/application/service-result.js";
import type { ItineraryDetail } from "../domain/itinerary.entity.js";
import { ITINERARY_REPOSITORY, type ItineraryRepository } from "../domain/itinerary.repository.js";
import { createAIProvider, MockAIProvider, type PreFetchedCityData } from "@travel/ai";
import type {
  GenerateResponse,
  Itinerary,
  ItineraryInput,
  ItineraryOverview,
  TripStyle,
  UnsupportedGenerateResponse,
} from "@travel/types";
import { CitiesService } from "../../cities/application/cities.service.js";
import type { GenerateItineraryDto } from "../dto/itinerary.dto.js";

@Injectable()
export class ItineraryService {
  constructor(
    @Inject(ITINERARY_REPOSITORY) private readonly itineraries: ItineraryRepository,
    @Optional() @Inject(CitiesService) private readonly cities?: CitiesService,
  ) {}

  async getVisible(input: { itineraryId: string; userId?: string | null }): Promise<ServiceResult<ItineraryDetail>> {
    const itinerary = await this.itineraries.findVisible(input);
    return itinerary ? ok(itinerary) : notFound("Itinerary not found");
  }

  async getForTrip(input: { tripId: string; userId: string }): Promise<ServiceResult<ItineraryDetail>> {
    const itinerary = await this.itineraries.findForTrip(input);
    return itinerary ? ok(itinerary) : notFound("Saved itinerary not found");
  }

  async save(input: { itineraryId: string; userId: string }) {
    const saved = await this.itineraries.saveAsTrip(input);
    return saved
      ? ok({ saved: true as const, trip_id: saved.tripId })
      : notFound("Itinerary not found");
  }

  async generate(input: { userId: string; dto: GenerateItineraryDto }): Promise<GenerateResponse> {
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

    const cityService = this.cities;
    if (cityService) {
      const cityResults = await Promise.all(
        request.cities.map((slug) => cityService.getDetail(slug)),
      );
      const unsupportedCities = cityResults
        .map((result, index) =>
          result.ok
            ? null
            : input.dto.city_names?.[index] ?? request.cities[index],
        )
        .filter((city): city is string => Boolean(city));

      if (unsupportedCities.length > 0) {
        return unsupportedDestinationResponse(unsupportedCities);
      }
    }

    const names = input.dto.city_names?.length ? input.dto.city_names : input.dto.cities;
    const cityData = names.map(toMinimalCityData);
    let overview: ItineraryOverview;
    let detail: Itinerary;

    try {
      const providerName = process.env["AI_PROVIDER"] ?? "mock";
      const provider = providerName === "mock"
        ? new MockAIProvider()
        : createAIProvider(providerName as "openai" | "gemini" | "claude");
      overview = await provider.generateOverview(request, cityData);
      detail = await provider.generateDetail(request, overview, cityData);
    } catch {
      return {
        status: "unsupported",
        code: "AI_UNAVAILABLE",
        message: "We couldn't build a reliable itinerary for this request yet. Try another destination or a broader trip style.",
      };
    }

    if (!Array.isArray(detail.days) || detail.days.length === 0) {
      return {
        status: "unsupported",
        code: "NO_ITINERARY",
        message: "There are not enough recommendations to build a usable itinerary for this request.",
      };
    }

    const itineraryId = await this.itineraries.createComplete({
      userId: input.userId,
      request,
      result: detail,
    });
    return { status: "cached" as const, itinerary_id: itineraryId, result: detail };
  }
}

function unsupportedDestinationResponse(cities: string[]): UnsupportedGenerateResponse {
  return {
    status: "unsupported",
    code: "UNSUPPORTED_DESTINATION",
    message: `We don't have enough destination data for ${cities.join(", ")} yet. Try another destination or search by a nearby supported city.`,
    unsupported_cities: cities,
  };
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
