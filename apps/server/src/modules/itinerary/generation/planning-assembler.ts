import type { Activity, Itinerary } from "@travel/types";
import * as types from "@travel/types";
import {
  enrichTravel,
  itineraryQuality,
  itineraryRouteIssues,
  reconcileBudget,
} from "../enrichment/travel-enrichment.js";
import { blockingCatalogIssues } from "../application/catalog-itinerary.js";
import { generationError } from "./generation-error.js";
import {
  matchesHours,
  venueIdentity,
  type Snapshot,
  type SlotDay,
} from "./planning-data.js";
const { upgradeJourneyPlan } =
  (types as unknown as { default?: typeof types }).default ?? types;

export function assembleDay(snapshot: Snapshot, day: SlotDay) {
  const input = snapshot.input;
  const vi = input.locale === "vi";
  const dest = snapshot.destinations.find(
    (d) => d.selected === day.destination,
  )!;
  if (!dest.city)
    generationError("PLANNING_DATA_INSUFFICIENT", "city_unresolved");
  const p = input.planning!;
  const stay = snapshot.items[`${dest.selected}/stay`];
  const activities: Activity[] = day.slots.map((slot) => {
    const item = slot.itemKey
      ? snapshot.items[slot.itemKey]
      : slot.coveredBy
        ? snapshot.items[slot.coveredBy]
        : undefined;
    const amount = slot.coveredBy ? 0 : (item?.amount ?? 0);
    if (slot.itemKey && (!item || item.amount === null))
      generationError("PLANNING_DATA_INSUFFICIENT", "unpriced_slot");
    if (item && !matchesHours(item.hours, slot, day.date))
      generationError(
        "PLANNING_DATA_INSUFFICIENT",
        "schedule_constraints_unsatisfied",
      );
    const booked = p.stay_preferences.booked_name;
    const name =
      slot.displayName ??
      item?.name ??
      (slot.kind === "check_in" || slot.kind === "check_out"
        ? (booked ??
          stay?.name ??
          (vi ? "Chỗ ở dự kiến" : "Planned accommodation"))
        : day.day === input.num_days
          ? vi
            ? "Di chuyển tới điểm kết thúc hành trình"
            : "Transfer to the final journey endpoint"
          : vi
            ? "Trở về chỗ ở"
            : "Return to accommodation");
    return {
      name,
      main_transport: !!slot.coveredBy,
      kind: slot.kind,
      meal_slot: slot.meal_slot,
      time: slot.time,
      duration_minutes: slot.duration_minutes,
      duration: `${slot.duration_minutes} min`,
      description: vi
        ? `Khung giờ dự kiến cho ${name}. Hãy xác nhận điều kiện, thời gian và giá trước khi đi.`
        : `Provisional time for ${name}. Confirm conditions, timing and prices before visiting.`,
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
      evidence:
        item?.source === "catalog"
          ? {
              source: "catalog",
              source_id: item.id,
              verified_at: item.verified_at,
            }
          : item?.source === "user"
            ? { source: "user" }
            : { source: "ai_suggestion" },
      price: {
        amount,
        currency: input.currency,
        scope: item?.scope ?? "group",
        status: "estimated",
        basis: "planning_estimate",
        assumption:
          (slot.coveredBy
            ? "Included in the main travel budget; duration is a provisional allowance. Confirm the actual service and local arrival/departure times."
            : item?.assumption) ??
          (slot.kind === "check_in" || slot.kind === "check_out"
            ? "Room charges are counted in the accommodation budget."
            : "Included in the daily local or main travel allowance; no extra charge."),
      },
    };
  });
  const seen = new Set<string>();
  for (const activity of activities.filter((a) => a.kind === "visit")) {
    const identity = venueIdentity(activity.name);
    if (seen.has(identity))
      generationError("AI_RESPONSE_INVALID", "duplicate_place");
    seen.add(identity);
  }
  return {
    day_number: day.day,
    date: day.date,
    city: dest.city.name.en ?? dest.city.slug,
    city_slug: dest.city.slug,
    destination_slug: dest.selected,
    title: vi
      ? `Ngày ${day.day} tại ${dest.city.name.vi ?? dest.city.name.en}`
      : `Day ${day.day} in ${dest.city.name.en}`,
    activities,
    daily_cost_estimate: 0,
  };
}

export function completePlan(snapshot: Snapshot): Itinerary {
  const input = snapshot.input,
    p = input.planning!;
  const cities = snapshot.destinations.map((d) => d.city!);
  const label = (value: string) =>
    snapshot.destinations.find((d) => d.selected === value)?.city?.name.en ??
    value;
  const hotels = snapshot.destinations.flatMap((d) => {
    const nights = snapshot.schedule
      .slice(0, -1)
      .filter((day) => day.destination === d.selected).length;
    if (!nights || p.stay_preferences.type === "none") return [];
    const item = snapshot.items[`${d.selected}/stay`];
    if (!item || item.amount === null)
      generationError("PLANNING_DATA_INSUFFICIENT", "lodging_price_missing");
    return [
      {
        name: item.name,
        note:
          item.source === "ai_suggestion" &&
          !item.id &&
          !p.stay_preferences.booked_name
            ? input.locale === "vi"
              ? "Khu vực lưu trú đề xuất, chưa chọn khách sạn cụ thể. Chi phí là dự toán phòng/đêm; cần xác nhận trước khi đặt."
              : "Suggested lodging area; no specific property has been selected. Costs are room/night allowances to confirm before booking."
            : "",
        city_slug: d.city!.slug,
        city: d.city!.name.en ?? d.city!.slug,
        rooms: p.stay_preferences.rooms,
        nights,
        nightly_estimate: item.amount,
        estimate_basis: "planning_estimate" as const,
        estimate_assumption: item.assumption,
        price_per_night: "",
        price_range: "",
        booking_url: "",
        airbnb_url: "",
        address: "",
        maps_link: "",
      },
    ];
  });
  const plan: Itinerary = {
    title: snapshot.destinations.map((d) => label(d.selected)).join(" → "),
    overview:
      input.locale === "vi"
        ? "Lịch trình dự kiến; các khoản chi là dự toán, cần xác nhận trước khi đặt."
        : "Proposed itinerary with planning allowances; confirm before booking.",
    schema_version: 2,
    planning: p,
    locale: input.locale === "vi" ? "vi" : "en",
    trip_style: input.trip_style,
    currency: input.currency,
    num_days: input.num_days ?? 1,
    num_travelers: input.num_travelers,
    total_cost: 0,
    days: snapshot.days,
    hotels,
    restaurants: [],
    suggestions: [],
    transport_summary: snapshot.legs.map((leg) => {
      const item = snapshot.items[leg.key];
      if (!item || item.amount === null)
        generationError(
          "PLANNING_DATA_INSUFFICIENT",
          "main_travel_price_missing",
        );
      return {
        segment: `${label(leg.from!)} → ${label(leg.to!)}`,
        from: label(leg.from!),
        to: label(leg.to!),
        recommended_mode:
          p.transport_preferences.mode === "suggest"
            ? ("other" as const)
            : (p.transport_preferences.mode as "flight"),
        transport_kind:
          p.transport_preferences.mode === "flight"
            ? ("flight" as const)
            : ("intercity" as const),
        options: [],
        price: {
          amount: item.amount,
          currency: input.currency,
          scope: item.scope,
          status: "estimated" as const,
          basis: "planning_estimate" as const,
          assumption: item.assumption,
        },
      };
    }),
    seasonal_notes: {
      travel_month: input.flexible_month ?? input.start_date?.slice(0, 7) ?? "",
      sunrise_time: "",
      sunset_time: "",
      daylight_hours: "",
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
  if (!snapshot.legs.length && cities.length === 1) {
    const local =
      snapshot.items[`${snapshot.destinations[0]!.selected}/local/daily`];
    if (local?.amount == null)
      generationError(
        "PLANNING_DATA_INSUFFICIENT",
        "main_travel_price_missing",
      );
    plan.transport_summary.push({
      segment: plan.title,
      from: cities[0]!.name.en ?? cities[0]!.slug,
      to: cities[0]!.name.en ?? cities[0]!.slug,
      recommended_mode: "other",
      transport_kind: "local",
      options: [],
      price: {
        amount: 0,
        currency: input.currency,
        scope: "group",
        status: "estimated",
        basis: "planning_estimate",
        assumption:
          "Local-only route. All travel within this city is already included in the daily local transport allowance; no additional main travel charge.",
      },
    });
  }
  let enriched = reconcileBudget(
    enrichTravel(
      upgradeJourneyPlan(
        plan,
        snapshot.legacy_destination_only
          ? { ...input, planning: undefined }
          : input,
      ),
      cities,
      input,
    ),
    input,
  );
  const quality = [
    ...itineraryRouteIssues(enriched, input, cities),
    ...itineraryQuality(enriched, input),
  ];
  enriched.issues = [...(enriched.issues ?? []), ...quality];
  if (enriched.issues.some((i) => i.code === "OVER_BUDGET"))
    generationError(
      "PLANNING_BUDGET_UNSATISFIABLE",
      "group_total_exceeds_budget",
    );
  if (input.budget !== undefined && !enriched.budget_breakdown.complete) {
    generationError("PLANNING_DATA_INSUFFICIENT", "budget_incomplete");
  }
  const blocking = enriched.issues.filter(
    (i) => i.severity === "error" || blockingCatalogIssues.has(i.code),
  );
  if (blocking.length) {
    const day = enriched.days.find((d) => d.id === blocking[0]!.day_id);
    generationError(
      "PLANNING_DATA_INSUFFICIENT",
      "schedule_constraints_unsatisfied",
      {
        ...(day ? { day: day.day_number } : {}),
        ...Object.fromEntries(
          blocking.slice(0, 5).flatMap((issue, i) => [
            [`issue_${i + 1}_code`, issue.code],
            [`issue_${i + 1}_slot`, "day"],
          ]),
        ),
      },
    );
  }
  if (p.dining_preferences.independent_only)
    enriched.issues.push({
      code: "INDEPENDENT_DINING_UNVERIFIED",
      severity: "warning",
      message:
        input.locale === "vi"
          ? "Ưu tiên quán ăn độc lập; cần xác nhận trực tiếp, các gợi ý chưa được bảo đảm là quán độc lập."
          : "Independent dining is preferred; confirm directly, suggested venues are not guaranteed independent.",
    });
  const visits = new Set<string>();
  for (const day of enriched.days)
    for (const a of day.activities.filter((a) => a.kind === "visit")) {
      const id = `${day.city_slug}:${venueIdentity(a.name)}`;
      if (visits.has(id))
        generationError("AI_RESPONSE_INVALID", "duplicate_place");
      visits.add(id);
    }
  if (Object.values(snapshot.items).some((i) => i.source === "ai_suggestion"))
    enriched.issues.push({
      code: "AI_SUGGESTIONS_UNVERIFIED",
      severity: "warning",
      message:
        input.locale === "vi"
          ? "Một số địa điểm và giá là gợi ý AI chưa kiểm chứng; cần xác nhận trước khi đặt."
          : "Some places and prices are unverified AI suggestions; confirm before booking.",
    });
  return enriched;
}
