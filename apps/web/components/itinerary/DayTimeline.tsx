"use client";
import { useAppLanguage } from "../i18n/LanguageProvider";

import { UiText } from "../i18n/UiText";

import type {
  Activity,
  ActivityCategory,
  GoldenMoment,
  ItineraryDay,
  TicketOption,
} from "@travel/types";
import { ActivityCard } from "./ActivityCard";

interface Props {
  days: ItineraryDay[];
  currency?: string;
  onEdit?: () => void;
  editDisabled?: boolean;
  showDailyBudget?: boolean;
}

function formatMoney(value: number, currency: string, formattingLocale = "en") {
  const code = currency?.trim().toUpperCase() || "USD";

  try {
    return new Intl.NumberFormat(formattingLocale, {
      style: "currency",
      currency: code,
      currencyDisplay: "code",
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${code} ${value.toLocaleString(formattingLocale)}`;
  }
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function categoryValue(value: unknown): ActivityCategory {
  const categories: ActivityCategory[] = [
    "attraction",
    "food",
    "transport",
    "accommodation",
    "leisure",
    "shopping",
  ];
  return categories.find((category) => category === value) ?? "attraction";
}

function goldenMomentValue(value: unknown): GoldenMoment | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  const moment = value as Record<string, unknown>;
  const types: GoldenMoment["type"][] = [
    "sunrise",
    "sunset",
    "golden_hour",
    "blue_hour",
    "night_view",
    "crowd_avoid",
  ];
  const type = types.find((candidate) => candidate === moment["type"]);
  if (!type) return undefined;

  return {
    type,
    best_time: stringValue(moment["best_time"]) ?? "",
    tip: stringValue(moment["tip"]) ?? "",
  };
}

function ticketOptionsValue(value: unknown): TicketOption[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      return [];
    }
    const ticket = entry as Record<string, unknown>;
    const platform = stringValue(ticket["platform"]);
    const url = stringValue(ticket["url"]);
    if (!platform || !url) return [];
    const priceFrom = stringValue(ticket["price_from"]);
    const note = stringValue(ticket["note"]);
    return [
      {
        platform,
        url,
        ...(priceFrom ? { price_from: priceFrom } : {}),
        ...(note ? { note } : {}),
      },
    ];
  });
}

function activitiesForDay(day: ItineraryDay, currency: string): Activity[] {
  const legacyDay = day as ItineraryDay & { schedule?: unknown };
  const activities: unknown[] = Array.isArray(day.activities)
    ? day.activities
    : Array.isArray(legacyDay.schedule)
      ? legacyDay.schedule
      : [];

  return activities
    .filter(
      (value): value is Record<string, unknown> =>
        typeof value === "object" && value !== null && !Array.isArray(value),
    )
    .map((value) => {
      const cost = value["cost"];
      const legacyCost = value["cost_estimate_usd"];
      return {
        ...value,
        time:
          stringValue(value["time"]) ?? stringValue(value["time_slot"]) ?? "",
        name:
          stringValue(value["name"]) ??
          stringValue(value["activity"]) ??
          "Activity",
        description: stringValue(value["description"]) ?? "",
        duration: stringValue(value["duration"]) ?? "",
        cost:
          typeof cost === "number" && Number.isFinite(cost)
            ? cost
            : typeof legacyCost === "number" && Number.isFinite(legacyCost)
              ? legacyCost
              : null,
        currency: stringValue(value["currency"]) ?? currency,
        category: categoryValue(value["category"]),
        maps_link: stringValue(value["maps_link"]) ?? "",
        ticket_activities: ticketOptionsValue(value["ticket_activities"]),
        golden_moment: goldenMomentValue(value["golden_moment"]),
      };
    });
}

export function DayTimeline({
  days,
  currency = "USD",
  onEdit,
  editDisabled = false,
  showDailyBudget = true,
}: Props) {
  const { locale: formattingLocale } = useAppLanguage();

  if (!days || days.length === 0) return null;

  return (
    <div className="space-y-8">
      {days.map((day) => (
        <section
          key={day.day_number}
          className="space-y-4"
          data-testid={`itinerary-day-${day.day_number}`}
        >
          {/* Day header */}
          <div className="flex items-start gap-3">
            <div
              className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-full bg-primary text-on-primary shadow-md ring-4 ring-primary-fixed"
              aria-label={`Day ${day.day_number}`}
            >
              <span className="text-[9px] font-extrabold uppercase leading-none tracking-[0.16em]">
                {" "}
                <UiText id="t987b9ced08d4" fallback="Day" />{" "}
              </span>
              <span className="mt-1 text-lg font-black leading-none">
                {day.day_number}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="rounded-full bg-primary-fixed px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wider text-on-primary-fixed-variant">
                  {" "}
                  <UiText id="t987b9ced08d4" fallback="Day" /> {day.day_number}
                </span>
                <h3 className="font-semibold text-gray-900 text-lg">
                  {day.title ||
                    (day as ItineraryDay & { theme?: string }).theme}
                </h3>
              </div>
              {day.date && (
                <p className="mt-1 text-sm font-medium text-on-surface-variant">
                  {new Date(day.date).toLocaleDateString(formattingLocale, {
                    weekday: "long",
                    month: "short",
                    day: "numeric",
                  })}
                </p>
              )}
            </div>
            <div className="mt-1 flex items-center gap-2">
              <span className="rounded-full bg-surface-container px-3 py-1 text-xs font-semibold text-on-surface-variant">
                {day.city}
              </span>
              {onEdit && (
                <button
                  type="button"
                  onClick={onEdit}
                  disabled={editDisabled}
                  className="rounded-full border border-primary/40 bg-surface-container-lowest px-3 py-1 text-xs font-bold text-primary transition-colors hover:bg-primary-fixed disabled:cursor-not-allowed disabled:opacity-50"
                  data-testid={`itinerary-day-edit-${day.day_number}`}
                >
                  {editDisabled ? (
                    <UiText id="t3337b7fd28ce" fallback="Opening..." />
                  ) : (
                    <UiText id="te7e0c72aef47" fallback="Edit day" />
                  )}
                </button>
              )}
            </div>
          </div>

          {showDailyBudget && (
            <div className="ml-14 flex items-center justify-between gap-4 rounded-xl border border-primary/25 bg-primary-fixed/40 px-4 py-3">
              <div>
                <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-on-primary-fixed-variant">
                  {" "}
                  <UiText
                    id="t3ecae6cbba22"
                    fallback="Estimated daily budget"
                  />{" "}
                </p>
                <p className="mt-0.5 text-xl font-black text-on-surface">
                  {formatMoney(
                    day.daily_cost_estimate ??
                      activitiesForDay(day, currency).reduce(
                        (sum, activity) => sum + (activity.cost ?? 0),
                        0,
                      ),
                    currency,
                    formattingLocale,
                  )}
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-primary px-3 py-1.5 text-xs font-extrabold text-on-primary">
                {" "}
                <UiText id="t987b9ced08d4" fallback="Day" /> {day.day_number}
              </span>
            </div>
          )}

          {/* Activities */}
          <div className="pl-14">
            {activitiesForDay(day, currency).map((activity, index) => (
              <ActivityCard
                key={`${day.day_number}-${index}`}
                activity={activity}
                index={index}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
