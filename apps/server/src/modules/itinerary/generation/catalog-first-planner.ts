import {
  BadRequestException,
  HttpException,
  Inject,
  Injectable,
} from "@nestjs/common";
import {
  createSupplementProvider,
  destinationContext,
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
import { GenerationStore } from "./generation.store.js";
import { generationInput, generationKey } from "./generation-input.js";
import { generationError } from "./generation-error.js";
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
          country: { type: "string" },
        },
      },
    },
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["key", "name", "amount"],
        properties: {
          key: { type: "string" },
          name: { type: "string" },
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
      const instruction =
        "For each leg item provide duration_minutes (15..1440), a conservative main travel duration allowance. Keep fixed_amount unchanged. " +
        `Supply ONLY the missing planning data in JSON. Do not create a daily timeline. Use official venue names. Prices are realistic planning allowances in ${state.input.currency}, NOT verified quotes. Meals/visits/cafe/legs are per person; local travel is group/day; stay is room/night. Zero is allowed ONLY for a genuinely proposed free stop or an already included charge. Each key must occur exactly once; never change fixed_name. City proposals must belong to the named country and its ISO code. independent_only is a preference: suggest independent venues, but do not claim they are verified. Allergies and explicit required restrictions remain mandatory. Do not invent coordinates, addresses, providers or opening hours. Total group budget includes ALL people, main travel, rooms x nights, meals, activities, local travel and 10% contingency. If impossible, return no fabricated cheap prices.\n` +
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
        new TextEncoder().encode(value + JSON.stringify(supplementSchema))
          .byteLength + 512;
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
      const raw = await this.store.once(
        job.generation_id,
        async () => {
          provider ??= createSupplementProvider({
            workersAI: binding,
            config: state.ai_config,
          });
          try {
            return await provider.supplementRaw(
              prompt,
              state.input.locale,
              supplementSchema,
            );
          } finally {
            for (const usage of provider.getUsage()) options.onUsage?.(usage);
            await this.store
              .recordUsage?.(job.generation_id, provider.getUsage())
              .catch(() => {});
          }
        },
        () => {
          state.ai_config ??= supplementConfig();
          provider = createSupplementProvider({
            workersAI: binding,
            config: state.ai_config,
          });
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
