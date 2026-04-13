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
        <section key={day.day_number} className="space-y-4">
          {/* Day header */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white shadow">
              {day.day_number}
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 text-lg">{day.title}</h3>
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
            <span className="ml-auto text-xs text-gray-500">{day.city}</span>
          </div>

          <p className="text-sm text-gray-600 pl-14">Estimated: {day.daily_cost_estimate.toLocaleString()}</p>

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
