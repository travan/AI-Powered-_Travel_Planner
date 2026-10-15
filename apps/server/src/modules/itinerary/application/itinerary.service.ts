import { Inject, Injectable, Logger } from "@nestjs/common";
import {
  notFound,
  ok,
  type ServiceResult,
} from "../../../shared/application/service-result.js";
import type { ItineraryDetail } from "../domain/itinerary.entity.js";
import {
  ITINERARY_REPOSITORY,
  type ItineraryRepository,
} from "../domain/itinerary.repository.js";
import {
  createAIProvider,
  MockAIProvider,
  type AIProviderName,
  type PreFetchedCityData,
} from "@travel/ai";
import type {
  GenerateResponse,
  Itinerary,
  ItineraryInput,
  ItineraryOverview,
  TripStyle,
} from "@travel/types";
import type { GenerateItineraryDto } from "../dto/itinerary.dto.js";
import { CitiesService } from "../../cities/application/cities.service.js";
import type { CityPlanningData } from "../../cities/domain/city.entity.js";

@Injectable()
export class ItineraryService {
  private readonly logger = new Logger(ItineraryService.name);

  constructor(
    @Inject(ITINERARY_REPOSITORY)
    private readonly itineraries: ItineraryRepository,
    @Inject(CitiesService)
    private readonly cities: CitiesService,
  ) {}

  async getVisible(input: {
    itineraryId: string;
    userId?: string | null;
  }): Promise<ServiceResult<ItineraryDetail>> {
    const itinerary = await this.itineraries.findVisible(input);
    return itinerary ? ok(itinerary) : notFound("Itinerary not found");
  }

  async getForTrip(input: {
    tripId: string;
    userId: string;
  }): Promise<ServiceResult<ItineraryDetail>> {
    const itinerary = await this.itineraries.findForTrip(input);
    return itinerary ? ok(itinerary) : notFound("Saved itinerary not found");
  }

  async save(input: { itineraryId: string; userId: string }) {
    const saved = await this.itineraries.saveAsTrip(input);
    return saved
      ? ok({ saved: true as const, trip_id: saved.tripId })
      : notFound("Itinerary not found");
  }

  async generate(input: {
    userId: string;
    dto: GenerateItineraryDto;
  }): Promise<GenerateResponse> {
    const request: ItineraryInput = {
      cities: input.dto.cities,
      prompt_text: input.dto.prompt_text,
      start_date: input.dto.start_date,
      end_date: input.dto.end_date,
      num_days: input.dto.num_days,
      budget: input.dto.budget,
      currency: input.dto.currency,
      trip_style: normalizeTripStyle(input.dto.trip_style),
      locale: input.dto.locale ?? "en",
      num_travelers: input.dto.num_travelers,
    };

    const names = input.dto.city_names?.length
      ? input.dto.city_names
      : input.dto.cities;
    const rememberedCities = await Promise.all(
      names.map(async (name) => {
        const city = await this.cities.remember(name);
        const planningData = await this.cities.findForPlanning(city.slug);
        const displayName =
          city.name[request.locale] ??
          city.name.en ??
          Object.values(city.name)[0] ??
          city.slug;
        return {
          catalogReference: { slug: city.slug, name: displayName },
          planningData: planningData
            ? toPreFetchedCityData(
                planningData,
                request.currency,
                request.locale,
              )
            : toMinimalCityData(name, request.currency),
        };
      }),
    );
    const cityData = rememberedCities.map(({ planningData }) => planningData);
    let overview: ItineraryOverview;
    let detail: Itinerary;
    const providerName = process.env["AI_PROVIDER"] ?? "mock";

    try {
      const provider =
        providerName === "mock"
          ? new MockAIProvider()
          : createAIProvider(providerName as AIProviderName);
      overview = await provider.generateOverview(request, cityData);
      detail = await provider.generateDetail(request, overview, cityData);
    } catch (error) {
      const details =
        error instanceof Error ? (error.stack ?? error.message) : String(error);
      this.logger.error(
        `AI itinerary generation failed for provider "${providerName}"`,
        details,
      );
      await this.recordFailure(
        input.userId,
        request,
        providerName,
        "AI_UNAVAILABLE",
        error,
      );
      return {
        status: "unsupported",
        code: "AI_UNAVAILABLE",
        message: providerName === "ollama"
          ? "The local AI service could not complete this request. Check that Ollama is running and the configured model is available, then try again."
          : "The AI service could not complete this request. Please try again shortly.",
      };
    }

    if (!Array.isArray(detail.days) || detail.days.length === 0) {
      await this.recordFailure(
        input.userId,
        request,
        providerName,
        "NO_ITINERARY",
        "Model returned no itinerary days",
      );
      return {
        status: "unsupported",
        code: "NO_ITINERARY",
        message:
          "There are not enough recommendations to build a usable itinerary for this request.",
      };
    }

    const itineraryId = await this.itineraries.createComplete({
      userId: input.userId,
      request,
      result: detail,
      catalogCities: rememberedCities.map(
        ({ catalogReference }) => catalogReference,
      ),
    });
    return {
      status: "cached" as const,
      itinerary_id: itineraryId,
      result: detail,
    };
  }
  private async recordFailure(
    userId: string,
    request: ItineraryInput,
    provider: string,
    code: string,
    error: unknown,
  ): Promise<void> {
    try {
      await this.itineraries.recordFailure({
        userId,
        request,
        provider,
        code,
        message: error instanceof Error ? error.message : String(error),
      });
    } catch (persistenceError) {
      this.logger.error(
        "Could not persist AI generation failure",
        persistenceError instanceof Error
          ? persistenceError.stack
          : String(persistenceError),
      );
    }
  }
}

function normalizeTripStyle(style: string): TripStyle {
  return style as TripStyle;
}

function toPreFetchedCityData(
  city: CityPlanningData,
  fallbackCurrency: string,
  locale: string,
): PreFetchedCityData {
  const displayName =
    city.name[locale] ??
    city.name.en ??
    Object.values(city.name)[0] ??
    city.slug;
  const placeData = city.places.map((place) => ({
    name: place.name,
    type: place.type,
    category: place.category,
    address: place.address,
    tags: place.tags,
    price_level: place.price_level,
    rating: place.rating,
    opening_hours: place.opening_hours,
    source: place.source,
  }));
  const activityData = city.activities.map((activity) => ({
    name: activity.title,
    category: activity.category,
    tags: activity.tags,
    estimated_cost: activity.estimated_cost,
    currency: activity.currency,
    duration_minutes: activity.duration_minutes,
    source: activity.source,
  }));

  return {
    city: displayName,
    country: city.country || "Unknown",
    timezone: city.timezone || "Unknown",
    currency: city.currency || fallbackCurrency,
    lat: city.lat,
    lon: city.lon,
    places: [
      ...placeData.filter(
        (place) =>
          !["restaurant", "cafe", "hotel", "homestay"].includes(place.type),
      ),
      ...activityData,
    ],
    restaurants: placeData.filter((place) =>
      ["restaurant", "cafe"].includes(place.type),
    ),
    hotels: placeData.filter((place) =>
      ["hotel", "homestay"].includes(place.type),
    ),
    sunrise: "Unknown",
    sunset: "Unknown",
    daylight_hours: "Unknown",
    weather_note: "No verified local weather data was provided.",
    weather_highlights: [],
    weather_warnings: [],
    transport_options: [],
    ticket_options: {},
  };
}

function toMinimalCityData(city: string, currency: string): PreFetchedCityData {
  return {
    city,
    country: "Unknown",
    timezone: "Unknown",
    currency,
    lat: null,
    lon: null,
    places: [],
    restaurants: [],
    hotels: [],
    sunrise: "Unknown",
    sunset: "Unknown",
    daylight_hours: "Unknown",
    weather_note: "No verified local weather data was provided.",
    weather_highlights: [],
    weather_warnings: [],
    transport_options: [],
    ticket_options: {},
  };
}
