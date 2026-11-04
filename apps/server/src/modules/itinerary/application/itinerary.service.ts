import { PlannerLearningService } from "../learning/learning.service.js";
import { WeatherService } from "../enrichment/weather.service.js";
import {
  enrichTravel,
  itineraryQuality,
  reconcileBudget,
} from "../enrichment/travel-enrichment.js";
import { normalizeOllamaItinerary } from "@travel/ai";
import { createHash } from "node:crypto";
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
  type AIProvider,
  type AIProviderName,
  type PreFetchedCityData,
} from "@travel/ai";
import * as travelTypes from "@travel/types";
const { upgradeJourneyPlan, validatePlanning, tripDayCount } =
  (travelTypes as unknown as { default?: typeof travelTypes }).default ??
  travelTypes;
import { BadRequestException } from "@nestjs/common";
import type {
  GenerateResponse,
  AiTokenUsage,
  Itinerary,
  ItineraryInput,
  ItineraryOverview,
  TripStyle,
} from "@travel/types";
import type { GenerateItineraryDto } from "../dto/itinerary.dto.js";
import { CitiesService } from "../../cities/application/cities.service.js";
import type { CityPlanningData } from "../../cities/domain/city.entity.js";
import { workerRequestContext } from "../../../cloudflare/request-context.js";

@Injectable()
export class ItineraryService {
  private readonly logger = new Logger(ItineraryService.name);

  constructor(
    @Inject(ITINERARY_REPOSITORY)
    private readonly itineraries: ItineraryRepository,
    @Inject(CitiesService)
    private readonly cities: CitiesService,
    @Inject(WeatherService) private readonly weather?: WeatherService,
    @Inject(PlannerLearningService)
    private readonly learning?: PlannerLearningService,
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
    onStage?: (stage: string) => Promise<void>;
  }): Promise<GenerateResponse> {
    const request: ItineraryInput = {
      planning: input.dto.planning,
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

    if (request.planning) {
      const validation = validatePlanning(request);
      if (!validation.valid) throw new BadRequestException(validation);
      request.num_days = tripDayCount(request);
      request.num_travelers =
        request.planning.travelers.adults +
        request.planning.travelers.child_ages.length;
      request.budget = request.planning.budget.total;
      request.currency = request.planning.budget.currency;
    }
    const requestId = await this.learning?.record(
      input.userId,
      "generation_request",
      { request },
    );
    await input.onStage?.("catalog");
    const names = input.dto.city_names?.length
      ? input.dto.city_names
      : input.dto.cities;
    const rememberedCities = [];
    for (const [index, name] of names.entries()) {
      const city = await this.cities.remember(name, input.dto.cities[index]);
      const planningData = await this.cities.findForPlanning(city.slug);
      const displayName =
        city.name[request.locale] ??
        city.name.en ??
        Object.values(city.name)[0] ??
        city.slug;
      rememberedCities.push({
        city: planningData ?? { ...city, places: [], activities: [] },
        catalogReference: {
          slug: city.slug,
          name: city.name.en ?? displayName,
        },
        planningData: planningData
          ? toPreFetchedCityData(planningData, request.currency, request.locale)
          : toMinimalCityData(name, request.currency),
      });
    }
    request.cities = rememberedCities.map(({ city }) => city.slug);
    const cityData = rememberedCities.map(({ planningData }) => planningData);
    const memory =
      this.learning && requestId
        ? await this.learning.context(input.userId, request, requestId)
        : undefined;
    if (memory && cityData[0]) cityData[0].learning_context = memory;
    const providerName = process.env["AI_PROVIDER"] ?? "mock";
    const cacheKey = generationCacheKey(
      request,
      rememberedCities.map(({ catalogReference }) => catalogReference.slug),
      providerName,
      createHash("sha256")
        .update(
          JSON.stringify(
            cityData.map((city) => ({
              ...city,
              learning_context: city.learning_context
                ? {
                    preferences: city.learning_context.preferences,
                    costs: city.learning_context.costs,
                  }
                : undefined,
              places: city.places.filter(trustedCatalogEntry),
              restaurants: city.restaurants.filter(trustedCatalogEntry),
              hotels: city.hotels.filter(trustedCatalogEntry),
            })),
          ),
        )
        .digest("hex"),
    );
    if (!input.dto.force_refresh) {
      const reusable = await this.itineraries.findReusable({
        userId: input.userId,
        cacheKey,
      });
      if (reusable) {
        if (this.learning)
          await this.learning.record(
            input.userId,
            "plan_returned",
            { cache_hit: true, request_id: requestId },
            reusable.id,
          );
        return {
          status: "cached",
          itinerary_id: reusable.id,
          result: await this.refreshPresentation(reusable.result),
          cache_hit: true,
        };
      }
    }
    let overview: ItineraryOverview;
    let detail: Itinerary;
    let provider: AIProvider | undefined;

    try {
      provider =
        providerName === "mock"
          ? new MockAIProvider()
          : createAIProvider(providerName as AIProviderName, {
              workersAI: workerRequestContext.getStore()?.ai,
            });
      await input.onStage?.("overview");
      overview = await provider.generateOverview(request, cityData);
      await input.onStage?.("detail");
      detail = await provider.generateDetail(request, overview, cityData);
      if (this.learning)
        await this.learning.record(input.userId, "model_candidate", {
          request_id: requestId,
          provider: providerName,
          attempt: 1,
          result: detail,
        });
      const quality = itineraryQuality(detail, request);
      if (quality.length && providerName !== "mock") {
        await input.onStage?.("repair");
        try {
          const repaired = await provider.generateDetail(
            {
              ...request,
              prompt_text: `${request.prompt_text ?? ""}\nRepair the following quality issues once; preserve the trip constraints and return the complete itinerary JSON:\n${quality.map((i) => i.message).join("\n")}`,
            },
            overview,
            cityData,
          );
          if (this.learning)
            await this.learning.record(input.userId, "model_candidate", {
              request_id: requestId,
              provider: providerName,
              attempt: 2,
              result: repaired,
            });
          if (
            repaired.days?.length &&
            itineraryQuality(repaired, request).length < quality.length
          )
            detail = repaired;
        } catch {
          /* Keep the usable original and explicit issues when repair fails. */
        }
      }
      const usage = provider.getUsage?.() ?? [];
      if (usage.length) {
        detail.ai_usage = usage;
        this.logger.log(
          `AI usage for ${input.userId}: ${JSON.stringify(usage)}`,
        );
      }
    } catch (error) {
      const usage = provider?.getUsage?.() ?? [];
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
        usage,
      );
      return {
        status: "unsupported",
        code: "AI_UNAVAILABLE",
        ...(usage.length ? { ai_usage: usage } : {}),
        message:
          providerName === "ollama"
            ? "The local AI service could not complete this request. Check that Ollama is running and the configured model is available, then try again."
            : "The AI service could not complete this request. Please try again shortly.",
      };
    }

    if (!Array.isArray(detail.days) || detail.days.length === 0) {
      const usage = provider?.getUsage?.() ?? [];
      await this.recordFailure(
        input.userId,
        request,
        providerName,
        "NO_ITINERARY",
        "Model returned no itinerary days",
        usage,
      );
      return {
        status: "unsupported",
        code: "NO_ITINERARY",
        ...(usage.length ? { ai_usage: usage } : {}),
        message:
          "There are not enough recommendations to build a usable itinerary for this request.",
      };
    }

    await input.onStage?.("validation");
    if (request.planning) {
      detail = upgradeJourneyPlan(detail, request);
      detail.locale = request.locale === "vi" ? "vi" : "en";
      detail.trip_style = request.trip_style;
    }
    detail.locale = request.locale === "vi" ? "vi" : "en";
    detail = enrichTravel(
      detail,
      rememberedCities.map((c) => c.city),
      request,
    );
    detail.issues = [
      ...(detail.issues ?? []),
      ...itineraryQuality(detail, request),
    ];
    detail = reconcileBudget(detail, request);
    if (this.weather)
      detail.weather = await this.weather.forPlan(
        detail,
        new Map(rememberedCities.map((c) => [c.city.slug, c.city])),
      );
    if (memory)
      detail.learning_summary = {
        past_plans: memory.past_plans,
        approved_expense_samples: memory.costs.reduce(
          (n, c) => n + c.samples,
          0,
        ),
      };
    detail.generation_cache_key = cacheKey;
    const itineraryId = await this.itineraries.createComplete({
      userId: input.userId,
      request,
      result: detail,
      catalogCities: rememberedCities.map(
        ({ catalogReference }) => catalogReference,
      ),
    });
    if (this.learning)
      await this.learning.record(
        input.userId,
        "plan_returned",
        { cache_hit: false, request_id: requestId },
        itineraryId,
      );
    return {
      status: "cached" as const,
      itinerary_id: itineraryId,
      result: detail,
      cache_hit: false,
    };
  }
  async refreshPresentation(plan: Itinerary): Promise<Itinerary> {
    if (!this.weather) return plan;
    const values = [
      ...new Set(plan.days.map((d) => d.city_slug ?? d.city).filter(Boolean)),
    ];
    const cities = (
      await Promise.all(
        values.map((value) => this.cities.findForPlanning(value)),
      )
    ).filter((c): c is CityPlanningData => !!c);
    const display = enrichTravel(plan, cities);
    display.weather = await this.weather.forPlan(
      display,
      new Map(cities.map((c) => [c.slug, c])),
    );
    return display;
  }
  async presentStored(result: Record<string, unknown>): Promise<Itinerary> {
    return this.refreshPresentation(normalizeOllamaItinerary(result));
  }
  private async recordFailure(
    userId: string,
    request: ItineraryInput,
    provider: string,
    code: string,
    error: unknown,
    usage: AiTokenUsage[] = [],
  ): Promise<void> {
    try {
      await this.itineraries.recordFailure({
        userId,
        request,
        provider,
        code,
        message: error instanceof Error ? error.message : String(error),
        usage,
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

function trustedCatalogEntry(value: unknown): boolean {
  return (
    !!value &&
    typeof value === "object" &&
    "source" in value &&
    !["ai_generated", "user_submission", "user_added"].includes(
      String(value.source),
    )
  );
}

function generationCacheKey(
  request: ItineraryInput,
  citySlugs: string[],
  provider: string,
  catalogFingerprint: string,
): string {
  // Bump the version when the itinerary prompt or response contract changes.
  const model =
    provider === "ollama"
      ? process.env["OLLAMA_DETAIL_MODEL"]?.trim() || "qwen3.5:9b"
      : provider === "cloudflare"
        ? (process.env.CLOUDFLARE_AI_MODEL ??
          "@cf/meta/llama-3.3-70b-instruct-fp8-fast")
        : provider;
  return createHash("sha256")
    .update(
      JSON.stringify({
        version: 5,
        planning: request.planning ?? null,
        catalog_version: process.env["CITY_CATALOG_VERSION"] ?? "1",
        catalogFingerprint,
        provider,
        model,
        cities: citySlugs,
        start_date: request.start_date ?? null,
        end_date: request.end_date ?? null,
        num_days: request.num_days ?? null,
        budget: request.budget ?? null,
        currency: request.currency.toUpperCase(),
        trip_style: request.trip_style,
        locale: request.locale,
        num_travelers: request.num_travelers,
        prompt_text: request.prompt_text?.trim() ?? "",
      }),
    )
    .digest("hex");
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
    lat: place.lat,
    lon: place.lon,
    google_place_id: place.google_place_id,
    id: place.id,
    last_verified_at: place.last_verified_at,
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
    id: activity.id,
    last_verified_at: activity.last_verified_at,
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
    weather_note:
      "Live weather is displayed separately by city and date; do not invent forecasts in seasonal notes.",
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
    weather_note:
      "Live weather is displayed separately by city and date; do not invent forecasts in seasonal notes.",
    weather_highlights: [],
    weather_warnings: [],
    transport_options: [],
    ticket_options: {},
  };
}
