import type { Activity, Itinerary, ScopedPrice } from "@travel/types";
import * as types from "@travel/types";
import {
  enrichTravel,
  itineraryQuality,
  itineraryRouteIssues,
  reconcileBudget,
} from "../enrichment/travel-enrichment.js";
import { generationError } from "./generation-error.js";
import {
  matchesHours,
  planningWarning,
  venueIdentity,
  type Snapshot,
  type Item,
  type SlotDay,
} from "./planning-data.js";
const { upgradeJourneyPlan, hasPriceEvidence } =
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
    const includedKey =
      slot.coveredBy ??
      (!slot.itemKey
        ? slot.kind === "check_in" || slot.kind === "check_out"
          ? `${dest.selected}/stay`
          : `${dest.selected}/local/daily`
        : undefined);
    const item = slot.itemKey
      ? snapshot.items[slot.itemKey]
      : includedKey
        ? snapshot.items[includedKey]
        : undefined;
    const amount =
      item?.price && hasPriceEvidence(item.price)
        ? includedKey
          ? 0
          : item.amount
        : null;
    if (slot.itemKey && (!item || item.amount === null))
      planningWarning(
        snapshot,
        "PLANNING_ITEM_INCOMPLETE",
        `Chưa có giá cho ${item?.name ?? slot.itemKey}.`,
        `Price is missing for ${item?.name ?? slot.itemKey}.`,
      );
    if (item && !matchesHours(item.hours, slot, day.date))
      planningWarning(
        snapshot,
        "SCHEDULE_CONFLICT",
        `Cần xác nhận giờ mở cửa của ${item.name}.`,
        `Confirm opening hours for ${item.name}.`,
      );
    const booked = p.stay_preferences.booked_name;
    const name =
      slot.displayName ??
      (slot.itemKey || slot.coveredBy ? item?.name : undefined) ??
      (slot.itemKey
        ? vi
          ? "Mục dự kiến — chưa đủ thông tin địa điểm"
          : "Planned item — location details pending"
        : slot.kind === "check_in" || slot.kind === "check_out"
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
      ...(slot.duringTransport ? { during_transport: true } : {}),
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
        currency: input.currency,
        ...item?.price,
        amount,
        scope: includedKey ? "group" : (item?.scope ?? "group"),
        status: item?.price?.status ?? "estimated",
        basis: item?.price?.basis ?? "planning_estimate",
        ...(includedKey
          ? {
              included_in: includedKey,
              ...(item?.price?.original
                ? { original: { ...item.price.original, amount: 0 } }
                : {}),
            }
          : {}),
        assumption:
          amount === null
            ? "Price unavailable: no verified price source. Excluded from the total."
            : ((slot.duringTransport
                ? "Separate meal allowance during main travel, not a destination restaurant visit or a guaranteed onboard meal. Arrange food separately; not included in the main fare estimate."
                : slot.coveredBy
                  ? "Included in the main travel budget; duration is a provisional allowance. Confirm the actual service and local arrival/departure times."
                  : item?.assumption) ??
              (slot.kind === "check_in" || slot.kind === "check_out"
                ? "Room charges are counted in the accommodation budget."
                : "Included in the daily local or main travel allowance; no extra charge.")),
      },
    };
  });
  const seen = new Set<string>();
  for (const activity of activities.filter((a) => a.kind === "visit")) {
    const identity = venueIdentity(activity.name);
    if (seen.has(identity))
      planningWarning(
        snapshot,
        "REPEATED_PLACE",
        `Địa điểm ${activity.name} bị lặp; có thể thay bằng địa điểm khác.`,
        `${activity.name} is repeated; consider another venue.`,
      );
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
    const item: Item = snapshot.items[`${d.selected}/stay`] ?? {
      name:
        input.locale === "vi"
          ? "Chưa chọn chỗ ở"
          : "Accommodation not selected",
      amount: null,
      source: "ai_suggestion",
      scope: "room_night",
      assumption: "Price not available; confirm before booking.",
    };
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
        price: item.price,
        nightly_estimate:
          item.price && hasPriceEvidence(item.price)
            ? (item.amount ?? undefined)
            : undefined,
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
      const item: Partial<Item> & {
        amount: number | null;
        scope: ScopedPrice["scope"];
        assumption: string;
      } = snapshot.items[leg.key] ?? {
        amount: null,
        scope: "person" as const,
        assumption: "Travel price is missing; confirm before booking.",
      };
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
          ...item.price,
          amount:
            item.price && hasPriceEvidence(item.price) ? item.amount : null,
          currency: input.currency,
          scope: item.scope,
          status: item.price?.status ?? "estimated",
          basis: item.price?.basis ?? "planning_estimate",
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
      planningWarning(
        snapshot,
        "PLANNING_ITEM_INCOMPLETE",
        "Chưa đủ dự toán di chuyển nội thành.",
        "Local transport estimates are incomplete.",
      );
    plan.transport_summary.push({
      segment: plan.title,
      from: cities[0]!.name.en ?? cities[0]!.slug,
      to: cities[0]!.name.en ?? cities[0]!.slug,
      recommended_mode: "other",
      transport_kind: "local",
      options: [],
      price: {
        ...local?.price,
        amount: local?.price && hasPriceEvidence(local.price) ? 0 : null,
        included_in: `${snapshot.destinations[0]!.selected}/local/daily`,
        ...(local?.price?.original
          ? { original: { ...local.price.original, amount: 0 } }
          : {}),
        currency: input.currency,
        scope: "group",
        status: "estimated",
        basis: "planning_estimate",
        assumption:
          local?.price && hasPriceEvidence(local.price)
            ? "Local-only route. All travel within this city is already included in the daily local transport allowance; no additional main travel charge."
            : "Price unavailable: no verified price source. Excluded from the total.",
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
  const mealLimit = p.dining_preferences.per_person_budget;
  if (
    mealLimit !== undefined &&
    enriched.days.some((day) =>
      day.activities.some(
        (activity) =>
          activity.kind === "meal" &&
          (activity.price?.amount ?? activity.cost ?? 0) > mealLimit,
      ),
    )
  )
    enriched.issues.push({
      code: "MEAL_ESTIMATE_OVER_BUDGET",
      severity: "warning",
      params: { amount: mealLimit, currency: input.currency },
      message:
        input.locale === "vi"
          ? `Một số bữa ăn có dự toán vượt mức ${mealLimit} ${input.currency}/người/bữa.`
          : `Some meal estimates exceed ${mealLimit} ${input.currency} per person per meal.`,
    });
  const nightlyLimit = p.stay_preferences.nightly_budget;
  if (
    nightlyLimit !== undefined &&
    enriched.hotels.some(
      (hotel) => (hotel.nightly_estimate ?? 0) > nightlyLimit,
    )
  )
    enriched.issues.push({
      code: "STAY_ESTIMATE_OVER_BUDGET",
      severity: "warning",
      params: { amount: nightlyLimit, currency: input.currency },
      message:
        input.locale === "vi"
          ? `Một số chỗ ở có dự toán vượt mức ${nightlyLimit} ${input.currency}/phòng/đêm.`
          : `Some lodging estimates exceed ${nightlyLimit} ${input.currency} per room per night.`,
    });
  if (input.budget !== undefined && !enriched.budget_breakdown.complete) {
    planningWarning(
      snapshot,
      "BUDGET_INCOMPLETE",
      "Dự toán chưa đầy đủ; tổng hiện có chưa bao gồm các khoản chưa xác định.",
      "The budget is incomplete; current totals exclude unresolved costs.",
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
        planningWarning(
          snapshot,
          "REPEATED_PLACE",
          `Địa điểm ${a.name} bị lặp trong hành trình; cần kiểm tra và thay thế nếu muốn.`,
          `${a.name} repeats across the trip; review and replace if needed.`,
        );
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
  enriched.issues = [...enriched.issues, ...(snapshot.warnings ?? [])].map(
    (issue) => ({ ...issue, severity: "warning" as const }),
  );
  return enriched;
}
