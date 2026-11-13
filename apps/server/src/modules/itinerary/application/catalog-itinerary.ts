import { itineraryQuality } from "../enrichment/travel-enrichment.js";
import { createHash } from "node:crypto";
import {
  CloudflareAIProvider,
  PlanningGenerationError,
  prepareDailySlots,
} from "@travel/ai";
import type {
  Activity,
  AiTokenUsage,
  Itinerary,
  ItineraryDay,
  ItineraryInput,
  TransportMode,
} from "@travel/types";
import type { CityPlanningData } from "../../cities/domain/city.entity.js";

export type PlanningProgress = {
  seed?: string;
  dates?: {
    start: string;
    end: string;
    basis: "forecast" | "seasonal_or_unavailable";
  };
  cities?: string[];
  days: ItineraryDay[];
};
export type DayTemplate = {
  city_slug: string;
  place_ids: string[];
  activity_ids: string[];
  quality: number;
  verified_at: string;
};
export type CatalogJob = {
  id: string;
  claimToken?: string;
  progress: PlanningProgress;
  save: (progress: PlanningProgress) => Promise<void>;
  templates: (cities: string[]) => Promise<DayTemplate[]>;
  usage: (usage: AiTokenUsage, day?: number) => void;
};
type Slot = ReturnType<typeof prepareDailySlots>[number];
type Candidate = CityPlanningData["places"][number] & {
  amount: number | null;
  weight: number;
};
export const blockingCatalogIssues = new Set([
  "MEAL_MISSING",
  "ACTIVITIES_MISSING",
  "EVENING_MISSING",
  "HOTEL_RETURN_MISSING",
  "SCHEDULE_CONFLICT",
  "SCHEDULE_DETAILS_MISSING",
  "REPEATED_PLACE",
  "OVER_BUDGET",
]);
const stale = 180 * 86_400_000;
const trusted = (row: { source: string; last_verified_at?: string }) =>
  !["ai_generated", "user_submission", "user_added"].includes(row.source) &&
  Date.now() - Date.parse(row.last_verified_at ?? "") <= stale;
const key = (name: string) => name.trim().normalize("NFKC").toLowerCase();
const minutes = (value: string) =>
  Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
const draw = (seed: string) =>
  createHash("sha256").update(seed).digest().readUInt32BE() / 0x100000000;
const meal = (candidate: Candidate) =>
  ["food", "restaurant"].includes(candidate.category ?? "") ||
  candidate.type === "restaurant";

function matchesHours(place: Candidate, slot: Slot, date: string) {
  const hours = place.opening_hours ?? {};
  if (!Object.keys(hours).length) return true;
  if (!date) return false;
  const weekday = new Date(date + "T12:00:00Z").getUTCDay();
  const label = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ][weekday]!;
  const value = Object.entries(hours).find(
    ([name]) => name.toLowerCase() === label,
  )?.[1];
  if (!value) return false;
  if (/24 hours/i.test(value)) return true;
  return [...value.matchAll(/(\d\d:\d\d)\s*[-–]\s*(\d\d:\d\d)/g)].some(
    ([, start, end]) =>
      minutes(slot.time) >= minutes(start!) &&
      minutes(slot.time) + slot.duration_minutes <= minutes(end!),
  );
}

function choose(candidates: Candidate[], seed: string) {
  let offset =
    draw(seed) *
    candidates.reduce((total, candidate) => total + candidate.weight, 0);
  return (
    candidates.find((candidate) => (offset -= candidate.weight) < 0) ??
    candidates.at(-1)
  );
}

function activity(
  slot: Slot,
  input: ItineraryInput,
  name: string,
  description: string,
  amount: number | null,
  place?: Candidate,
): Activity {
  return {
    kind: slot.kind,
    meal_slot: slot.meal_slot,
    time: slot.time,
    duration: `${slot.duration_minutes} min`,
    duration_minutes: slot.duration_minutes,
    name,
    description,
    category:
      slot.kind === "visit"
        ? "attraction"
        : slot.kind === "meal" || slot.kind === "cafe"
          ? "food"
          : slot.kind === "check_in" || slot.kind === "check_out"
            ? "accommodation"
            : "transport",
    cost: amount,
    currency: input.currency,
    maps_link: "",
    price: {
      amount,
      currency: input.currency,
      scope:
        place ||
        slot.kind === "meal" ||
        slot.kind === "visit" ||
        slot.kind === "cafe"
          ? "person"
          : "group",
      status: "estimated",
      basis: "planning_estimate",
    },
    evidence: place
      ? {
          source: "catalog",
          source_id: place.id,
          verified_at: place.last_verified_at,
        }
      : { source: "ai_suggestion" },
  };
}

function gapSchema(slots: Slot[]) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["slots"],
    properties: {
      slots: {
        type: "object",
        additionalProperties: false,
        required: slots.map((slot) => slot.slot_id),
        properties: Object.fromEntries(
          slots.map((slot) => [
            slot.slot_id,
            {
              type: "object",
              additionalProperties: false,
              required: ["name", "description", "amount"],
              properties: {
                name: { type: "string" },
                description: { type: "string" },
                amount: { type: "number", minimum: 0 },
              },
            },
          ]),
        ),
      },
    },
  };
}

export async function buildCatalogItinerary(
  input: ItineraryInput,
  cities: CityPlanningData[],
  job: CatalogJob,
  provider: () => CloudflareAIProvider,
): Promise<Itinerary> {
  const criteria = input.planning!;
  const count = input.num_days ?? 1;
  const vi = input.locale === "vi";
  const progress = job.progress;
  progress.seed ??= job.id;
  if (!progress.cities) {
    if (cities.length === 0 || cities.length > count)
      throw new PlanningGenerationError("AI_OUTLINE_INVALID");
    progress.cities = Array.from(
      { length: count },
      (_, i) => cities[Math.floor((i * cities.length) / count)]!.slug,
    );
    await job.save(progress);
  }
  const templates = await job.templates(progress.cities);
  const used = new Set(
    progress.days.flatMap((day) =>
      day.activities
        .filter(
          (entry) =>
            entry.kind === "visit" ||
            entry.kind === "meal" ||
            entry.kind === "cafe",
        )
        .map((entry) => key(entry.name)),
    ),
  );
  const people = input.num_travelers;
  const stay = criteria.stay_preferences;
  const fixedTransport = criteria.transport_preferences.confirmed
    ? (criteria.transport_preferences.total_price ?? 0)
    : 0;
  const fixedStay =
    stay.type === "none"
      ? 0
      : (stay.nightly_budget ?? 0) * stay.rooms * Math.max(0, count - 1);
  const dayBudget =
    input.budget == null
      ? Infinity
      : Math.max(0, (input.budget / 1.1 - fixedTransport - fixedStay) / count);
  const pace = criteria.experience_preferences.pace;
  const visitCount = pace === "packed" ? 6 : pace === "relaxed" ? 3 : 4;
  const requires = criteria.experience_preferences.requirements;
  const dining = criteria.dining_preferences;
  for (const [index, slug] of progress.cities.entries()) {
    if (progress.days.some((day) => day.day_number === index + 1)) continue;
    const city = cities.find((item) => item.slug === slug);
    if (!city) throw new PlanningGenerationError("AI_OUTLINE_INVALID");
    const name = city.name[input.locale] ?? city.name.en ?? slug;
    const date = input.start_date
      ? new Date(
          Date.parse(input.start_date.slice(0, 10) + "T00:00:00Z") +
            index * 86_400_000,
        )
          .toISOString()
          .slice(0, 10)
      : "";
    const title = vi
      ? `Ngày ${index + 1} tại ${name}`
      : `Day ${index + 1} in ${name}`;
    const slots = prepareDailySlots(
      input,
      {
        day_number: index + 1,
        city: name,
        title,
        places: Array.from({ length: visitCount }, () => ""),
        all_day: false,
      },
      date,
    ).filter(
      (slot) =>
        stay.type !== "none" ||
        !["check_in", "check_out"].includes(slot.kind ?? ""),
    );
    for (let i = slots.length - 1; i >= 0; i--) {
      const slot = slots[i]!;
      if (
        slot.kind === "cafe" &&
        slots.some(
          (other) =>
            other.kind === "visit" &&
            minutes(other.time) < minutes(slot.time) + slot.duration_minutes &&
            minutes(slot.time) < minutes(other.time) + other.duration_minutes,
        )
      )
        slots.splice(i, 1);
    }
    const cityTemplates = templates.filter(
      (template) => template.city_slug === slug,
    );
    const catalog = city.places.filter(trusted).map((place): Candidate => {
      const match = city.activities.find(
        (entry) =>
          trusted(entry) &&
          key(entry.title) === key(place.name) &&
          entry.currency === input.currency &&
          (entry.estimated_cost == null || entry.estimated_cost >= 0),
      );
      const templateQuality = cityTemplates
        .filter(
          (template) =>
            (place.id && template.place_ids.includes(place.id)) ||
            (match?.id && template.activity_ids.includes(match.id)),
        )
        .reduce(
          (weight, template) =>
            Math.max(weight, Math.min(20, template.quality)),
          0,
        );
      const freshness = Math.max(
        0,
        1 - (Date.now() - Date.parse(place.last_verified_at!)) / stale,
      );
      return {
        ...place,
        amount: match?.estimated_cost ?? null,
        weight: 1 + freshness + templateQuality,
      };
    });
    const activities = new Map<string, Activity>();
    const gaps: Slot[] = [];
    let spent = 0;
    let previous: Candidate | undefined;
    for (const slot of slots) {
      if (
        slot.kind === "transfer" ||
        slot.kind === "check_in" ||
        slot.kind === "check_out"
      ) {
        const label =
          slot.place_name ||
          (slot.kind === "transfer"
            ? vi
              ? "Di chuyển trong thành phố"
              : "Local transfer"
            : (stay.booked_name ??
              (vi ? "Chỗ ở dự kiến" : "Planned accommodation")));
        const row = activity(
          slot,
          input,
          label,
          vi ? "Khung giờ dự kiến." : "Provisional time slot.",
          null,
        );
        row.evidence =
          stay.booked_name && slot.kind !== "transfer"
            ? { source: "user" }
            : undefined;
        activities.set(slot.slot_id, row);
        continue;
      }
      const candidates = catalog.filter((place) => {
        const rightType =
          slot.kind === "meal"
            ? meal(place)
            : slot.kind === "cafe"
              ? place.category === "cafe" || place.type === "cafe"
              : !meal(place) &&
                ![
                  "cafe",
                  "hotel",
                  "homestay",
                  "airport",
                  "train_station",
                  "bus_station",
                ].includes(place.category ?? "");
        if (
          !rightType ||
          used.has(key(place.name)) ||
          !matchesHours(place, slot, date)
        )
          return false;
        if (
          slot.kind === "meal" &&
          (dining.allergies.length ||
            dining.requirements.some((item) => item.priority === "required") ||
            (dining.independent_only && !place.tags.includes("independent")))
        )
          return false;
        if (
          slot.kind === "visit" &&
          requires.some(
            (item) =>
              item.priority === "required" &&
              !place.tags.some((tag) => key(tag) === key(item.value)),
          )
        )
          return false;
        if (
          slot.kind === "meal" &&
          dining.per_person_budget != null &&
          (place.amount == null || place.amount > dining.per_person_budget)
        )
          return false;
        if (
          Number.isFinite(dayBudget) &&
          (place.amount == null || spent + place.amount * people > dayBudget)
        )
          return false;
        if (
          previous?.lat != null &&
          previous.lon != null &&
          place.lat != null &&
          place.lon != null &&
          Math.hypot(
            place.lat - previous.lat,
            (place.lon - previous.lon) * Math.cos((place.lat * Math.PI) / 180),
          ) *
            111 >
            15
        )
          return false;
        return true;
      });
      const fromTemplate = candidates.filter((place) =>
        cityTemplates.some(
          (template) => place.id && template.place_ids.includes(place.id),
        ),
      );
      const picked = choose(
        fromTemplate.length ? fromTemplate : candidates,
        `${progress.seed}:${index}:${slot.slot_id}`,
      );
      if (!picked) {
        gaps.push(slot);
        continue;
      }
      activities.set(
        slot.slot_id,
        activity(
          slot,
          input,
          picked.name,
          vi
            ? `Điểm gợi ý tại ${name}. Hãy kiểm tra giờ mở cửa trước khi đến.`
            : `Suggested stop in ${name}. Check opening hours before visiting.`,
          picked.amount,
          picked,
        ),
      );
      used.add(key(picked.name));
      spent += (picked.amount ?? 0) * people;
      previous = picked;
    }
    if (gaps.length) {
      const ai = provider();
      let accepted = false;
      for (let pass = 0; pass < 2 && !accepted; pass++) {
        let valid = false;
        const before = ai.getUsage().length;
        try {
          const result = await ai.fillDay<{
            slots: Record<
              string,
              { name: string; description: string; amount: number }
            >;
          }>(
            `Fill ONLY the missing slots. Use local places in the specified city. Do not claim verification, opening hours or allergy safety. Prices are estimates per person in ${input.currency}. Do not repeat listed names.${pass ? " Previous attempt failed validation. Return exactly the requested slot keys and stay within budget." : ""}\n` +
              JSON.stringify({
                city: name,
                date,
                missing: gaps,
                existing: [...activities.values()].map((a) => ({
                  name: a.name,
                  time: a.time,
                })),
                visited: [...used].slice(-60),
                interests: criteria.experience_preferences.interests,
                requirements: requires,
                dining,
                remainingPerPerson: Number.isFinite(dayBudget)
                  ? Math.max(0, dayBudget - spent) / people
                  : undefined,
              }),
            input.locale,
            Math.min(3500, 320 * gaps.length + 200),
            gapSchema(gaps),
          );
          const additions = new Set<string>();
          let additionalCost = 0;
          valid =
            Object.keys(result.slots ?? {}).length === gaps.length &&
            gaps.every((slot) => {
              const row = result.slots?.[slot.slot_id];
              if (
                typeof row?.name !== "string" ||
                !row.name.trim() ||
                row.name.length > 200 ||
                typeof row.description !== "string" ||
                !row.description.trim() ||
                row.description.length > 1000 ||
                !Number.isFinite(row.amount) ||
                row.amount < 0 ||
                (slot.kind === "meal" &&
                  dining.per_person_budget != null &&
                  row.amount > dining.per_person_budget)
              )
                return false;
              const normalized = key(row.name);
              if (used.has(normalized) || additions.has(normalized))
                return false;
              additions.add(normalized);
              additionalCost += row.amount * people;
              return true;
            }) &&
            spent + additionalCost <= dayBudget;
          if (valid) {
            for (const slot of gaps) {
              const row = result.slots[slot.slot_id]!;
              activities.set(
                slot.slot_id,
                activity(slot, input, row.name, row.description, row.amount),
              );
            }
            for (const normalized of additions) used.add(normalized);
            accepted = true;
          }
        } catch (error) {
          if (
            ai.getUsage().at(-1)?.outcome !== "invalid_output" ||
            ai.getUsage().length === before
          )
            throw error;
        } finally {
          for (const usage of ai.getUsage().slice(before))
            job.usage(
              {
                ...usage,
                phase: pass ? "day_repair" : "day",
                outcome:
                  usage.outcome === "received" && !valid
                    ? "invalid_output"
                    : usage.outcome,
              },
              index + 1,
            );
        }
      }
      if (!accepted) throw new PlanningGenerationError("AI_DAY_INVALID");
    }
    const day: ItineraryDay = {
      day_number: index + 1,
      date,
      city: name,
      city_slug: slug,
      title,
      activities: [...activities.values()].sort((a, b) =>
        a.time.localeCompare(b.time),
      ),
      daily_cost_estimate: 0,
    };
    if (
      itineraryQuality({ days: [day] }, input).some((issue) =>
        blockingCatalogIssues.has(issue.code),
      )
    )
      throw new PlanningGenerationError("AI_DAY_INVALID");
    progress.days.push(day);
    await job.save(progress);
  }
  const endpoint = criteria.journey.return_to_origin
    ? criteria.journey.origin
    : criteria.journey.endpoint;
  const route = [
    criteria.journey.origin.label,
    ...cities.map((city) => city.slug),
    endpoint?.label,
  ].filter((value): value is string => !!value);
  const configuredMode = criteria.transport_preferences.mode;
  const mode = (
    configuredMode === "suggest" ? "other" : configuredMode
  ) as TransportMode;
  return {
    title: cities
      .map((city) => city.name[input.locale] ?? city.slug)
      .join(" → "),
    overview: vi
      ? "Lịch theo từng ngày. Kiểm tra giờ mở cửa và thời gian di chuyển trước khi đi."
      : "Day-by-day itinerary. Check opening hours and travel times before departure.",
    num_days: count,
    num_travelers: people,
    currency: input.currency,
    total_cost: 0,
    days: [...progress.days].sort((a, b) => a.day_number - b.day_number),
    hotels:
      stay.type === "none"
        ? []
        : [
            {
              name:
                stay.booked_name ??
                (vi ? "Chỗ ở dự kiến" : "Planned accommodation"),
              city: cities[0]?.slug,
              rooms: stay.rooms,
              nights: Math.max(0, count - 1),
              nightly_estimate: stay.nightly_budget,
              price_per_night: "",
              price_range: "",
              booking_url: "",
              airbnb_url: "",
              address: "",
              maps_link: "",
            },
          ],
    restaurants: [],
    suggestions: [],
    transport_summary: route.slice(1).flatMap((to, i) => {
      const from = route[i]!;
      return key(from) === key(to)
        ? []
        : [
            {
              segment: `${from} → ${to}`,
              from,
              to,
              recommended_mode: mode || "other",
              options: [],
            },
          ];
    }),
    seasonal_notes: {
      travel_month: "",
      daylight_hours: "",
      sunrise_time: "",
      sunset_time: "",
      weather_note: "",
      highlights: [],
      warnings: [],
    },
    budget_breakdown: {
      accommodation: 0,
      food: 0,
      activities: 0,
      transport: 0,
      contingency: 0,
      total: 0,
      currency: input.currency,
      per_person: 0,
      per_day: 0,
    },
  };
}
