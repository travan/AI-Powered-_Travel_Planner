"use client";

import type { Itinerary } from "@travel/types";
import { Badge } from "@travel/ui";

interface Props {
  itinerary: Itinerary;
}

export function OverviewCard({ itinerary }: Props) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-6 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900" data-testid="web-itinerary-title">{itinerary.title}</h1>
          <p className="mt-1 text-sm text-gray-500">
            {itinerary.num_days} day{itinerary.num_days !== 1 ? "s" : ""} · {itinerary.num_travelers} traveler
            {itinerary.num_travelers !== 1 ? "s" : ""}
          </p>
        </div>
        <Badge variant="info" className="text-sm px-3 py-1">
          {itinerary.currency} {itinerary.total_cost.toLocaleString()}
        </Badge>
      </div>

      <p className="text-gray-700 leading-relaxed">{itinerary.overview}</p>

      {/* Day plan pills */}
      <div className="flex flex-wrap gap-2">
        {itinerary.days.map((day) => (
          <span
            key={day.day_number}
            className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700 ring-1 ring-brand-200"
          >
            <span className="font-bold">Day {day.day_number}</span>
            <span>{day.city}</span>
          </span>
        ))}
      </div>

      {/* Budget estimate */}
      {itinerary.budget_breakdown && (
        <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-4 py-3">
          <svg
            className="h-5 w-5 text-emerald-600 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span className="text-sm font-medium text-emerald-800">
            Estimated budget: {itinerary.budget_breakdown.currency} {itinerary.budget_breakdown.total.toLocaleString()}
          </span>
        </div>
      )}

      {/* Highlights */}
      {itinerary.seasonal_notes?.highlights && itinerary.seasonal_notes.highlights.length > 0 && (
        <div className="space-y-1.5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            Trip highlights
          </h3>
          <ul className="grid gap-1 sm:grid-cols-2">
            {itinerary.seasonal_notes.highlights.map((h, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-brand-400 shrink-0" />
                {h}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
