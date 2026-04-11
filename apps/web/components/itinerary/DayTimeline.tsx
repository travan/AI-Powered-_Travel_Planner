"use client";

import type { ItineraryDay } from "@travel/types";
import { ActivityCard } from "./ActivityCard";

interface Props {
  days: ItineraryDay[];
}

export function DayTimeline({ days }: Props) {
  if (!days || days.length === 0) return null;

  return (
    <div className="space-y-8">
      {days.map((day) => (
        <section key={day.day} className="space-y-4">
          {/* Day header */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white shadow">
              {day.day}
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 text-lg">{day.city}</h3>
              {day.date && (
                <p className="text-xs text-gray-400">
                  {new Date(day.date).toLocaleDateString("en-US", {
                    weekday: "long",
                    month: "short",
                    day: "numeric",
                  })}
                </p>
              )}
            </div>
            {day.overnight_city && day.overnight_city !== day.city && (
              <span className="ml-auto text-xs text-gray-500">
                Overnight in {day.overnight_city}
              </span>
            )}
          </div>

          {/* Day summary */}
          {day.summary && (
            <p className="text-sm text-gray-600 pl-14">{day.summary}</p>
          )}

          {/* Activities */}
          <div className="pl-14">
            {day.activities.map((activity, index) => (
              <ActivityCard key={activity.id ?? index} activity={activity} index={index} />
            ))}
          </div>

          {/* Meals summary */}
          {day.meals_summary && (
            <div className="ml-14 rounded-lg bg-orange-50 px-4 py-3 text-sm text-orange-800">
              <span className="font-semibold">Meals:</span> {day.meals_summary}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
