import { hasPriceEvidence, currentCatalogPrice } from "@travel/types";
import { catalogPrice } from "./catalog-prices.js";
import type {
  BookingLink,
  BudgetItem,
  Itinerary,
  ItineraryInput,
  PlaceLocation,
  PlanningIssue,
  ScopedPrice,
} from "@travel/types";
import type { CityPlanningData } from "../../cities/domain/city.entity.js";
import * as types from "@travel/types";
const {
  mapUrl,
  timelineMinutes,
  activityMinutes,
  mealSlot,
  placeKey,
  countryDestinationReference,
} = (types as unknown as { default?: typeof types }).default ?? types;
const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]/g, "");
export function resolveCity(cities: CityPlanningData[], value?: string) {
  if (!value) return undefined;
  const exact = cities.filter((city) => city.slug === value);
  if (exact.length === 1) return exact[0];
  const matches = cities.filter((city) =>
    [city.slug, ...Object.values(city.name)].some(
      (name) => placeKey(name) === placeKey(value),
    ),
  );
  return matches.length === 1 ? matches[0] : undefined;
}
const link = (platform: string, url: string): BookingLink => ({
  platform,
  url,
  kind: "search",
});
export function bookingSearches(
  kind: "stay" | "flight" | "activity",
  name: string,
  city: string,
  input?: ItineraryInput,
): BookingLink[] {
  if (kind === "activity")
    return [
      link(
        "Klook",
        `https://www.klook.com/search/?${new URLSearchParams({ query: `${name} ${city}` })}`,
      ),
    ];
  // These official landing pages remain useful without undocumented OTA query parameters.
  if (kind === "flight")
    return [
      link("Trip.com", "https://www.trip.com/flights/"),
      link("Traveloka", "https://www.traveloka.com/en-vn/flight"),
      link("Skyscanner", "https://www.skyscanner.com/"),
    ];
  return [
    link("Agoda", "https://www.agoda.com/"),
    link("Trip.com", "https://www.trip.com/hotels/"),
    link("Traveloka", "https://www.traveloka.com/en-vn/hotel"),
  ];
}

export function enrichTravel(
  plan: Itinerary,
  cities: CityPlanningData[],
  input?: ItineraryInput,
): Itinerary {
  const out = structuredClone(plan);
  out.days = Array.isArray(out.days) ? out.days : [];
  out.hotels = Array.isArray(out.hotels) ? out.hotels : [];
  out.restaurants = Array.isArray(out.restaurants) ? out.restaurants : [];
  out.transport_summary = Array.isArray(out.transport_summary)
    ? out.transport_summary
    : [];
  out.suggestions = Array.isArray(out.suggestions) ? out.suggestions : [];
  for (const day of out.days)
    day.activities = Array.isArray(day.activities) ? day.activities : [];
  out.city_catalog = Object.fromEntries(
    cities.map((c) => [
      c.slug,
      { name: c.name, country: c.country, timezone: c.timezone },
    ]),
  );
  if (input) {
    for (const day of out.days)
      for (const activity of day.activities) {
        activity.evidence = undefined;
        if (activity.price) activity.price.status = "estimated";
      }
    for (const item of [...out.hotels, ...out.restaurants])
      item.evidence = undefined;
    for (const leg of out.transport_summary)
      if (leg.price) leg.price.status = "estimated";
  }
  const setPlace = (
    item: PlaceLocation & { name: string; maps_link: string; evidence?: any },
    city?: CityPlanningData,
  ) => {
    if (!city) {
      item.city = item.city ?? undefined;
      if (item.evidence?.source !== "user") {
        item.address = "";
        item.country = "";
      }
      item.lat = undefined;
      item.lon = undefined;
      item.google_place_id = undefined;
      item.map_precision = "search";
      item.maps_link = mapUrl(item);
      return;
    }
    item.city_slug = city.slug;
    item.city = city.name.en ?? city.slug;
    item.country = city.country;
    const match = city.places.find((p) => norm(p.name) === norm(item.name));
    // AI/user suggestions cannot prove coordinates, addresses or external URLs.
    const verified =
      match &&
      !["ai_generated", "user_submission", "user_added"].includes(
        match.source,
      ) &&
      !!match.last_verified_at &&
      Date.parse(match.last_verified_at) <= Date.now() &&
      Date.now() - Date.parse(match.last_verified_at) <= 180 * 86400000;
    item.lat = verified ? match.lat : undefined;
    item.lon = verified ? match.lon : undefined;
    item.google_place_id = verified ? match.google_place_id : undefined;
    item.address =
      (verified ? match?.address : undefined) ??
      (item.evidence?.source === "user" ? item.address : "") ??
      "";
    item.map_precision =
      verified &&
      (item.google_place_id || (item.lat != null && item.lon != null))
        ? "verified"
        : "search";
    item.maps_link = mapUrl(item);
    item.evidence = verified
      ? {
          source: "catalog",
          source_id: match.id,
          verified_at: match.last_verified_at,
        }
      : item.evidence?.source === "user"
        ? item.evidence
        : { source: "ai_suggestion" };
  };
  for (const day of out.days) {
    const city =
      resolveCity(cities, day.city_slug) ?? resolveCity(cities, day.city);
    if (city) {
      day.city_slug = city.slug;
      day.city_names = city.name;
      day.city = city.name.en ?? city.slug;
    }
    for (const a of day.activities) {
      a.city = city?.name.en ?? day.city;
      if (a.during_transport) {
        // A transit allowance is not a restaurant at the destination.
        a.city = undefined;
        a.city_slug = undefined;
        a.country = undefined;
        a.lat = undefined;
        a.lon = undefined;
        a.address = "";
        a.google_place_id = undefined;
        a.maps_link = "";
      } else setPlace(a, city);
      // Planning allowances are useful estimates, and remain distinct from verified venue facts.
      const catalogCost = city?.activities.find(
        (entry) =>
          norm(entry.title) === norm(a.name) &&
          !!entry.last_verified_at &&
          Date.parse(entry.last_verified_at) <= Date.now() &&
          Date.now() - Date.parse(entry.last_verified_at) <= 180 * 86400000 &&
          !["ai_generated", "user_submission", "user_added"].includes(
            entry.source,
          ) &&
          entry.currency === a.currency &&
          entry.estimated_cost != null &&
          entry.estimated_cost >= 0,
      );
      if (!input && a.price?.status === "user_confirmed") {
        a.cost = a.price.amount;
      } else if (a.price?.included_in && hasPriceEvidence(a.price)) {
        a.cost = a.price!.amount;
      } else if (catalogCost) {
        a.cost = catalogCost.estimated_cost;
        a.price = {
          ...catalogPrice(
            catalogCost,
            a.currency,
            a.kind === "transfer" ? (a.price?.scope ?? "group") : "person",
          ),
          assumption: a.price?.assumption,
        };
      } else if (hasPriceEvidence(a.price)) {
        a.cost = a.price!.amount;
      } else if (input || a.price?.status !== "user_confirmed") {
        a.cost = null;
        if (a.price) a.price.amount = null;
      }

      // Legacy trip rows store cost for the whole party; price retains its explicit unit.
      if (
        a.price?.amount != null &&
        Number.isFinite(a.price.amount) &&
        a.price.amount >= 0
      ) {
        a.currency = a.price.currency;
        a.cost =
          a.price.amount * (a.price.scope === "person" ? out.num_travelers : 1);
      }

      a.booking_link = undefined;
      a.ticket_activities =
        a.category === "attraction" || a.kind === "visit"
          ? bookingSearches("activity", a.name, city?.name.en ?? day.city).map(
              (l) => ({ platform: l.platform, url: l.url, kind: l.kind }),
            )
          : [];
    }
  }
  for (const item of [...out.hotels, ...out.restaurants]) {
    const day =
      "day_number" in item
        ? out.days.find((d) => d.day_number === item.day_number)
        : undefined;
    const city =
      resolveCity(cities, item.city_slug ?? item.city ?? day?.city_slug) ??
      (cities.length === 1 ? cities[0] : undefined);
    setPlace(item, city);
  }
  for (const h of out.hotels) {
    const city = resolveCity(cities, h.city_slug ?? h.city);
    const cost = city?.activities.find(
      (a) =>
        norm(a.title) === norm(h.name) &&
        currentCatalogPrice(a) &&
        a.currency === out.currency &&
        a.estimated_cost != null,
    );
    if (cost && h.price?.status !== "user_confirmed")
      h.price = {
        ...catalogPrice(cost, out.currency, "room_night"),
        assumption: h.estimate_assumption,
      };
    if (
      h.price &&
      hasPriceEvidence(h.price) &&
      h.price.currency === out.currency
    ) {
      h.nightly_estimate = h.price.amount ?? undefined;
      h.estimate_basis = h.price.basis;
    } else {
      h.nightly_estimate = undefined;
      if (h.price) h.price.amount = null;
      h.price_per_night = "";
      h.price_range = "";
    }
    h.booking_url = "";
    h.airbnb_url = "";
    h.booking_links = bookingSearches("stay", h.name, h.city ?? "", input);
  }
  for (const r of out.restaurants) {
    if (
      r.price &&
      hasPriceEvidence(r.price) &&
      r.price.currency === out.currency
    ) {
      r.estimated_per_person = r.price.amount ?? undefined;
    } else {
      r.estimated_per_person = undefined;
      if (r.price) r.price.amount = null;
      r.price_per_person = "";
      r.price_range = "";
    }
    r.tiktok_search_link = "";
    r.ig_search_link = "";
  }
  const planning = input?.planning ?? out.planning;
  if (
    planning?.journey.return_to_origin &&
    (planning.journey.destinations?.length ?? 0) <= 1
  ) {
    for (const kind of ["flight", "airport_transfer"] as const) {
      const legs = out.transport_summary.filter(
        (leg) =>
          leg.transport_kind === kind ||
          (kind === "flight" && leg.recommended_mode === "flight"),
      );
      if (legs.length !== 1 || !hasPriceEvidence(legs[0]!.price)) continue;
      const leg = legs[0]!,
        price = leg.price!;
      const roundTrip = /khứ hồi|round.?trip/iu.test(price.assumption ?? "");
      const unit =
        price.scope === "person"
          ? input?.locale === "vi"
            ? "người"
            : "person"
          : input?.locale === "vi"
            ? "cả nhóm"
            : "group";
      if (roundTrip)
        price.assumption =
          input?.locale === "vi"
            ? `Dự trù ${price.amount} ${price.currency}/${unit} cho cả hành trình khứ hồi; chưa phải báo giá.`
            : `Planning allowance of ${price.amount} ${price.currency}/${unit} for the round trip, not a quote.`;
      out.transport_summary.push({
        ...structuredClone(leg),
        id: leg.id ? `${leg.id}:return` : undefined,
        segment: `${leg.to} → ${leg.from}`,
        from: leg.to,
        to: leg.from,
        price: {
          ...price,
          amount: roundTrip ? 0 : null,
          included_in: roundTrip ? (leg.id ?? "outbound") : undefined,
          ...(roundTrip && price.original
            ? { original: { ...price.original, amount: 0 } }
            : {}),
          assumption: roundTrip
            ? input?.locale === "vi"
              ? "Chiều về đã tính trong khoản dự trù khứ hồi, không cộng thêm lần nữa."
              : "Return is already included in the round-trip allowance; no second charge."
            : input?.locale === "vi"
              ? `Tạm dành cho chiều về cùng mức ${price.amount} ${price.currency}/${unit} như chiều đi; sẽ cập nhật khi chọn dịch vụ.`
              : `Allow the same ${price.amount} ${price.currency}/${unit} as the outbound leg for budgeting; update when selecting services.`,
        },
      });
    }
  }
  for (const leg of out.transport_summary) {
    if (
      leg.price &&
      !hasPriceEvidence(leg.price) &&
      (input || leg.price.status !== "user_confirmed")
    )
      leg.price.amount = null;
    leg.from_city_slug = (
      resolveCity(cities, leg.from) ?? resolveCity(cities, leg.from_city_slug)
    )?.slug;
    leg.to_city_slug = (
      resolveCity(cities, leg.to) ?? resolveCity(cities, leg.to_city_slug)
    )?.slug;
    if (leg.from_city_slug)
      leg.from =
        cities.find((c) => c.slug === leg.from_city_slug)?.name.en ?? leg.from;
    if (leg.to_city_slug)
      leg.to =
        cities.find((c) => c.slug === leg.to_city_slug)?.name.en ?? leg.to;
    leg.booking_context = {
      start_date: out.days[0]?.date,
      end_date: out.days.at(-1)?.date,
      travelers: out.num_travelers,
    };
    leg.booking_links =
      leg.recommended_mode === "flight"
        ? bookingSearches("flight", leg.from, leg.to, input)
        : [];
    for (const option of leg.options ?? []) {
      option.booking_url = "";
      option.price_range = "";
    }
  }
  // Generated suggestions must not carry invented product URLs or price claims.
  out.suggestions = out.suggestions.map((s) => ({
    ...s,
    url: bookingSearches("activity", s.name, "")[0]!.url,
    platform: "Klook",
    price_from: undefined,
  }));
  // A model-generated reserve has no confirmed cost basis either.
  if (out.budget_breakdown) out.budget_breakdown.contingency = 0;
  for (const day of out.days) {
    day.daily_budget_complete = day.activities.every((a) => a.cost != null);
    const priced = day.activities.filter((a) => a.cost != null);
    day.daily_cost_estimate = priced.reduce(
      (sum, a) =>
        sum +
        (a.price?.amount ?? a.cost ?? 0) *
          (a.price?.scope === "person" ? out.num_travelers : 1),
      0,
    );
  }
  return out;
}

export function itineraryRouteIssues(
  plan: Itinerary,
  input: ItineraryInput,
  cities: CityPlanningData[],
): PlanningIssue[] {
  const journey = input.planning?.journey;
  if (!journey) return [];
  const countryStops = new Map<string, string>();
  for (const day of plan.days ?? []) {
    const destination = day.destination_slug;
    if (!destination || !journey.destinations.includes(destination)) continue;
    const country = countryDestinationReference(destination);
    if (!country) continue;
    const city =
      resolveCity(cities, day.city_slug) ?? resolveCity(cities, day.city);
    // A proposed association cannot override a known city's actual country.
    if (city?.country && city.country !== country.country) continue;
    for (const value of [day.city, day.city_slug].filter(
      (value): value is string => !!value,
    ))
      countryStops.set(placeKey(value), destination);
  }
  const identity = (label: string, slug?: string) =>
    countryStops.get(placeKey(label)) ??
    (slug ? countryStops.get(placeKey(slug)) : undefined) ??
    resolveCity(cities, label)?.slug ??
    resolveCity(cities, slug)?.slug ??
    placeKey(label);
  const origin = identity(
    journey.origin.label,
    journey.origin.names ? journey.origin.city_slug : undefined,
  );
  const endpoint = journey.return_to_origin ? journey.origin : journey.endpoint;
  const end =
    endpoint &&
    identity(endpoint.label, endpoint.names ? endpoint.city_slug : undefined);
  // Resolve selected city IDs through the same catalog identity used for days
  // and legs. Country IDs must remain country identities, not city slugs.
  const expected = journey.destinations.map((destination) =>
    countryDestinationReference(destination)
      ? destination
      : identity(destination),
  );
  const days = plan.days ?? [];
  const visits: string[] = [];
  for (const [index, day] of days.entries()) {
    const stop = identity(day.city, day.city_slug);
    const travelOnly = day.activities.every(
      (activity) =>
        ["transfer", "rest", "meal", "check_in", "check_out"].includes(
          activity.kind ?? "",
        ) || ["transport", "food", "accommodation"].includes(activity.category),
    );
    if (
      !expected.includes(stop) &&
      travelOnly &&
      ((index === 0 && stop === origin) ||
        (index === days.length - 1 && stop === end))
    )
      continue;
    if (visits.at(-1) !== stop) visits.push(stop);
  }

  const issues: PlanningIssue[] = [];
  const vi = input.locale === "vi";
  if (
    visits.length !== expected.length ||
    visits.some((stop, index) => stop !== expected[index])
  )
    issues.push({
      code: "JOURNEY_DAY_ORDER",
      severity: "error",
      message: vi
        ? "Lịch từng ngày chưa đi qua đủ điểm đến theo đúng thứ tự. Vui lòng tạo lại."
        : "The daily schedule does not cover the requested stops in order. Generate it again.",
    });
  const edges = new Map<string, Set<string>>();
  for (const leg of plan.transport_summary ?? []) {
    const from = identity(leg.from, leg.from_city_slug);
    const to = identity(leg.to, leg.to_city_slug);
    if (!from || !to) continue;
    const next = edges.get(from) ?? new Set<string>();
    next.add(to);
    edges.set(from, next);
  }
  const stops = [origin, ...expected, end].filter(
    (stop): stop is string => !!stop,
  );
  const required = new Set(stops);
  const reachable = (from: string, to: string) => {
    const pending = [from];
    const visited = new Set(pending);
    for (const current of pending) {
      if (current === to) return true;
      for (const next of edges.get(current) ?? []) {
        if (visited.has(next) || (next !== to && required.has(next))) continue;
        visited.add(next);
        pending.push(next);
      }
    }
    return false;
  };
  for (let index = 1; index < stops.length; index++) {
    const from = stops[index - 1]!,
      to = stops[index]!;
    if (reachable(from, to)) continue;
    const label = (stop: string) =>
      cities.find((city) => city.slug === stop)?.name[vi ? "vi" : "en"] ??
      (stop === origin
        ? journey.origin.label
        : stop === end
          ? endpoint?.label
          : undefined) ??
      stop;
    issues.push({
      code: "JOURNEY_LEG_MISSING",
      severity: "error",
      params: { from: label(from), to: label(to) },
      message: vi
        ? `Thiếu chặng ${label(from)} → ${label(to)}. Vui lòng tạo lại.`
        : `Missing the leg from ${label(from)} to ${label(to)}. Generate it again.`,
    });
  }
  return issues;
}

const minutes = timelineMinutes;
export function itineraryQuality(
  plan: Pick<Itinerary, "days" | "locale">,
  input?: ItineraryInput,
): PlanningIssue[] {
  const issues: PlanningIssue[] = [];
  const add = (code: string, message: string, day_id?: string) =>
    issues.push({ code, message, severity: "warning", day_id });
  const used = new Set<string>();
  const vi = (input?.locale ?? plan.locale) === "vi";
  for (const day of plan.days) {
    const arrival = input?.planning?.transport_preferences.arrival_at;
    const departure = input?.planning?.transport_preferences.departure_at;
    const arrive =
      arrival?.slice(0, 10) === day.date
        ? minutes(arrival.slice(11, 16))
        : null;
    const depart =
      departure?.slice(0, 10) === day.date
        ? minutes(departure.slice(11, 16))
        : null;
    const buffer =
      input?.planning?.transport_preferences.mode === "flight"
        ? input.planning.transport_preferences.airport_buffer_minutes
        : 0;
    const availableStart = arrive == null ? 0 : arrive + 60;
    const availableEnd = depart == null ? 1440 : depart - buffer;
    const slots = [
      { slot: "breakfast", start: 420, end: 600 },
      { slot: "lunch", start: 660, end: 840 },
      { slot: "dinner", start: 1020, end: 1260 },
    ];
    for (const { slot, start, end } of slots) {
      if (availableStart >= end || availableEnd <= start) continue;
      const meal = day.activities.some((a) => {
        return mealSlot(a) === slot;
      });
      if (!meal)
        add(
          "MEAL_MISSING",
          vi
            ? `Ngày ${day.day_number}: thiếu bữa ${slot === "breakfast" ? "sáng" : slot === "lunch" ? "trưa" : "tối"}.`
            : `Day ${day.day_number}: missing ${slot}.`,
          day.id,
        );
    }
    const visits = day.activities.filter(
      (a) =>
        !mealSlot(a) &&
        (a.kind === "visit" ||
          (!a.kind &&
            ["attraction", "leisure", "shopping"].includes(a.category))),
    );
    const mainTravel = day.activities.filter(
      (a) => a.main_transport && a.kind === "transfer",
    );
    const mainMinutes = mainTravel.reduce(
      (sum, a) => sum + activityMinutes(a),
      0,
    );
    const paceMinimum =
      input?.planning?.experience_preferences.pace === "relaxed" ||
      input?.trip_style === "relax"
        ? 3
        : input?.planning?.experience_preferences.pace === "packed"
          ? 6
          : 4;
    const minimum = Math.max(1, paceMinimum - Math.ceil(mainMinutes / 90));
    if (
      availableEnd - availableStart >= 720 &&
      visits.length < minimum &&
      visits.reduce((sum, a) => sum + activityMinutes(a), 0) < 360
    )
      add(
        "ACTIVITIES_MISSING",
        vi
          ? `Ngày ${day.day_number}: chưa đủ hoạt động cho nhịp độ đã chọn.`
          : `Day ${day.day_number}: too few activities for the selected pace.`,
        day.id,
      );
    const dinner = day.activities.find((a) => mealSlot(a) === "dinner");
    const dinnerStart = dinner ? minutes(dinner.time) : null;
    if (availableEnd >= 1320 && dinnerStart != null) {
      const dinnerEnd = dinnerStart + activityMinutes(dinner!);
      const departing = mainTravel.some((a) => {
        const start = minutes(a.time);
        return (
          start != null &&
          (start >= dinnerEnd ||
            (dinner!.during_transport &&
              start <= dinnerStart &&
              start + activityMinutes(a) >= dinnerEnd))
        );
      });
      if (
        !departing &&
        !visits.some((a) => (minutes(a.time) ?? -1) >= dinnerEnd)
      )
        add(
          "EVENING_MISSING",
          vi
            ? `Ngày ${day.day_number}: cần hoạt động sau bữa tối.`
            : `Day ${day.day_number}: include an after-dinner experience.`,
          day.id,
        );
      if (
        !departing &&
        input?.planning?.stay_preferences.type !== "none" &&
        !day.activities.some(
          (a) =>
            (a.kind === "transfer" || a.kind === "rest") &&
            (minutes(a.time) ?? -1) >= dinnerEnd,
        )
      )
        add(
          "HOTEL_RETURN_MISSING",
          vi
            ? `Ngày ${day.day_number}: cần chặng về chỗ ở cuối ngày.`
            : `Day ${day.day_number}: include the evening return to lodging.`,
          day.id,
        );
    }
    let previousEnd = availableStart;
    for (const a of day.activities) {
      const time = minutes(a.time);
      const duration = activityMinutes(a);
      if (time == null || duration <= 0)
        add(
          "SCHEDULE_DETAILS_MISSING",
          vi
            ? `${a.name}: thiếu giờ bắt đầu hoặc thời lượng.`
            : `${a.name}: missing start time or duration.`,
          day.id,
        );
      if (time != null) {
        const transitMeal =
          a.during_transport &&
          a.kind === "meal" &&
          mainTravel.some((leg) => {
            const start = minutes(leg.time);
            return (
              start != null &&
              time >= start &&
              time + duration <= start + activityMinutes(leg)
            );
          });
        if (
          !transitMeal &&
          ((a.main_transport
            ? time < (day.activities.indexOf(a) > 0 ? previousEnd : 0)
            : time <
              previousEnd +
                (a.kind === "transfer" ? 0 : (a.travel_minutes ?? 0))) ||
            (!a.main_transport && time + duration > availableEnd))
        )
          add(
            "SCHEDULE_CONFLICT",
            vi
              ? `${a.name}: chồng giờ hoặc không đủ khoảng đệm di chuyển.`
              : `${a.name}: overlaps another stop or travel buffer.`,
            day.id,
          );
        previousEnd = Math.max(previousEnd, time + duration);
      }
      if (visits.includes(a)) {
        const key = `${day.city_slug ?? day.city}:${norm(a.name)}`;
        if (used.has(key))
          add(
            "REPEATED_PLACE",
            vi
              ? `${a.name}: địa điểm tham quan bị lặp.`
              : `${a.name}: repeated sightseeing stop.`,
            day.id,
          );
        used.add(key);
        if (a.description.trim().length < 100)
          add(
            "ACTIVITY_DETAILS_MISSING",
            vi
              ? `${a.name}: mô tả hoạt động chưa đủ chi tiết.`
              : `${a.name}: activity needs a more useful description.`,
            day.id,
          );
      }
    }
  }
  if (input?.planning?.dining_preferences.allergies.length)
    add(
      "ALLERGEN_CONFIRMATION_REQUIRED",
      vi
        ? "Cần xác nhận dị ứng trực tiếp với từng nhà hàng trước khi ăn."
        : "Confirm allergens directly with each restaurant before dining.",
    );
  return issues;
}

export function reconcileBudget(
  plan: Itinerary,
  input?: ItineraryInput,
): Itinerary {
  const b = plan.budget_breakdown;
  if (!b) return plan;
  const items: BudgetItem[] = [];
  const missing = new Set<string>();
  const activityDays = new Map(
    plan.days.flatMap((day) =>
      day.activities.map((activity) => [activity, day.day_number] as const),
    ),
  );
  const groupAmount = (price?: ScopedPrice) => {
    const amount =
      price && hasPriceEvidence(price) && price.currency === plan.currency
        ? price.amount
        : null;
    return typeof amount === "number" && Number.isFinite(amount) && amount >= 0
      ? amount * (price?.scope === "person" ? plan.num_travelers : 1)
      : null;
  };
  for (const category of ["food", "activities"] as const) {
    const entries = plan.days
      .flatMap((d) => d.activities)
      .filter((a) =>
        category === "food"
          ? a.kind === "meal" || a.kind === "cafe" || a.category === "food"
          : a.kind === "visit" ||
            (!a.kind &&
              ["attraction", "leisure", "shopping"].includes(a.category)),
      );
    if (entries.length)
      for (const [index, a] of entries.entries())
        items.push({
          id: a.id ?? `${category}:${index}`,
          category,
          day_number: activityDays.get(a),
          label: `${(input?.locale ?? plan.locale) === "vi" ? "Ngày" : "Day"} ${activityDays.get(a)}: ${a.name}`,
          amount: a.currency === plan.currency ? groupAmount(a.price) : null,
          status: a.price?.status ?? "estimated",
          basis: a.price?.basis,
          assumption: a.price?.assumption,
        });
    else
      items.push({
        id: category,
        category,
        label: category,
        amount: null,
        status: "estimated",
      });
  }
  for (const issue of itineraryQuality(plan, input))
    if (["MEAL_MISSING", "ACTIVITIES_MISSING"].includes(issue.code))
      missing.add(issue.code === "MEAL_MISSING" ? "food" : "activities");
  const overnight = [
    ...new Set(plan.days.slice(0, -1).map((d) => d.city_slug ?? d.city)),
  ];
  if (input?.planning?.stay_preferences.type !== "none")
    for (const city of overnight) {
      const expectedNights = plan.days
        .slice(0, -1)
        .filter((d) => (d.city_slug ?? d.city) === city).length;
      const hotels = plan.hotels.filter(
        (h) => (h.city_slug ?? h.city) === city,
      );
      if (
        hotels.length &&
        hotels.reduce((sum, h) => sum + (h.nights ?? expectedNights), 0) <
          expectedNights
      )
        missing.add(city);
      for (const [index, h] of (hotels.length
        ? hotels
        : [undefined]
      ).entries()) {
        const nights = h?.nights ?? expectedNights;
        const rooms = h?.rooms ?? input?.planning?.stay_preferences.rooms ?? 1;
        items.push({
          id: `stay:${city}${index ? `:${index}` : ""}`,
          category: "accommodation",
          label: h ? `${h.name} · ${rooms} × ${nights}` : city,
          basis: h?.price?.basis ?? h?.estimate_basis,
          assumption: h?.estimate_assumption,
          amount:
            h?.price?.currency === plan.currency && hasPriceEvidence(h.price)
              ? h.price.amount! * rooms * nights
              : null,
          status: h?.price?.status ?? "estimated",
        });
      }
    }
  const fixed = input?.planning?.transport_preferences;
  const confirmedTotal =
    fixed?.confirmed && fixed.total_price != null && fixed.total_price >= 0
      ? fixed.total_price
      : undefined;
  let usedConfirmed = false;
  for (const [i, leg] of plan.transport_summary.entries()) {
    const kind =
      leg.transport_kind ??
      (leg.recommended_mode === "flight"
        ? "flight"
        : leg.from_city_slug &&
            leg.to_city_slug &&
            leg.from_city_slug !== leg.to_city_slug
          ? "intercity"
          : /airport|sân bay/i.test(`${leg.segment} ${leg.from} ${leg.to}`)
            ? "airport_transfer"
            : "local");
    // The confirmed total covers the chosen main travel mode as a whole, never each leg.
    if (confirmedTotal != null && leg.recommended_mode === fixed?.mode) {
      if (usedConfirmed) continue;
      usedConfirmed = true;
      items.push({
        id: "confirmed:transport",
        category: "transport",
        transport_kind: kind,
        label: fixed.mode,
        amount: confirmedTotal,
        status: "user_confirmed",
      });
    } else
      items.push({
        id: leg.id ?? `transport:${i}`,
        category: "transport",
        transport_kind: kind,
        label: `${leg.from} → ${leg.to}`,
        amount: groupAmount(leg.price),
        status: leg.price?.status ?? "estimated",
        basis: leg.price?.basis,
        assumption: leg.price?.assumption,
      });
  }
  // Each day's local transport allowance is separate from main/airport legs.
  // Transfers with no standalone estimate remain covered by those legs and are not double counted.
  for (const [dayIndex, day] of plan.days.entries())
    for (const [index, a] of day.activities.entries())
      if (a.kind === "transfer" && !a.main_transport && !a.price?.included_in)
        items.push({
          id: a.id ?? `local:${dayIndex}:${index}`,
          category: "transport",
          transport_kind: "local",
          label: `Day ${day.day_number}: ${a.name}`,
          amount: groupAmount(a.price),
          status: a.price?.status ?? "estimated",
          basis: a.price?.basis,
          assumption: a.price?.assumption,
        });
  if (confirmedTotal != null && !usedConfirmed)
    items.push({
      id: "confirmed:transport",
      category: "transport",
      transport_kind: fixed?.mode === "flight" ? "flight" : "intercity",
      label: fixed!.mode,
      amount: confirmedTotal,
      status: "user_confirmed",
    });
  if (
    fixed?.mode === "flight" &&
    !items.some((i) => i.transport_kind === "flight")
  )
    items.push({
      id: "flight:unknown",
      category: "transport",
      transport_kind: "flight",
      label: "flight",
      amount: null,
      status: "estimated",
    });
  if (!plan.transport_summary.length && confirmedTotal == null)
    missing.add("transport");
  const hasAllowances = items.some(
    (item) =>
      item.status !== "user_confirmed" &&
      item.amount != null &&
      item.amount > 0,
  );
  b.contingency = 0;
  if (hasAllowances)
    b.contingency = Math.round(
      items.reduce((sum, item) => sum + (item.amount ?? 0), 0) * 0.1,
    );
  items.push({
    id: "contingency",
    basis: hasAllowances ? "planning_estimate" : undefined,
    assumption: hasAllowances
      ? input?.locale === "vi"
        ? "Dự phòng 10% các khoản dự toán; không phải phí dịch vụ đã xác nhận."
        : "10% planning contingency, not a confirmed service charge."
      : undefined,
    category: "contingency",
    label: hasAllowances
      ? (input?.locale ?? plan.locale) === "vi"
        ? "Dự phòng 10%"
        : "10% contingency"
      : "contingency",
    amount:
      Number.isFinite(b.contingency) && b.contingency >= 0
        ? b.contingency
        : null,
    status: "estimated",
  });
  const details: NonNullable<typeof b.transport_details> = {};
  for (const item of items) {
    if (item.amount == null) missing.add(item.label);
    if (item.transport_kind)
      details[item.transport_kind] =
        details[item.transport_kind] === null || item.amount === null
          ? null
          : (details[item.transport_kind] ?? 0) + item.amount;
  }
  for (const category of [
    "accommodation",
    "food",
    "activities",
    "transport",
    "contingency",
  ] as const)
    b[category] = items
      .filter((i) => i.category === category)
      .reduce((s, i) => s + (i.amount ?? 0), 0);
  b.total =
    b.accommodation + b.food + b.activities + b.transport + b.contingency;
  b.per_person = b.total / Math.max(1, plan.num_travelers);
  b.per_day = b.total / Math.max(1, plan.num_days);
  b.items = items;
  b.missing_items = [...missing];
  b.complete = !missing.size;
  b.transport_details = details;
  plan.total_cost = b.total;
  const limit = input?.planning?.budget.total ?? input?.budget;
  plan.issues = (plan.issues ?? []).filter(
    (i) =>
      !["OVER_BUDGET", "COST_MISMATCH", "BUDGET_INCOMPLETE"].includes(i.code),
  );
  if (missing.size)
    plan.issues.push({
      code: "BUDGET_INCOMPLETE",
      severity: "warning",
      message:
        (input?.locale ?? plan.locale) === "vi"
          ? "Tổng hiện tại chỉ gồm khoản đã có giá; còn chi phí chưa xác định."
          : "The current total includes priced items only; some costs are unknown.",
    });
  if (limit != null && b.total > limit)
    plan.issues.push({
      code: "OVER_BUDGET",
      severity: "warning",
      params: { amount: b.total - limit, currency: plan.currency },
      message:
        input?.locale === "vi"
          ? `Vượt ngân sách ít nhất ${b.total - limit} ${plan.currency}.`
          : `Over budget by at least ${b.total - limit} ${plan.currency}.`,
    });
  return plan;
}
