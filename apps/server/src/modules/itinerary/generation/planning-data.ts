import type { ItineraryInput, ItineraryDay } from "@travel/types";
import { prepareDailySlots } from "@travel/ai";
import * as types from "@travel/types";
import type { CityPlanningData } from "../../cities/domain/city.entity.js";
import { generationError } from "./generation-error.js";
const { placeKey } =
  (types as unknown as { default?: typeof types }).default ?? types;

function venueName(value: string) {
  return value
    .trim()
    .replace(
      /^(?:visit|explore|discover|night walk (?:at|in)|enjoy the nightlife at|breakfast at|lunch at|dinner at|coffee at|tham quan|khám phá|dạo bộ tại)\s+/iu,
      "",
    );
}
export function venueIdentity(value: string) {
  return placeKey(venueName(value).replace(/^(?:công viên|park|the)\s+/iu, ""));
}

export type Destination = {
  selected: string;
  country: string;
  city?: CityPlanningData;
};
export type Need = {
  key: string;
  destination: string;
  kind: "visit" | "meal" | "cafe" | "stay" | "local" | "leg";
  day?: number;
  meal?: string;
  from?: string;
  to?: string;
  fixed_name?: string;
  fixed_amount?: number;
};
export type Item = {
  duration_minutes?: number;
  name: string;
  amount: number | null;
  source: "catalog" | "user" | "ai_suggestion";
  assumption: string;
  id?: string;
  verified_at?: string;
  scope: "person" | "group" | "room_night";
  hours?: Record<string, string>;
  tags?: string[];
};
export type Slot = ReturnType<typeof prepareDailySlots>[number];
export type SlotDay = {
  day: number;
  date: string;
  destination: string;
  slots: (Slot & {
    itemKey?: string;
    coveredBy?: string;
    displayName?: string;
  })[];
};
export type Snapshot = {
  input: ItineraryInput;
  destinations: Destination[];
  items: Record<string, Item>;
  needs: Need[];
  schedule: SlotDay[];
  days: ItineraryDay[];
  legs: Need[];
  version: 2;
  ai_config?: import("@travel/ai").SupplementConfig;
  legacy_destination_only?: boolean;
  travel_scheduled?: boolean;
};
const trusted = (value: { source: string; last_verified_at?: string }) =>
  !["ai_generated", "user_added", "user_submission"].includes(value.source) &&
  !!value.last_verified_at &&
  Date.parse(value.last_verified_at) <= Date.now() &&
  Date.now() - Date.parse(value.last_verified_at) <= 180 * 86400000;

export function matchesHours(
  hours: Record<string, string> | undefined,
  slot: Slot,
  date: string,
): boolean {
  if (!hours || !Object.keys(hours).length) return true;
  const weekday = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ][new Date(`${date}T12:00:00Z`).getUTCDay()];
  const value = Object.entries(hours).find(
    ([name]) => name.toLowerCase() === weekday,
  )?.[1];
  if (!value) return false;
  if (/24 hours/i.test(value)) return true;
  const minute = (s: string) =>
    Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
  return [...value.matchAll(/(\d\d:\d\d)\s*[-–]\s*(\d\d:\d\d)/g)].some(
    ([, a, b]) =>
      minute(slot.time) >= minute(a!) &&
      minute(slot.time) + slot.duration_minutes <= minute(b!),
  );
}

export function prepareSnapshot(
  input: ItineraryInput,
  destinations: Destination[],
  preferredIds: string[] = [],
): Snapshot {
  const snapshot: Snapshot = {
    version: 2,
    input,
    destinations,
    items: {},
    needs: [],
    schedule: [],
    days: [],
    legs: [],
  };
  const criteria = input.planning!;
  const preferred = new Set(preferredIds);
  // Build indexes once per city rather than sorting/scanning the full catalog per slot.
  const catalogs = new Map(
    destinations.map((dest) => {
      const prices = new Map<string, number>();
      for (const activity of dest.city?.activities ?? []) {
        if (
          !trusted(activity) ||
          activity.currency !== input.currency ||
          activity.estimated_cost == null ||
          activity.estimated_cost < 0
        )
          continue;
        const key = placeKey(activity.title);
        prices.set(
          key,
          Math.min(prices.get(key) ?? Infinity, activity.estimated_cost),
        );
      }
      const cost = (name: string) => prices.get(placeKey(name));
      const places = (dest.city?.places ?? [])
        .filter(trusted)
        .sort(
          (a, b) =>
            Number(cost(b.name) !== undefined) -
              Number(cost(a.name) !== undefined) ||
            (cost(a.name) ?? Infinity) - (cost(b.name) ?? Infinity) ||
            Number(preferred.has(b.id ?? "")) -
              Number(preferred.has(a.id ?? "")) ||
            (a.id ?? a.name).localeCompare(b.id ?? b.name),
        );
      return [dest.selected, { places, cost }] as const;
    }),
  );
  const count = input.num_days ?? 1;
  const visits =
    criteria.experience_preferences.pace === "packed"
      ? 6
      : criteria.experience_preferences.pace === "relaxed"
        ? 3
        : 4;
  const used = new Set<string>();
  const add = (need: Need, item?: Item) => {
    if (
      snapshot.items[need.key] ||
      snapshot.needs.some((n) => n.key === need.key)
    )
      return;
    if (item) snapshot.items[need.key] = item;
    if (item?.amount == null || (need.kind === "leg" && !item.duration_minutes))
      snapshot.needs.push({
        ...need,
        ...(item ? { fixed_name: item.name } : {}),
        ...(item?.amount != null ? { fixed_amount: item.amount } : {}),
      });
  };
  for (let i = 0; i < count; i++) {
    const dest = destinations[Math.floor((i * destinations.length) / count)]!;
    const date = input.start_date
      ? new Date(Date.parse(`${input.start_date}T00:00:00Z`) + i * 86400000)
          .toISOString()
          .slice(0, 10)
      : "";
    const slots = prepareDailySlots(
      input,
      {
        day_number: i + 1,
        city: dest.city?.name.en ?? dest.selected,
        title: "",
        places: Array(visits).fill(""),
        all_day: false,
      },
      date,
    ).filter(
      (s) =>
        (criteria.stay_preferences.type !== "none" && count > 1) ||
        !["check_in", "check_out"].includes(s.kind ?? ""),
    );
    const schedule: SlotDay = {
      day: i + 1,
      date,
      destination: dest.selected,
      slots: [],
    };
    for (const slot of slots) {
      let kind: Need["kind"] | undefined;
      if (slot.kind === "visit") kind = "visit";
      else if (slot.kind === "meal") kind = "meal";
      else if (slot.kind === "cafe") kind = "cafe";
      else if (slot.slot_id === "local_transport") kind = "local";
      if (!kind) {
        schedule.slots.push(slot);
        continue;
      }
      let key =
        kind === "visit"
          ? `${dest.selected}/${i + 1}/${slot.slot_id}`
          : `${dest.selected}/${kind}/${slot.meal_slot ?? "daily"}`;
      // A venue reusable on Monday may be closed on the next day.
      if (
        snapshot.items[key] &&
        !matchesHours(snapshot.items[key]!.hours, slot, date)
      )
        key = `${key}/${i + 1}`;
      const need: Need = {
        key,
        destination: dest.selected,
        kind,
        day: i + 1,
        meal: slot.meal_slot,
      };
      let item: Item | undefined;
      if (kind === "local") {
        const price = dest.city?.activities.find(
          (a) =>
            trusted(a) &&
            a.category === "transport" &&
            a.tags.includes("local_transport") &&
            a.currency === input.currency &&
            a.estimated_cost !== null &&
            a.estimated_cost >= 0,
        );
        if (price)
          item = {
            name: price.title,
            amount: price.estimated_cost,
            source: "catalog",
            id: price.id,
            verified_at: price.last_verified_at,
            scope: "group",
            assumption:
              "Catalog allowance for all local rides for the group this day.",
          };
      }
      const pool =
        kind === "meal" && criteria.dining_preferences.independent_only
          ? [...catalogs.get(dest.selected)!.places].sort(
              (a, b) =>
                Number(b.tags.includes("independent")) -
                Number(a.tags.includes("independent")),
            )
          : catalogs.get(dest.selected)!.places;
      if (!snapshot.items[key] && !item) {
        const picked = pool.find((p) => {
          const category = p.category ?? p.type;
          const right =
            kind === "meal"
              ? ["restaurant", "food"].includes(category)
              : kind === "cafe"
                ? category === "cafe"
                : kind === "visit"
                  ? ![
                      "restaurant",
                      "food",
                      "cafe",
                      "hotel",
                      "homestay",
                      "airport",
                      "bus_station",
                      "train_station",
                    ].includes(category)
                  : false;
          if (!right || !matchesHours(p.opening_hours, slot, date))
            return false;
          const price = catalogs.get(dest.selected)!.cost(p.name);
          if (
            kind === "meal" &&
            criteria.dining_preferences.per_person_budget !== undefined &&
            price != null &&
            price > criteria.dining_preferences.per_person_budget
          )
            return false;
          if (
            kind === "visit" &&
            (used.has(`${dest.selected}:${p.id ?? placeKey(p.name)}`) ||
              used.has(`${dest.selected}:name:${placeKey(p.name)}`))
          )
            return false;
          const requirements =
            kind === "meal"
              ? criteria.dining_preferences.requirements
              : criteria.experience_preferences.requirements;
          if (
            requirements.some(
              (r) =>
                r.priority === "required" &&
                !p.tags.some((tag) => placeKey(tag) === placeKey(r.value)),
            )
          )
            return false;
          if (kind === "meal" && criteria.dining_preferences.allergies.length)
            return false;
          return true;
        });
        if (picked) {
          const price = catalogs.get(dest.selected)!.cost(picked.name);
          item = {
            name: picked.name,
            amount: typeof price === "number" && price >= 0 ? price : null,
            source: "catalog",
            id: picked.id,
            verified_at: picked.last_verified_at,
            scope: "person",
            assumption: "Catalog planning estimate; confirm the current price.",
            hours: picked.opening_hours,
            tags: picked.tags,
          };
          if (kind === "visit") {
            used.add(`${dest.selected}:${picked.id ?? placeKey(picked.name)}`);
            used.add(`${dest.selected}:name:${placeKey(picked.name)}`);
          }
        }
      }
      add(need, item);
      schedule.slots.push({ ...slot, itemKey: key });
    }
    snapshot.schedule.push(schedule);
  }
  if (criteria.stay_preferences.type !== "none") {
    for (const dest of destinations) {
      if (
        !snapshot.schedule
          .slice(0, -1)
          .some((d) => d.destination === dest.selected)
      )
        continue;
      const stay = criteria.stay_preferences;
      const nightlyCost = catalogs.get(dest.selected)!.cost;
      const hotel = catalogs
        .get(dest.selected)!
        .places.find(
          (p) =>
            ["hotel", "homestay"].includes(p.category ?? p.type) &&
            (!stay.booked_name ||
              placeKey(p.name) === placeKey(stay.booked_name)) &&
            (stay.booked_name ||
              stay.nightly_budget === undefined ||
              nightlyCost(p.name) == null ||
              nightlyCost(p.name)! <= stay.nightly_budget) &&
            stay.requirements.every(
              (r) =>
                r.priority !== "required" ||
                p.tags.some((tag) => placeKey(tag) === placeKey(r.value)),
            ),
        );
      const amount = (hotel ? nightlyCost(hotel.name) : undefined) ?? null;
      const name = stay.booked_name ?? hotel?.name;
      add(
        {
          key: `${dest.selected}/stay`,
          destination: dest.selected,
          kind: "stay",
        },
        name
          ? {
              name,
              amount,
              source: stay.booked_name ? "user" : "catalog",
              id: hotel?.id,
              scope: "room_night",
              assumption:
                "Planning allowance per room per night; confirm taxes and availability.",
            }
          : undefined,
      );
    }
  }
  const origin = criteria.journey.origin.label;
  const end = (
    criteria.journey.return_to_origin
      ? criteria.journey.origin
      : criteria.journey.endpoint
  )?.label;
  const stops = [origin, ...destinations.map((d) => d.selected), end].filter(
    (s): s is string => !!s,
  );
  for (let i = 1; i < stops.length; i++) {
    const from = stops[i - 1]!,
      to = stops[i]!;
    if (placeKey(from) === placeKey(to)) continue;
    const leg: Need = {
      key: `leg/${i}`,
      destination:
        destinations.find((d) => d.selected === to)?.selected ??
        destinations.at(-1)!.selected,
      kind: "leg",
      from,
      to,
    };
    snapshot.legs.push(leg);
    const confirmed = criteria.transport_preferences.confirmed
      ? criteria.transport_preferences.total_price
      : undefined;
    const fromKey =
      destinations.find((d) => d.selected === from)?.city?.slug ??
      placeKey(from);
    const toKey =
      destinations.find((d) => d.selected === to)?.city?.slug ?? placeKey(to);
    const estimate = destinations
      .flatMap((d) => d.city?.activities ?? [])
      .find(
        (a) =>
          trusted(a) &&
          a.category === "transport" &&
          a.tags.includes(`route:${fromKey}:${toKey}`) &&
          a.currency === input.currency &&
          a.estimated_cost !== null &&
          a.estimated_cost >= 0,
      );
    add(
      leg,
      confirmed !== undefined
        ? {
            name: `${from} → ${to}`,
            amount: i === 1 ? confirmed : 0,
            duration_minutes: estimate?.duration_minutes ?? undefined,
            scope: "group",
            source: "user",
            assumption:
              i === 1
                ? "Confirmed group travel total for all main legs."
                : "Included in the confirmed group total on the first leg.",
          }
        : estimate
          ? {
              name: estimate.title,
              amount: estimate.estimated_cost,
              duration_minutes: estimate.duration_minutes ?? undefined,
              scope: "person",
              source: "catalog",
              assumption:
                "Catalog planning allowance for this main route per person; confirm current prices.",
            }
          : undefined,
    );
  }
  return snapshot;
}

export function applySupplement(snapshot: Snapshot, response: unknown) {
  if (
    !response ||
    typeof response !== "object" ||
    !Array.isArray((response as { items?: unknown }).items)
  )
    throw new Error("invalid supplement");
  const rows = (response as { items: unknown[] }).items;
  for (const need of snapshot.needs) {
    const matches = rows.filter(
      (r): r is Record<string, unknown> =>
        !!r &&
        typeof r === "object" &&
        (r as { key?: unknown }).key === need.key,
    );
    const row = matches[0];
    if (
      matches.length !== 1 ||
      !row ||
      typeof row.name !== "string" ||
      !row.name.trim() ||
      row.name.length > 200 ||
      typeof row.amount !== "number" ||
      !Number.isFinite(row.amount) ||
      row.amount < 0
    )
      throw new Error("invalid supplement item");
    if (
      row.amount === 0 &&
      need.fixed_amount === undefined &&
      need.kind !== "visit"
    )
      throw new Error("missing mandatory cost");
    const old = snapshot.items[need.key];
    if (
      need.kind === "leg" &&
      (!Number.isInteger(row.duration_minutes) ||
        Number(row.duration_minutes) < 15 ||
        Number(row.duration_minutes) > 1440)
    )
      throw new Error("main travel duration missing");
    const planning = snapshot.input.planning!;
    if (
      need.kind === "meal" &&
      planning.dining_preferences.per_person_budget !== undefined &&
      row.amount > planning.dining_preferences.per_person_budget
    )
      generationError("PLANNING_BUDGET_UNSATISFIABLE", "meal_budget_exceeded");
    if (
      need.kind === "stay" &&
      planning.stay_preferences.nightly_budget !== undefined &&
      row.amount > planning.stay_preferences.nightly_budget
    )
      generationError(
        "PLANNING_BUDGET_UNSATISFIABLE",
        "nightly_budget_exceeded",
      );
    snapshot.items[need.key] = {
      ...old,
      name:
        old?.name ??
        (["visit", "meal", "cafe", "stay"].includes(need.kind)
          ? venueName(row.name)
          : row.name.trim()),
      amount: old?.amount ?? row.amount,
      ...(need.kind === "leg"
        ? { duration_minutes: Number(row.duration_minutes) }
        : {}),
      source: "ai_suggestion",
      scope:
        old?.scope ??
        (need.kind === "local"
          ? "group"
          : need.kind === "stay"
            ? "room_night"
            : "person"),
      assumption:
        "Unverified AI planning allowance, not a quote; confirm before booking.",
    };
  }
}

export function validateSupplementRequirements(snapshot: Snapshot) {
  for (const need of snapshot.needs) {
    const item = snapshot.items[need.key];
    if (item?.id || !["visit", "meal", "cafe", "stay"].includes(need.kind))
      continue;
    if (
      !item ||
      /^(?:(?:a|an|the)\s+)?(?:(?:local|nearby|mid[- ]range)\s+)*(?:restaurant|caf[eé]|hotel|coffee\s+break)(?:\s+(?:in|near|at|around)\s+.+)?$/iu.test(
        item.name,
      ) ||
      /^(?:nhà hàng|quán ăn|quán cà phê|khách sạn)(?:\s+(?:địa phương|gần|tại|ở).*)?$/iu.test(
        item.name,
      )
    )
      generationError("PLANNING_DATA_INSUFFICIENT", "proposal_name_unspecific");
  }
  // Proposed names are not proof of compliance with a required restriction.
  if (
    snapshot.input.planning!.stay_preferences.requirements.some(
      (r) => r.priority === "required",
    ) &&
    snapshot.needs.some((n) => n.kind === "stay" && !snapshot.items[n.key]?.id)
  )
    generationError("PLANNING_DATA_INSUFFICIENT", "required_stay_unverified");
  if (
    snapshot.input.planning!.experience_preferences.requirements.some(
      (r) => r.priority === "required",
    ) &&
    snapshot.needs.some((n) => n.kind === "visit" && !snapshot.items[n.key]?.id)
  )
    generationError(
      "PLANNING_DATA_INSUFFICIENT",
      "required_experience_unverified",
    );
  if (
    (snapshot.input.planning!.dining_preferences.allergies.length ||
      snapshot.input.planning!.dining_preferences.requirements.some(
        (r) => r.priority === "required",
      )) &&
    snapshot.needs.some((n) => n.kind === "meal" && !snapshot.items[n.key]?.id)
  )
    generationError("PLANNING_DATA_INSUFFICIENT", "required_dining_unverified");
}

export function ensureMandatoryBudget(snapshot: Snapshot) {
  if (snapshot.input.budget === undefined) return;
  const people = snapshot.input.num_travelers;
  let minimum = 0;
  for (const leg of snapshot.legs) {
    const item = snapshot.items[leg.key];
    if (item?.amount != null)
      minimum += item.amount * (item.scope === "person" ? people : 1);
  }
  for (const dest of snapshot.destinations) {
    const item = snapshot.items[`${dest.selected}/stay`];
    if (item?.amount != null)
      minimum +=
        item.amount *
        snapshot.input.planning!.stay_preferences.rooms *
        snapshot.schedule
          .slice(0, -1)
          .filter((d) => d.destination === dest.selected).length;
  }
  if (minimum * 1.1 > snapshot.input.budget)
    generationError(
      "PLANNING_BUDGET_UNSATISFIABLE",
      "mandatory_travel_and_stay_exceed_budget",
    );
}

/** Reserve main travel before placing sightseeing; charges stay in transport_summary. */
export function scheduleTravel(snapshot: Snapshot) {
  if (snapshot.travel_scheduled) return;
  const minutes = (time: string) =>
    Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
  const clock = (value: number) =>
    `${Math.floor(value / 60)
      .toString()
      .padStart(2, "0")}:${(value % 60).toString().padStart(2, "0")}`;
  for (const leg of snapshot.legs) {
    const item = snapshot.items[leg.key];
    const duration = item?.duration_minutes;
    if (!duration || duration < 15 || duration > 1440)
      throw new Error("main travel duration missing");
    const target = snapshot.schedule.find((d) => d.destination === leg.to);
    const day = target ?? snapshot.schedule.at(-1)!;
    const incoming = !!target;
    const transport = snapshot.input.planning!.transport_preferences;
    // Unconfirmed return travel must finish within the trip's final day.
    let start = incoming ? 8 * 60 + 30 : Math.min(19 * 60, 24 * 60 - duration);
    if (
      incoming &&
      snapshot.schedule.indexOf(day) === 0 &&
      transport.arrival_at?.startsWith(day.date)
    )
      start = minutes(transport.arrival_at.slice(11, 16)) - duration;
    if (!incoming && transport.departure_at?.startsWith(day.date))
      start = minutes(transport.departure_at.slice(11, 16));
    if (start < 0 || start + duration > 24 * 60)
      throw new Error("main travel does not fit the travel day");
    const transfer: SlotDay["slots"][number] = {
      slot_id: leg.key,
      time: clock(start),
      duration_minutes: duration,
      kind: "transfer",
      coveredBy: leg.key,
      displayName: `${snapshot.input.locale === "vi" ? "Chặng chính" : "Main travel"}: ${item!.name}`,
    };
    if (incoming) {
      if (
        snapshot.items[`${day.destination}/stay`] &&
        !day.slots.some((s) => s.kind === "check_in")
      )
        day.slots.splice(
          day.slots.findIndex((s) => s.slot_id === "afternoon_1"),
          0,
          {
            slot_id: "check_in",
            kind: "check_in",
            time: "14:00",
            duration_minutes: 30,
          },
        );
      let next = start + duration + 15;
      // Arrival-day meals remain present; all times are provisional local allowances.
      const kept: SlotDay["slots"] = [];
      const confirmedArrival =
        snapshot.schedule.indexOf(day) === 0 &&
        transport.arrival_at?.startsWith(day.date);
      const optional = (slot: SlotDay["slots"][number]) =>
        slot.kind === "cafe" ||
        (slot.kind === "visit" && slot.slot_id !== "evening");
      for (const [slotIndex, slot] of day.slots.entries()) {
        if (slot.kind === "check_out") continue;
        if (
          slot.meal_slot === "breakfast" &&
          minutes(slot.time) + slot.duration_minutes <= start
        ) {
          if (!confirmedArrival)
            kept.push({
              ...slot,
              displayName:
                snapshot.input.locale === "vi"
                  ? "Ăn sáng tại nơi xuất phát (chi phí dự trù, cần xác nhận)"
                  : "Breakfast at departure (provisional allowance; confirm locally)",
            });
          continue;
        }
        if (slot.kind === "visit" && minutes(slot.time) < start + duration + 15)
          continue;
        const time = Math.max(
          minutes(slot.time),
          next,
          slot.kind === "check_in" ? 14 * 60 : 0,
        );
        // Optional stops must leave room for meals, check-in and the hotel return.
        const requiredAfter = day.slots
          .slice(slotIndex + 1)
          .filter((s) => s.kind !== "check_out" && !optional(s));
        const reserve = requiredAfter.reduce(
          (sum, s) => sum + s.duration_minutes + 15,
          0,
        );
        if (optional(slot) && time + slot.duration_minutes + reserve > 22 * 60)
          continue;
        if (time + slot.duration_minutes > 22 * 60) {
          if (slot.kind === "visit" || slot.kind === "cafe") continue;
          throw new Error("arrival day cannot fit required meals and rest");
        }
        kept.push({ ...slot, time: clock(time) });
        next = time + slot.duration_minutes + 15;
      }
      const stay = snapshot.items[`${day.destination}/stay`];
      if (stay && !kept.some((s) => s.kind === "check_in")) {
        const time = kept.at(-1)
          ? minutes(kept.at(-1)!.time) + kept.at(-1)!.duration_minutes
          : next;
        if (time + 30 > 23 * 60)
          throw new Error("check-in cannot fit arrival day");
        kept.push({
          slot_id: "check_in",
          kind: "check_in",
          time: clock(Math.max(14 * 60, time)),
          duration_minutes: 30,
          displayName: stay.name,
        });
      }
      const index = snapshot.schedule.indexOf(day);
      if (
        index > 0 &&
        snapshot.input.planning!.stay_preferences.type !== "none"
      ) {
        const previous = snapshot.schedule[index - 1]!;
        const previousStay = snapshot.items[`${previous.destination}/stay`];
        kept.unshift({
          slot_id: "check_out",
          kind: "check_out",
          time: clock(start - 15),
          duration_minutes: 15,
          displayName: previousStay?.name,
        });
      }
      day.slots = [...kept, transfer].sort(
        (a, b) => minutes(a.time) - minutes(b.time),
      );
    } else {
      if (!transport.departure_at?.startsWith(day.date)) {
        // Allow an early dinner before a long provisional return journey.
        // Confirmed departures are never moved to make a template fit.
        const dinner = day.slots.find((s) => s.meal_slot === "dinner");
        if (dinner && minutes(dinner.time) + dinner.duration_minutes > start) {
          const dinnerStart = start - dinner.duration_minutes;
          if (dinnerStart >= 17 * 60) {
            dinner.time = clock(dinnerStart);
            day.slots = day.slots.filter(
              (s) =>
                s === dinner ||
                minutes(s.time) + s.duration_minutes <= dinnerStart - 15 ||
                minutes(s.time) >= start,
            );
          }
        }
      }
      day.slots = day.slots.filter(
        (s) =>
          s.slot_id !== "return" &&
          minutes(s.time) + s.duration_minutes <=
            start -
              (transport.departure_at?.startsWith(day.date)
                ? transport.airport_buffer_minutes
                : 0),
      );
      day.slots.push(transfer);
    }
  }
  snapshot.travel_scheduled = true;
}
