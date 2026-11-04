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
const { mapUrl } =
  (types as unknown as { default?: typeof types }).default ?? types;
const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]/g, "");
export function resolveCity(cities: CityPlanningData[], value?: string) {
  return value
    ? cities.find((c) =>
        [c.slug, ...Object.values(c.name)].some((n) => norm(n) === norm(value)),
      )
    : undefined;
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
      !!match.last_verified_at;
    item.lat = verified ? match.lat : undefined;
    item.lon = verified ? match.lon : undefined;
    item.google_place_id = verified ? match.google_place_id : undefined;
    item.address =
      match?.address ??
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
    const city = resolveCity(cities, day.city_slug ?? day.city);
    if (city) {
      day.city_slug = city.slug;
      day.city_names = city.name;
      day.city = city.name.en ?? city.slug;
    }
    for (const a of day.activities) {
      a.city = city?.name.en ?? day.city;
      setPlace(a, city);
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
    h.booking_url = "";
    h.airbnb_url = "";
    h.booking_links = bookingSearches("stay", h.name, h.city ?? "", input);
  }
  for (const r of out.restaurants) {
    r.tiktok_search_link = "";
    r.ig_search_link = "";
  }
  for (const leg of out.transport_summary) {
    leg.from_city_slug = resolveCity(
      cities,
      leg.from_city_slug ?? leg.from,
    )?.slug;
    leg.to_city_slug = resolveCity(cities, leg.to_city_slug ?? leg.to)?.slug;
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
    for (const option of leg.options ?? []) option.booking_url = "";
  }
  // Generated suggestions must not carry invented product URLs or price claims.
  out.suggestions = out.suggestions.map((s) => ({
    ...s,
    url: bookingSearches("activity", s.name, "")[0]!.url,
    platform: "Klook",
    price_from: undefined,
  }));
  return out;
}

const minutes = (time: string) =>
  /^\d{2}:\d{2}$/.test(time) && +time.slice(0, 2) < 24 && +time.slice(3) < 60
    ? +time.slice(0, 2) * 60 + +time.slice(3)
    : null;
export function itineraryQuality(
  plan: Itinerary,
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
        const t = minutes(a.time);
        return (
          (a.kind === "meal" || (a.category === "food" && a.kind !== "cafe")) &&
          (a.meal_slot === slot || (t != null && t >= start && t < end))
        );
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
        a.kind === "visit" ||
        (!a.kind && ["attraction", "leisure", "shopping"].includes(a.category)),
    );
    const minimum =
      input?.planning?.experience_preferences.pace === "relaxed" ||
      input?.trip_style === "relax"
        ? 3
        : 6;
    if (availableEnd - availableStart >= 720 && visits.length < minimum)
      add(
        "ACTIVITIES_MISSING",
        vi
          ? `Ngày ${day.day_number}: chưa đủ hoạt động cho nhịp độ đã chọn.`
          : `Day ${day.day_number}: too few activities for the selected pace.`,
        day.id,
      );
    let previousEnd = availableStart;
    for (const a of day.activities) {
      const time = minutes(a.time);
      const duration =
        a.duration_minutes ??
        +(a.duration.match(/([\d.]+)\s*h/)?.[1] ?? 0) * 60 +
          +(a.duration.match(/(\d+)\s*(?:m|min|phút)/)?.[1] ?? 0);
      if (time == null || duration <= 0 || a.travel_minutes == null)
        add(
          "SCHEDULE_DETAILS_MISSING",
          vi
            ? `${a.name}: thiếu giờ, thời lượng hoặc thời gian di chuyển.`
            : `${a.name}: missing time, duration or transfer time.`,
          day.id,
        );
      if (time != null && a.kind !== "transfer") {
        if (
          time < previousEnd + (a.travel_minutes ?? 0) ||
          time + duration > availableEnd
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
  const groupAmount = (price?: ScopedPrice, fallback?: number | null) => {
    const amount = price
      ? price.currency === plan.currency
        ? price.amount
        : null
      : fallback;
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
          label: a.name,
          amount:
            a.currency === plan.currency ? groupAmount(a.price, a.cost) : null,
          status: a.price?.status ?? "estimated",
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
      missing.add(issue.message);
  const overnight = [
    ...new Set(plan.days.slice(0, -1).map((d) => d.city_slug ?? d.city)),
  ];
  if (input?.planning?.stay_preferences.type !== "none")
    for (const city of overnight) {
      const h = plan.hotels.find((h) => (h.city_slug ?? h.city) === city);
      const nights =
        h?.nights ??
        plan.days.slice(0, -1).filter((d) => (d.city_slug ?? d.city) === city)
          .length;
      const rooms = h?.rooms ?? input?.planning?.stay_preferences.rooms ?? 1;
      items.push({
        id: `stay:${city}`,
        category: "accommodation",
        label: h?.name ?? city,
        amount:
          h?.nightly_estimate != null && h.nightly_estimate >= 0
            ? h.nightly_estimate * rooms * nights
            : null,
        status: "estimated",
      });
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
      });
  }
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
  items.push({
    id: "contingency",
    category: "contingency",
    label: "contingency",
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
        input?.locale === "vi"
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
