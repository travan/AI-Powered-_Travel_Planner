import {
  BadRequestException,
  HttpException,
  Inject,
  Injectable,
} from "@nestjs/common";
import {
  createSupplementProvider,
  destinationContext,
  PlanningGenerationError,
  supplementConfig,
  type SupplementProvider,
} from "@travel/ai";
import type { AiTokenUsage, Itinerary, ItineraryInput } from "@travel/types";
import * as types from "@travel/types";
import { CitiesService } from "../../cities/application/cities.service.js";
import {
  ITINERARY_REPOSITORY,
  type ItineraryRepository,
} from "../domain/itinerary.repository.js";
import {
  SQL_CLIENT,
  type SqlClient,
} from "../../../database/database.tokens.js";
import { workerRequestContext } from "../../../cloudflare/request-context.js";
import { logEvent } from "../../../observability/logger.js";
import { GenerationStore } from "./generation.store.js";
import { generationInput, generationKey } from "./generation-input.js";
import { generationError } from "./generation-error.js";
import { fallbackAllowed, fallbackSources, simulateCanaryQuota, supplementWithFallback, type FallbackSource } from "./supplement-fallback.js";
import {
  prepareSnapshot,
  applySupplement,
  scheduleTravel,
  ensureMandatoryBudget,
  validateSupplementRequirements,
  type Snapshot,
  type Destination,
} from "./planning-data.js";
import { assembleDay, completePlan } from "./planning-assembler.js";
import type { GenerateItineraryDto } from "../dto/itinerary.dto.js";
const {
  countryDestinationReference,
  flexibleMonthWindows,
  plannerToday,
  validTripDate,
} = (types as unknown as { default?: typeof types }).default ?? types;

const supplementSchema = {
  type: "object",
  additionalProperties: false,
  required: ["cities", "items"],
  properties: {
    cities: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["destination", "name", "country"],
        properties: {
          destination: { type: "string" },
          name: { type: "string" },
          country: {
            type: "string",
            description:
              "ISO 3166-1 alpha-2 country code, never the full country name",
          },
        },
      },
    },
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["key", "name", "amount", "duration_minutes"],
        properties: {
          key: { type: "string" },
          name: {
            type: "string",
            description:
              "Specific venue or named area. Unverified stays must name a lodging district, never a generic hotel in a city.",
          },
          amount: { type: "number", minimum: 0 },
          duration_minutes: { type: "integer", minimum: 15, maximum: 1440 },
        },
      },
    },
  },
};

@Injectable()
export class CatalogFirstPlanner {
  constructor(
    @Inject(GenerationStore) private readonly store: GenerationStore,
    @Inject(CitiesService) private readonly cities: CitiesService,
    @Inject(ITINERARY_REPOSITORY)
    private readonly repository: ItineraryRepository,
    @Inject(SQL_CLIENT) private readonly sql: SqlClient,
  ) {}

  async generate(options: {
    userId: string;
    dto: GenerateItineraryDto;
    job: { id: string; generation_id: string; claim_token: string };
    onStage?: (stage: string) => Promise<void>;
    onUsage?: (entry: AiTokenUsage) => void;
  }) {
    const { job } = options;
    const cacheKey = `v2:${generationKey(options.dto)}`;
    let snapshot = await this.store.checkpoint<Partial<Snapshot>>(
      job.generation_id,
    );
    if (!snapshot?.version) {
      const input = generationInput(options.dto);
      await options.onStage?.("cache");
      if (!options.dto.force_refresh) {
        const hit = await this.repository.findReusable({
          userId: options.userId,
          cacheKey,
        });
        if (hit && this.reusable(hit.result, input))
          return {
            status: "cached" as const,
            itinerary_id: hit.id,
            result: hit.result,
            cache_hit: true,
          };
      }
      if (input.flexible_month) {
        const window = flexibleMonthWindows(
          input.flexible_month,
          input.num_days ?? 1,
          plannerToday(),
        )[0];
        if (!window)
          generationError("PLANNING_DATA_INSUFFICIENT", "no_available_dates");
        input.start_date = window.start;
        input.end_date = window.end;
      }
      await options.onStage?.("catalog");
      const destinations: Destination[] = [];
      for (const selected of input.cities) {
        const country = countryDestinationReference(selected);
        const reference = options.dto.destination_refs?.find(
          (r) => r.id === selected,
        );
        const available = country
          ? await this.cities.byCountry(country.country)
          : [];
        const candidates = country
          ? await Promise.all(
              available
                .slice(0, 12)
                .map((c) => this.cities.findForPlanning(c.slug, 300)),
            )
          : [await this.cities.findForPlanning(selected, 300)];
        const ranked = candidates
          .filter(
            (c): c is NonNullable<typeof c> =>
              !!c && (!country || c.country === country.country),
          )
          .sort(
            (a, b) =>
              b.places.length - a.places.length || a.slug.localeCompare(b.slug),
          );
        destinations.push({
          selected,
          country:
            country?.country ?? ranked[0]?.country ?? reference?.country ?? "",
          city: ranked[0],
        });
      }
      if (destinations.length > (input.num_days ?? 1))
        generationError(
          "PLANNING_DATA_INSUFFICIENT",
          "more_destinations_than_days",
        );
      const preferred = await this.sql.query<{ place_ids: string[] }>(
        "select place_ids from planning_day_templates where approved and verified_at>=now()-interval '180 days' and city_slug=any($1::text[]) order by quality desc limit 100",
        [destinations.flatMap((d) => (d.city ? [d.city.slug] : []))],
      );
      snapshot = prepareSnapshot(
        input,
        destinations,
        preferred.rows.flatMap((r) => r.place_ids),
      );
      snapshot.legacy_destination_only = !options.dto.planning;
      await this.store.save(
        job.generation_id,
        job.id,
        job.claim_token,
        snapshot,
      );
    }
    const state = snapshot as Snapshot;
    ensureMandatoryBudget(state);
    if (state.needs.length || state.destinations.some((d) => !d.city)) {
      await options.onStage?.("supplement");
      const schema = structuredClone(supplementSchema);
      const positiveKeys = state.needs
        .filter(
          (need) => need.kind !== "visit" && need.fixed_amount === undefined,
        )
        .map((need) => need.key);
      const zeroAllowedKeys = state.needs
        .filter(
          (need) => need.kind === "visit" || need.fixed_amount !== undefined,
        )
        .map((need) => need.key);
      if (state.needs.length) {
        Object.assign(schema.properties.items, {
          minItems: state.needs.length,
          maxItems: state.needs.length,
        });
        // Workers AI may decode only an anyOf branch. Each branch must be
        // a complete item schema, rather than partial dependent properties.
        const itemSchema = structuredClone(schema.properties.items.items);
        Object.assign(schema.properties.items.items, {
          anyOf: [
            ...(positiveKeys.length
              ? [
                  {
                    ...itemSchema,
                    properties: {
                      ...itemSchema.properties,
                      key: { type: "string", enum: positiveKeys },
                      amount: { type: "number", exclusiveMinimum: 0 },
                    },
                  },
                ]
              : []),
            ...(zeroAllowedKeys.length
              ? [
                  {
                    ...itemSchema,
                    properties: {
                      ...itemSchema.properties,
                      key: { type: "string", enum: zeroAllowedKeys },
                      amount: { type: "number", minimum: 0 },
                    },
                  },
                ]
              : []),
          ],
        });
      }
      if (state.destinations.every((destination) => destination.country)) {
        const countryField: { type: string; enum?: string[] } =
          schema.properties.cities.items.properties.country;
        countryField.enum = [
          ...new Set(
            state.destinations.map((destination) => destination.country),
          ),
        ];
      }
      const instruction =
        "For each leg item provide duration_minutes (15..1440), a conservative main travel duration allowance. Keep fixed_amount unchanged. " +
        "For a stay without fixed_name, name a real, specific lodging neighborhood/district within the selected city; never return 'Hotel in <city>' or claim an unverified property is booked. The amount is the room/night allowance in that area, not a property quote. For meals/cafes use a specific venue or named dining area. All sightseeing visits must be distinct real venues/areas across days, not repeated names or generic sightseeing. " +
        "Return cities only for destinations whose city is missing; otherwise cities=[]. cities[].country must be the exact two-letter ISO code from the destination context, never the country name. " +
        `Supply ONLY the missing planning data in JSON. Do not create a daily timeline. Use official venue names. Prices are realistic planning allowances in ${state.input.currency}, NOT verified quotes. Meals/visits/cafe/legs are per person; local travel is group/day; stay is room/night. Zero is allowed ONLY for a genuinely proposed free stop or an already included charge. Each key must occur exactly once; never change fixed_name. City proposals must belong to the named country and its ISO code. independent_only is a preference: suggest independent venues, but do not claim they are verified. Allergies and explicit required restrictions remain mandatory. Do not invent coordinates, addresses, providers or opening hours. Total group budget includes ALL people, main travel, rooms x nights, meals, activities, local travel and 10% contingency. Estimate every mandatory fare and stay independently at realistic positive prices even when their sum exceeds total_group_budget. The server decides budget feasibility. Never reduce or zero fares to fit the requested budget; an over-budget estimate is a valid response, free unconfirmed international travel is not.\n` +
        "";
      const context = {
        currency: state.input.currency,
        total_group_budget: state.input.budget,
        people: state.input.num_travelers,
        days: state.input.num_days,
        rooms: state.input.planning!.stay_preferences.rooms,
        destination_context: destinationContext(
          state.input,
          state.destinations.map((d) => ({
            id: d.selected,
            city: d.city?.name.en,
            country: d.country,
          })),
        ),
        journey: state.input.planning!.journey,
        selected_dates: {
          start: state.input.start_date,
          end: state.input.end_date,
        },
        destinations: state.destinations.map((d) => ({
          destination: d.selected,
          country: d.country,
          city: d.city?.name.en,
        })),
        missing: state.needs,
        retained: Object.values(state.items).map((item) => ({
          name: item.name,
          amount: item.amount,
          scope: item.scope,
        })),
        preferences: {
          dining: state.input.planning!.dining_preferences,
          stay: state.input.planning!.stay_preferences,
          experience: state.input.planning!.experience_preferences,
          prompt: state.input.prompt_text,
        },
      };
      const bytes = (value: string) =>
        new TextEncoder().encode(value + JSON.stringify(schema)).byteLength +
        512;
      let prompt = instruction + JSON.stringify(context);
      // Retained costs are useful context, but repeated daily entries are optional.
      context.retained = [
        ...new Map(
          context.retained.map((item) => [JSON.stringify(item), item]),
        ).values(),
      ];
      prompt = instruction + JSON.stringify(context);
      if (bytes(prompt) > 16000) {
        context.retained = [];
        prompt = instruction + JSON.stringify(context);
      }
      if (bytes(prompt) > 16000)
        generationError("PLANNING_DATA_INSUFFICIENT", "context_limit");
      const workerContext = workerRequestContext.getStore();
      const binding = workerContext?.rawAi ?? workerContext?.ai;
      let provider: SupplementProvider | undefined;
      let sources: FallbackSource[] = [];
      const raw = await this.store.once(
        job.generation_id,
        async (signal) => {
          provider ??= createSupplementProvider({
            workersAI: binding,
            config: state.ai_config,
          });
          let recorded = 0;
          return supplementWithFallback({
            primary: provider,
            fallbacks: sources.map((source) => ({ id: source.id, create: () => {
              const key = process.env[source.key_env]?.trim();
              if (!key) throw new HttpException({ code: "AI_PROVIDER_CONFIGURATION_INVALID" }, 503);
              return createSupplementProvider({ config: { provider: source.provider, model: source.model }, apiKey: key });
            }})),
            prompt, locale: state.input.locale, schema, signal,
            onUsage: async (usage) => {
              for (const item of usage.slice(recorded)) options.onUsage?.(item);
              recorded = usage.length;
              await this.store.recordUsage?.(job.generation_id, usage).catch(() => {});
            },
          });
        },
        () => {
          state.ai_config ??= supplementConfig();
          const allowFallback = fallbackAllowed(options.userId, process.env.AI_FALLBACK_CANARY_ONLY, process.env.PLANNING_CANARY_USER_IDS);
          sources = state.ai_config.provider === "cloudflare" && allowFallback ? fallbackSources(process.env.AI_FALLBACK_PROVIDERS).filter((source) => {
            if (process.env[source.key_env]?.trim()) return true;
            logEvent("journey.ai_fallback_unconfigured", "warn", { sourceId: source.id, code: "AI_PROVIDER_CONFIGURATION_INVALID" });
            return false;
          }) : [];
          provider = createSupplementProvider({
            workersAI: binding,
            config: state.ai_config,
          });
          if (state.ai_config.provider === "cloudflare" && sources.length && simulateCanaryQuota(options.userId, process.env))
            provider = {
              supplementRaw: async () => { throw new PlanningGenerationError("AI_QUOTA_EXHAUSTED", undefined, undefined, "cloudflare"); },
              getUsage: () => [{ operation: "detail", provider: "cloudflare", model: "canary-simulated-quota", input_tokens: null, output_tokens: null, total_tokens: null, outcome: "quota_rejected" }],
            };
        },
      );
      let response: unknown;
      try {
        response =
          typeof raw?.response === "string"
            ? JSON.parse(raw.response)
            : raw?.response;
        applySupplement(state, response);
      } catch (error) {
        if (error instanceof HttpException) throw error;
        generationError("AI_RESPONSE_INVALID", "supplement_invalid");
      }
      ensureMandatoryBudget(state);
      validateSupplementRequirements(state);
      const proposals = (
        response as {
          cities?: { destination: string; name: string; country: string }[];
        }
      ).cities;
      for (const dest of state.destinations) {
        if (dest.city) continue;
        const proposal = Array.isArray(proposals)
          ? proposals.find((p) => p.destination === dest.selected)
          : undefined;
        if (
          !proposal ||
          typeof proposal.name !== "string" ||
          !proposal.name.trim() ||
          typeof proposal.country !== "string" ||
          (dest.country && proposal.country !== dest.country)
        )
          generationError("AI_RESPONSE_INVALID", "city_proposal_invalid");
        let city;
        try {
          city = await this.cities.remember(
            `${proposal.name}, ${proposal.country}`,
          );
        } catch (error) {
          if (error instanceof BadRequestException)
            generationError(
              "PLANNING_DATA_INSUFFICIENT",
              "proposed_city_unresolved",
            );
          if (
            error instanceof HttpException &&
            [429, 503].includes(error.getStatus())
          )
            throw new HttpException(
              { code: "LOCATION_LOOKUP_UNAVAILABLE" },
              503,
            );
          throw error;
        }
        if (city.country !== proposal.country)
          generationError(
            "PLANNING_DATA_INSUFFICIENT",
            "city_country_mismatch",
          );
        dest.city = (await this.cities.findForPlanning(city.slug, 300)) ?? {
          ...city,
          places: [],
          activities: [],
        };
      }
      state.needs = [];
      await this.store.save(job.generation_id, job.id, job.claim_token, state);
    }
    await options.onStage?.("assembly");
    if (!options.dto.planning) {
      const first = state.destinations[0]!.city!,
        last = state.destinations.at(-1)!.city!;
      state.input.planning!.journey.origin = {
        label: first.name.en ?? first.slug,
        city_slug: first.slug,
        source: "manual",
      };
      state.input.planning!.journey.endpoint = {
        label: last.name.en ?? last.slug,
        city_slug: last.slug,
        source: "manual",
      };
    }
    try {
      scheduleTravel(state);
    } catch {
      generationError(
        "PLANNING_DATA_INSUFFICIENT",
        "main_travel_schedule_unavailable",
      );
    }
    for (const day of state.schedule) {
      if (state.days.some((done) => done.day_number === day.day)) continue;
      state.days.push(assembleDay(state, day));
      await this.store.save(job.generation_id, job.id, job.claim_token, state);
    }
    await options.onStage?.("validation");
    const result = completePlan(state);
    if (!options.dto.planning)
      result.issues!.push({
        code: "LEGACY_DESTINATION_ROUTE",
        severity: "warning",
        message:
          state.input.locale === "vi"
            ? "Đầu vào cũ chỉ mô tả hành trình trong các điểm đến; chi phí đi/về từ nơi xuất phát bên ngoài chưa nằm trong phạm vi. Ngày bắt đầu mặc định là hôm nay nếu chưa chọn ngày."
            : "Legacy input covers travel within selected destinations. External outbound/return travel is outside this scope. Dates default to today when unspecified.",
      });
    result.generation_cache_key = cacheKey;
    await options.onStage?.("persist");
    const id = await this.repository.createComplete({
      userId: options.userId,
      request: state.input,
      result,
      catalogCities: [],
      jobClaim: {
        id: job.id,
        token: job.claim_token,
        completeAtomically: true,
      },
    });
    return {
      status: "cached" as const,
      itinerary_id: id,
      result,
      cache_hit: false,
    };
  }
  private reusable(plan: Itinerary, input: ItineraryInput) {
    return (
      plan.days.length === (input.num_days ?? 1) &&
      !plan.issues?.some(
        (i) =>
          i.severity === "error" ||
          ["OVER_BUDGET", "BUDGET_INCOMPLETE"].includes(i.code),
      ) &&
      plan.days.every(
        (d) =>
          typeof d.date === "string" &&
          validTripDate(d.date) &&
          d.date >= plannerToday() &&
          (!input.flexible_month || d.date.startsWith(input.flexible_month)),
      )
    );
  }
}
