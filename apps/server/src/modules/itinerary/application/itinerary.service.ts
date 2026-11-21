import {
  blockingCatalogIssues,
  buildCatalogItinerary,
  type CatalogJob,
} from "./catalog-itinerary.js";
import { logEvent } from "../../../observability/logger.js";
import {
  flexibleMonthDates,
  selectFlexibleWindow,
} from "../enrichment/flexible-dates.js";
import { PlannerLearningService } from "../learning/learning.service.js";
import { WeatherService } from "../enrichment/weather.service.js";
import { CurrencyService } from "../enrichment/currency.service.js";
import {
  convertCatalogPrices,
  convertPlanPrices,
} from "../enrichment/catalog-prices.js";
import {
  enrichTravel,
  itineraryQuality,
  itineraryRouteIssues,
  resolveCity,
  reconcileBudget,
} from "../enrichment/travel-enrichment.js";
import {
  CloudflareAIProvider,
  PlanningGenerationError,
  normalizeOllamaItinerary,
} from "@travel/ai";
import { createHash, randomBytes } from "node:crypto";
import { publicItinerary } from "./public-itinerary.js";
import {
  HttpException,
  Inject,
  Injectable,
  Logger,
  Optional,
} from "@nestjs/common";
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
const {
  countryDestinationReference,
  upgradeJourneyPlan,
  validatePlanning,
  tripDayCount,
  flexibleMonthWindows,
  plannerToday,
  journeyRoute,
} =
  (travelTypes as unknown as { default?: typeof travelTypes }).default ??
  travelTypes;
import { BadRequestException } from "@nestjs/common";
import type {
  GenerateResponse,
  AiTokenUsage,
  Itinerary,
  ItineraryInput,
  JourneyLocation,
  PlanningCriteria,
  RoutePlace,
  ItineraryOverview,
  TripStyle,
} from "@travel/types";
import type { GenerateItineraryDto } from "../dto/itinerary.dto.js";
import { CitiesService } from "../../cities/application/cities.service.js";
import type {
  City,
  CityPlanningData,
} from "../../cities/domain/city.entity.js";
import { workerRequestContext } from "../../../cloudflare/request-context.js";

@Injectable()
export class ItineraryService {
  private readonly logger = new Logger(ItineraryService.name);

  async createShareLink(itineraryId: string, userId: string) {
    const token = await this.itineraries.createShareToken({
      itineraryId,
      userId,
      token: randomBytes(32).toString("base64url"),
    });
    if (!token) return notFound("Itinerary not found");
    const origin = (
      process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
    ).replace(/\/$/, "");
    return ok({ share_token: token, share_url: `${origin}/shared/${token}` });
  }

  async revokeShareLink(itineraryId: string, userId: string) {
    return (await this.itineraries.revokeShareToken({ itineraryId, userId }))
      ? ok({ revoked: true })
      : notFound("Itinerary not found");
  }

  async sharedItinerary(token: string) {
    const detail = await this.itineraries.findShared(token);
    if (!detail?.result) return notFound("Shared itinerary not found");
    return ok(publicItinerary(await this.presentStored(detail.result)));
  }

  constructor(
    @Inject(ITINERARY_REPOSITORY)
    private readonly itineraries: ItineraryRepository,
    @Inject(CitiesService)
    private readonly cities: CitiesService,
    @Inject(WeatherService) private readonly weather?: WeatherService,
    @Inject(PlannerLearningService)
    private readonly learning?: PlannerLearningService,
    @Optional()
    @Inject(CurrencyService)
    private readonly currency?: CurrencyService,
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

  private normalizedLocation(
    location: JourneyLocation,
    city?: City | null,
    locale = "en",
  ): JourneyLocation {
    if (!city || location.source === "browser" || !city.country)
      return location;
    return {
      ...location,
      city_slug: city.slug,
      label: city.name[locale] ?? city.name.en ?? city.slug,
      names: city.name,
    };
  }

  lookupRouteCities(values: string[]) {
    return this.cities.routeCities([...new Set(values)]);
  }

  describeRoute(
    journey: PlanningCriteria["journey"] | undefined,
    stops: RoutePlace[],
    cities: Map<string, City>,
  ) {
    const location = (point: JourneyLocation) =>
      this.normalizedLocation(point, cities.get(point.label));
    const normalized = journey && {
      ...journey,
      origin: location(journey.origin),
      endpoint: journey.endpoint && location(journey.endpoint),
    };
    return journeyRoute(
      normalized,
      stops.map((stop) => {
        const city =
          cities.get(stop.slug ?? stop.label) ?? cities.get(stop.label);
        if (city?.country)
          return {
            slug: city.slug,
            label: city.name.en ?? city.slug,
            names: city.name,
          };
        return {
          ...stop,
          names:
            this.cities.countryReference(stop.label)?.names ??
            city?.name ??
            stop.names,
        };
      }),
    );
  }

  async generate(input: {
    userId: string;
    dto: GenerateItineraryDto;
    onStage?: (stage: string) => Promise<void>;
    catalogJob?: CatalogJob;
    onUsage?: (usage: AiTokenUsage) => void;
  }): Promise<GenerateResponse> {
    const request: ItineraryInput = {
      planning: input.dto.planning,
      flexible_month: input.dto.flexible_month,
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

    await input.onStage?.("criteria");
    const validation = validatePlanning(request);
    if (!validation.valid)
      throw new BadRequestException({
        code: "PLANNING_INVALID",
        ...validation,
      });
    if (request.planning) {
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
    const rememberedCities: {
      city: CityPlanningData;
      catalogReference: { slug: string; name: string } | null;
      planningData: PreFetchedCityData;
    }[] = [];
    for (const [index, slug] of input.dto.cities.entries()) {
      const reference = input.dto.destination_refs?.find(
        (entry) => entry.id === slug,
      );
      const name =
        reference?.name.trim() || input.dto.city_names?.[index]?.trim() || slug;
      const country = countryDestinationReference(slug);
      if (country) {
        const label = country.names[request.locale === "vi" ? "vi" : "en"];
        rememberedCities.push({
          city: {
            slug,
            name: country.names,
            country: country.country,
            timezone: "",
            currency: "",
            lat: null,
            lon: null,
            popular: false,
            places: [],
            activities: [],
          },
          catalogReference: null,
          planningData: {
            ...toMinimalCityData(label, request.currency),
            country: country.names.en,
          },
        });
        continue;
      }
      let city: City;
      try {
        city = await this.cities.remember(name, slug);
      } catch (error) {
        if (!(error instanceof HttpException)) throw error;
        const status = error.getStatus();
        const body = error.getResponse();
        const unresolved =
          status === 400 &&
          typeof body === "object" &&
          "code" in body &&
          body.code === "CITY_UNRESOLVED";
        if (!unresolved && status !== 429 && status !== 503) throw error;
        rememberedCities.push({
          city: {
            slug,
            name: { en: name },
            country: "",
            timezone: "",
            currency: "",
            lat: null,
            lon: null,
            popular: false,
            places: [],
            activities: [],
          },
          catalogReference: null,
          planningData: toMinimalCityData(name, request.currency),
        });
        continue;
      }
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
          : toMinimalCityData(displayName, request.currency),
      });
    }
    const destinationCities = rememberedCities.filter(
      (entry, index) =>
        entry.city.slug !== rememberedCities[index - 1]?.city.slug,
    );
    request.cities = destinationCities.map(({ city }) => city.slug);
    const routeCities = destinationCities.map(({ city }) => city);
    if (request.planning) {
      const journey = request.planning.journey;
      const normalize = async (location: JourneyLocation) => {
        if (location.source === "browser") return location;
        const find = async (value: string) =>
          resolveCity(routeCities, value) ??
          (await this.cities.findForPlanning(value));
        const selected = location.city_slug && (await find(location.city_slug));
        const city =
          selected && selected.slug === location.city_slug
            ? selected
            : await find(location.label);
        if (city && !routeCities.some((known) => known.slug === city.slug))
          routeCities.push(city);
        return this.normalizedLocation(location, city, request.locale);
      };
      request.planning = {
        ...request.planning,
        journey: {
          ...journey,
          destinations: request.cities,
          origin: await normalize(journey.origin),
          endpoint:
            !journey.return_to_origin && journey.endpoint
              ? await normalize(journey.endpoint)
              : journey.endpoint,
        },
      };
    }
    const qualityFor = (plan: Itinerary) => [
      ...itineraryRouteIssues(plan, request, routeCities),
      ...itineraryQuality(plan, request),
    ];
    let flexibleDateNote: string | undefined;
    let dateBasis = input.catalogJob?.progress.dates?.basis;
    if (input.catalogJob?.progress.dates) {
      const { start, end } = input.catalogJob.progress.dates;
      request.start_date = start;
      request.end_date = end;
    } else if (request.flexible_month) {
      const today = plannerToday();
      const windows = flexibleMonthWindows(
        request.flexible_month,
        request.num_days ?? 1,
        today,
      );
      if (!windows.length)
        throw new BadRequestException({ code: "MONTH_UNAVAILABLE" });
      const dates = flexibleMonthDates(request.flexible_month, today);
      const weather = this.weather
        ? await this.weather.forPlan(
            {
              city_catalog: Object.fromEntries(
                destinationCities.map(({ city }) => [
                  city.slug,
                  {
                    name: city.name,
                    country: city.country,
                    timezone: city.timezone,
                  },
                ]),
              ),
              days: destinationCities.flatMap(({ city }) =>
                dates.map((date) => ({ city_slug: city.slug, date })),
              ),
            },
            new Map(destinationCities.map(({ city }) => [city.slug, city])),
          )
        : [];
      const selected = selectFlexibleWindow(windows, request.cities, weather);
      if (input.catalogJob) {
        input.catalogJob.progress.dates = selected;
        await input.catalogJob.save(input.catalogJob.progress);
      }
      request.start_date = selected.start;
      request.end_date = selected.end;
      dateBasis = selected.basis;
    }
    if (dateBasis) {
      flexibleDateNote =
        request.locale === "vi"
          ? dateBasis === "forecast"
            ? "Ngày linh hoạt được chọn trong các khoảng có dự báo đầy đủ, ưu tiên ít mưa và nhiệt độ thuận lợi cho hoạt động. Dự báo có thể thay đổi."
            : "Ngày được chọn ngẫu nhiên trong tháng vì chưa đủ dự báo để so sánh các khoảng ngày. Thông tin khí hậu theo mùa không phải dự báo cho ngày cụ thể."
          : dateBasis === "forecast"
            ? "Flexible dates were selected among fully forecast periods, prioritizing less rain and comfortable activity temperatures. Forecasts may change."
            : "Dates were selected at random within the month because complete forecasts were unavailable for comparison. Seasonal climate is not a forecast for specific dates.";
    }
    const cityData = destinationCities.map(({ planningData }) => planningData);
    const memory =
      this.learning && requestId
        ? await this.learning.context(input.userId, request, requestId)
        : undefined;
    if (memory && cityData[0]) cityData[0].learning_context = memory;
    const providerName = process.env["AI_PROVIDER"] ?? "mock";
    const cacheKey = generationCacheKey(
      request,
      destinationCities.map(({ city }) => city.slug),
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
      if (
        reusable &&
        !reusable.result.issues?.some(
          (issue) =>
            issue.code === "JOURNEY_DAY_ORDER" ||
            issue.code === "JOURNEY_LEG_MISSING",
        )
      ) {
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

    if (input.catalogJob) {
      await input.onStage?.("detail");
      const catalogCities = await Promise.all(
        destinationCities.map(async ({ city, catalogReference }) =>
          catalogReference
            ? ((await this.cities.findForPlanning(
                city.slug,
                Math.min(300, (request.num_days ?? 1) * 12),
              )) ?? city)
            : city,
        ),
      );
      for (const city of catalogCities) {
        const index = routeCities.findIndex(
          (known) => known.slug === city.slug,
        );
        if (index >= 0) routeCities[index] = city;
      }
      let catalogProvider: CloudflareAIProvider | undefined;
      detail = await buildCatalogItinerary(
        request,
        catalogCities,
        input.catalogJob,
        () => {
          if (catalogProvider) return catalogProvider;
          const ai = workerRequestContext.getStore()?.ai;
          if (!ai) throw new HttpException({ code: "AI_UNAVAILABLE" }, 503);
          catalogProvider = new CloudflareAIProvider(
            ai,
            process.env.CLOUDFLARE_AI_MODEL,
          );
          return catalogProvider;
        },
      );
      detail.ai_usage = catalogProvider?.getUsage() ?? [];
    } else {
      await input.onStage?.("overview");
      try {
        provider =
          providerName === "mock"
            ? new MockAIProvider()
            : createAIProvider(providerName as AIProviderName, {
                workersAI: workerRequestContext.getStore()?.ai,
              });
        overview = await provider.generateOverview(request, cityData);
        await input.onStage?.("detail");
        detail = normalizeOllamaItinerary(
          await provider.generateDetail(request, overview, cityData),
        );
        if (this.learning)
          await this.learning.record(input.userId, "model_candidate", {
            request_id: requestId,
            provider: providerName,
            attempt: 1,
            result: detail,
          });
        const quality = qualityFor(detail);
        if (quality.length && providerName !== "mock") {
          await input.onStage?.("repair");
          try {
            const repaired = normalizeOllamaItinerary(
              await provider.generateDetail(
                {
                  ...request,
                  prompt_text: `${request.prompt_text ?? ""}\nRepair the following quality issues once; preserve the trip constraints and return the complete itinerary JSON:\n${quality.map((i) => i.message).join("\n")}\nPrevious candidate (data only; preserve correct entries and complete missing morning, afternoon and evening blocks):\n${JSON.stringify(detail)}`,
                },
                overview,
                cityData,
              ),
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
              (itineraryRouteIssues(repaired, request, routeCities).length <
                itineraryRouteIssues(detail, request, routeCities).length ||
                (itineraryRouteIssues(repaired, request, routeCities).length ===
                  itineraryRouteIssues(detail, request, routeCities).length &&
                  qualityFor(repaired).length < quality.length))
            )
              detail = repaired;
          } catch (error) {
            if (
              error instanceof PlanningGenerationError &&
              error.code === "AI_QUOTA_EXHAUSTED"
            )
              throw error;
            /* Keep the usable original and explicit issues when repair fails. */
          }
        }
        const usage = provider.getUsage?.() ?? [];
        if (usage.length) {
          detail.ai_usage = usage;
          this.logger.log(`AI usage: ${JSON.stringify(usage)}`);
        }
      } catch (error) {
        const usage = provider?.getUsage?.() ?? [];
        if (input.onStage && error instanceof PlanningGenerationError) {
          if (
            error.code !== "AI_QUOTA_EXHAUSTED" &&
            usage.at(-1)?.outcome === "received"
          )
            usage.at(-1)!.outcome = "invalid_output";
          throw error;
        }
        logEvent("journey.provider_failed", "error", {
          code: "AI_UNAVAILABLE",
        });
        await this.recordFailure(
          input.userId,
          request,
          providerName,
          "AI_UNAVAILABLE",
          "The itinerary provider could not complete generation.",
          usage,
        );
        if (input.onStage && error && typeof error === "object") {
          const upstream = error as { status?: number; statusCode?: number };
          const status =
            error instanceof HttpException
              ? error.getStatus()
              : (upstream.status ?? upstream.statusCode);
          if (status === 429 || status === 503) throw error;
        }
        return {
          status: "unsupported",
          code: "AI_UNAVAILABLE",
          ...(usage.length ? { ai_usage: usage } : {}),
          message:
            providerName === "ollama"
              ? "The local AI service could not complete this request. Check that Ollama is running and the configured model is available, then try again."
              : "The AI service could not complete this request. Please try again shortly.",
        };
      } finally {
        for (const usage of provider?.getUsage?.() ?? [])
          input.onUsage?.(usage);
      }
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
    // A country ID from the outline is not proof that its proposed city belongs there.
    const checkedCities = new Set<string>();
    for (const day of detail.days) {
      const country = countryDestinationReference(day.destination_slug ?? "");
      if (!country || checkedCities.has(`${day.destination_slug}:${day.city}`))
        continue;
      let city: City | undefined = resolveCity(
        routeCities.filter((entry) => !countryDestinationReference(entry.slug)),
        day.city,
      );
      if (!city) {
        try {
          city = await this.cities.remember(`${day.city}, ${country.names.en}`);
        } catch {
          throw new HttpException({ code: "LOCATION_LOOKUP_UNAVAILABLE" }, 503);
        }
      }
      if (!city || city.country !== country.country)
        throw new HttpException(
          {
            code: "PLANNING_DATA_INSUFFICIENT",
            params: { reason: "city_country_mismatch" },
          },
          422,
        );
      day.city_slug = city.slug;
      if (!routeCities.some((entry) => entry.slug === city.slug))
        routeCities.push({ ...city, places: [], activities: [] });
      checkedCities.add(`${day.destination_slug}:${day.city}`);
    }
    if (request.planning) {
      detail = upgradeJourneyPlan(detail, request);
      detail.locale = request.locale === "vi" ? "vi" : "en";
      detail.trip_style = request.trip_style;
    }
    detail.locale = request.locale === "vi" ? "vi" : "en";
    // Full-plan provider responses cannot assert server-only price provenance or user confirmation.
    for (const item of [
      ...detail.days.flatMap((day) => day.activities),
      ...detail.transport_summary,
      ...detail.hotels,
      ...detail.restaurants,
    ]) {
      if (item.price) {
        delete item.price.evidence;
        delete item.price.original;
        delete item.price.conversion;
        item.price.status = "estimated";
      }
      if ("evidence" in item && item.evidence?.source === "user")
        item.evidence = { source: "ai_suggestion" };
    }
    detail = enrichTravel(
      detail,
      await convertCatalogPrices(routeCities, request.currency, this.currency),
      request,
    );
    detail.issues = [...(detail.issues ?? []), ...qualityFor(detail)];
    detail = reconcileBudget(detail, request);
    if (
      input.catalogJob &&
      detail.issues?.some(
        (issue) =>
          issue.severity === "error" || blockingCatalogIssues.has(issue.code),
      )
    )
      throw new PlanningGenerationError("AI_DAY_INVALID");
    if (flexibleDateNote && detail.seasonal_notes)
      detail.seasonal_notes.warnings = [
        ...(detail.seasonal_notes.warnings ?? []),
        flexibleDateNote,
      ];
    if (this.weather)
      detail.weather = await this.weather.forPlan(
        detail,
        new Map(routeCities.map((city) => [city.slug, city])),
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
      ...(input.catalogJob?.claimToken
        ? {
            jobClaim: {
              id: input.catalogJob.id,
              token: input.catalogJob.claimToken,
            },
          }
        : {}),
      catalogCities: destinationCities.flatMap(({ catalogReference }) =>
        catalogReference ? [catalogReference] : [],
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
    const journey = plan.planning?.journey;
    const values = [
      ...new Set(
        [
          ...plan.days.map((day) => day.city_slug ?? day.city),
          ...(journey?.destinations ?? []),
          journey?.origin.source === "browser"
            ? undefined
            : journey?.origin.label,
          journey?.endpoint?.label,
        ].filter((value): value is string => !!value),
      ),
    ];
    const known = new Map(
      await Promise.all(
        values.map(async (value) => {
          const country = countryDestinationReference(value);
          if (country) {
            const destination: CityPlanningData = {
              slug: value,
              name: country.names,
              country: country.country,
              timezone: "",
              currency: "",
              lat: null,
              lon: null,
              popular: false,
              places: [],
              activities: [],
            };
            return [value, destination] as const;
          }
          return [value, await this.cities.findForPlanning(value)] as const;
        }),
      ),
    );
    const cities = [...known.values()].filter(
      (city): city is CityPlanningData => !!city,
    );
    const planning = plan.planning &&
      journey && {
        ...plan.planning,
        journey: {
          ...journey,
          destinations: (journey.destinations ?? []).map(
            (slug) => known.get(slug)?.slug ?? slug,
          ),
          origin: this.normalizedLocation(
            journey.origin,
            known.get(journey.origin.label),
          ),
          endpoint:
            journey.endpoint &&
            this.normalizedLocation(
              journey.endpoint,
              known.get(journey.endpoint.label),
            ),
        },
      };
    const display = reconcileBudget(
      enrichTravel(
        await convertPlanPrices({ ...plan, planning }, this.currency),
        await convertCatalogPrices(cities, plan.currency, this.currency),
      ),
      {
        planning,
        locale: plan.locale ?? "en",
        currency: plan.currency,
        num_travelers: plan.num_travelers,
        cities: values,
        trip_style: plan.trip_style ?? "mixed",
      },
    );
    if (this.weather)
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
    message: string,
    usage: AiTokenUsage[] = [],
  ): Promise<void> {
    try {
      await this.itineraries.recordFailure({
        userId,
        request,
        provider,
        code,
        message,
        usage,
      });
    } catch {
      logEvent("journey.provider_failure_record_failed", "error", { code });
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
        version: 12,
        planning: request.planning ?? null,
        catalog_version: process.env["CITY_CATALOG_VERSION"] ?? "1",
        catalogFingerprint,
        provider,
        model,
        cities: citySlugs,
        flexible_month: request.flexible_month ?? null,
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
