"use client";

import type { ItineraryDay } from "@travel/types";
import { ActivityCard } from "./ActivityCard";

interface Props {
  days: ItineraryDay[];
  currency?: string;
  onEdit?: () => void;
  editDisabled?: boolean;
}

function formatMoney(value: number, currency: string) {
  const code = currency?.trim().toUpperCase() || "USD";

  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: code,
      currencyDisplay: "code",
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${code} ${value.toLocaleString("en-US")}`;
  }
}

export function DayTimeline({
  days,
  currency = "USD",
  onEdit,
  editDisabled = false,
}: Props) {
  if (!days || days.length === 0) return null;

  return (
    <div className="space-y-8">
      {days.map((day) => (
        <section key={day.day_number} className="space-y-4" data-testid={`itinerary-day-${day.day_number}`}>
          {/* Day header */}
          <div className="flex items-start gap-3">
            <div
              className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-full bg-primary text-on-primary shadow-md ring-4 ring-primary-fixed"
              aria-label={`Day ${day.day_number}`}
            >
              <span className="text-[9px] font-extrabold uppercase leading-none tracking-[0.16em]">Day</span>
              <span className="mt-1 text-lg font-black leading-none">{day.day_number}</span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="rounded-full bg-primary-fixed px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wider text-on-primary-fixed-variant">
                  Day {day.day_number}
                </span>
                <h3 className="font-semibold text-gray-900 text-lg">{day.title}</h3>
              </div>
              {day.date && (
                <p className="mt-1 text-sm font-medium text-on-surface-variant">
                  {new Date(day.date).toLocaleDateString("en-US", {
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
                  {editDisabled ? "Opening..." : "Edit day"}
                </button>
              )}
            </div>
          </div>

          <div className="ml-14 flex items-center justify-between gap-4 rounded-xl border border-primary/25 bg-primary-fixed/40 px-4 py-3">
            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-on-primary-fixed-variant">
                Estimated daily budget
              </p>
              <p className="mt-0.5 text-xl font-black text-on-surface">
                {formatMoney(day.daily_cost_estimate, currency)}
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-primary px-3 py-1.5 text-xs font-extrabold text-on-primary">
              Day {day.day_number}
            </span>
          </div>

          {/* Activities */}
          <div className="pl-14">
            {day.activities.map((activity, index) => (
              <ActivityCard key={`${day.day_number}-${index}`} activity={activity} index={index} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
