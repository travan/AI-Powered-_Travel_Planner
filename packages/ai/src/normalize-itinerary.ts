import type { Activity, ActivityCategory, Itinerary } from "@travel/types";
import * as travelTypes from "@travel/types";
const { mealSlot, timelineMinutes, activityMinutes } =
  (travelTypes as unknown as { default?: typeof travelTypes }).default ??
  travelTypes;

function record(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function nonNegativeNumber(value: unknown): number | undefined {
  const number =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : Number.NaN;
  return Number.isFinite(number) && number >= 0 ? number : undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function normalizeItinerary(itinerary: Itinerary): Itinerary;
export function normalizeItinerary(
  itinerary: Record<string, unknown>,
): Itinerary;
export function normalizeItinerary(
  itinerary: Itinerary | Record<string, unknown>,
): Itinerary {
  const rawItinerary = record(itinerary);
  const rawBudget = record(rawItinerary["budget_breakdown"]);
  const accommodation =
    nonNegativeNumber(rawBudget["accommodation"]) ??
    nonNegativeNumber(rawBudget["accommodation_estimate"]) ??
    0;
  const food =
    nonNegativeNumber(rawBudget["food"]) ??
    nonNegativeNumber(rawBudget["food_dining_estimate"]) ??
    0;
  const activities =
    nonNegativeNumber(rawBudget["activities"]) ??
    nonNegativeNumber(rawBudget["activities_estimate"]) ??
    0;
  const transport =
    nonNegativeNumber(rawBudget["transport"]) ??
    nonNegativeNumber(rawBudget["transport_estimate"]) ??
    0;
  const contingency =
    nonNegativeNumber(rawBudget["contingency"]) ??
    nonNegativeNumber(rawBudget["miscellaneous_buffer"]) ??
    0;
  const totalCost = nonNegativeNumber(rawItinerary["total_cost"]);
  const total =
    nonNegativeNumber(rawBudget["total"]) ??
    nonNegativeNumber(rawBudget["total_calculated"]) ??
    totalCost ??
    accommodation + food + activities + transport + contingency;
  const numDays = nonNegativeNumber(rawItinerary["num_days"]) || 1;
  const numTravelers = nonNegativeNumber(rawItinerary["num_travelers"]) || 1;
  const currency =
    text(rawBudget["currency"]) ?? text(rawItinerary["currency"]) ?? "USD";
  const days = Array.isArray(rawItinerary["days"])
    ? rawItinerary["days"].map((value, index) => {
        const day = record(value);
        const rawActivities = Array.isArray(day["activities"])
          ? day["activities"]
          : Array.isArray(day["schedule"])
            ? day["schedule"]
            : [];
        const normalizedActivities = rawActivities.map((activityValue) => {
          const activity = record(activityValue);
          const cost =
            nonNegativeNumber(activity["cost"]) ??
            nonNegativeNumber(activity["cost_estimate_usd"]);
          const category = text(activity["category"]);
          const categories: ActivityCategory[] = [
            "attraction",
            "food",
            "transport",
            "accommodation",
            "leisure",
            "shopping",
          ];
          const goldenMoment = normalizeGoldenMoment(activity["golden_moment"]);

          const slot = mealSlot({
            ...activity,
            name: text(activity["name"]) ?? text(activity["activity"]) ?? "",
            time: text(activity["time"]) ?? text(activity["time_slot"]) ?? "",
          } as Activity);
          const rawTime =
            text(activity["time"]) ?? text(activity["time_slot"]) ?? "";
          const start = timelineMinutes(rawTime);
          return {
            ...activity,
            ...(slot ? { kind: "meal" as const, meal_slot: slot } : {}),
            duration_minutes:
              activityMinutes(activity as unknown as Activity) || undefined,
            time:
              start == null
                ? rawTime
                : `${String(Math.floor(start / 60)).padStart(2, "0")}:${String(start % 60).padStart(2, "0")}`,
            name:
              text(activity["name"]) ??
              text(activity["activity"]) ??
              "Activity",
            description: text(activity["description"]) ?? "",
            duration: text(activity["duration"]) ?? "",
            cost: cost ?? null,
            currency: text(activity["currency"]) ?? currency,
            category: slot
              ? ("food" as const)
              : (categories.find((value) => value === category) ??
                "attraction"),
            maps_link: text(activity["maps_link"]) ?? "",
            golden_moment: goldenMoment,
            ticket_activities: Array.isArray(activity["ticket_activities"])
              ? activity["ticket_activities"]
                  .map((ticket) => {
                    const ticketRecord = record(ticket);
                    const platform = text(ticketRecord["platform"]);
                    const url = text(ticketRecord["url"]);
                    if (!platform || !url) return undefined;
                    const priceFrom = text(ticketRecord["price_from"]);
                    const note = text(ticketRecord["note"]);
                    return {
                      ...ticketRecord,
                      platform,
                      url,
                      ...(priceFrom ? { price_from: priceFrom } : {}),
                      ...(note ? { note } : {}),
                    };
                  })
                  .filter((ticket) => ticket !== undefined)
              : [],
          };
        });
        const activityCost = normalizedActivities.reduce(
          (sum, activity) => sum + (activity.cost ?? 0),
          0,
        );

        return {
          ...day,
          day_number: nonNegativeNumber(day["day_number"]) ?? index + 1,
          date: text(day["date"]) ?? "",
          city: text(day["city"]) ?? "",
          title: text(day["title"]) ?? text(day["theme"]) ?? `Day ${index + 1}`,
          activities: normalizedActivities,
          daily_cost_estimate:
            nonNegativeNumber(day["daily_cost_estimate"]) ??
            (activityCost || total / numDays),
        };
      })
    : [];
  const seasonalNotes = record(rawItinerary["seasonal_notes"]);

  return {
    ...itinerary,
    days,
    seasonal_notes: {
      ...seasonalNotes,
      travel_month: text(seasonalNotes["travel_month"]) ?? "",
      daylight_hours: text(seasonalNotes["daylight_hours"]) ?? "",
      sunrise_time: text(seasonalNotes["sunrise_time"]) ?? "",
      sunset_time: text(seasonalNotes["sunset_time"]) ?? "",
      weather_note:
        text(seasonalNotes["weather_note"]) ??
        text(seasonalNotes["weather_advice"]) ??
        "",
      highlights: Array.isArray(seasonalNotes["highlights"])
        ? seasonalNotes["highlights"].filter(
            (value): value is string => typeof value === "string",
          )
        : [],
      warnings: Array.isArray(seasonalNotes["warnings"])
        ? seasonalNotes["warnings"].filter(
            (value): value is string => typeof value === "string",
          )
        : [],
    },
    total_cost: totalCost ?? total,
    budget_breakdown: {
      ...Object.fromEntries(
        ["items", "complete", "missing_items", "transport_details"]
          .filter((key) => key in rawBudget)
          .map((key) => [key, rawBudget[key]]),
      ),
      accommodation,
      food,
      activities,
      transport,
      contingency,
      total,
      currency,
      per_person:
        nonNegativeNumber(rawBudget["per_person"]) ?? total / numTravelers,
      per_day: nonNegativeNumber(rawBudget["per_day"]) ?? total / numDays,
    },
  } as Itinerary;
}

function normalizeGoldenMoment(value: unknown) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  const moment = record(value);
  const type = text(moment["type"]);
  const allowedTypes = [
    "sunrise",
    "sunset",
    "golden_hour",
    "blue_hour",
    "night_view",
    "crowd_avoid",
  ] as const;
  if (!type || !allowedTypes.includes(type as (typeof allowedTypes)[number])) {
    return undefined;
  }
  return {
    type,
    best_time: text(moment["best_time"]) ?? "",
    tip: text(moment["tip"]) ?? "",
  };
}
