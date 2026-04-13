"use client";

import type { SeasonalNotes } from "@travel/types";

interface Props {
  notes: SeasonalNotes;
}

export function SeasonalNote({ notes }: Props) {
  if (!notes) return null;

  return (
    <div className="rounded-2xl border border-sky-200 bg-sky-50 shadow-sm p-6 space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-2xl">🌤️</span>
        <h2 className="font-semibold text-sky-900 text-lg">Season & Weather</h2>
      </div>

      <p className="text-sm text-sky-800 leading-relaxed">{notes.weather_note}</p>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-lg bg-white/60 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-sky-600">Travel month</p>
          <p className="text-sm text-sky-900">{notes.travel_month}</p>
        </div>
        <div className="rounded-lg bg-white/60 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-sky-600">Daylight</p>
          <p className="text-sm text-sky-900">{notes.daylight_hours}</p>
        </div>
      </div>

      {/* Sunrise / Sunset */}
      {(notes.sunrise_time || notes.sunset_time) && (
        <div className="flex flex-wrap gap-4">
          {notes.sunrise_time && (
            <div className="flex items-center gap-2 text-sm text-amber-700">
              <span>🌅</span>
              <span>
                <span className="font-medium">Sunrise</span> {notes.sunrise_time}
              </span>
            </div>
          )}
          {notes.sunset_time && (
            <div className="flex items-center gap-2 text-sm text-orange-700">
              <span>🌇</span>
              <span>
                <span className="font-medium">Sunset</span> {notes.sunset_time}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Highlights */}
      {notes.highlights && notes.highlights.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-sky-500">Highlights</p>
          <ul className="space-y-1">
            {notes.highlights.map((h, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-sky-800">
                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-sky-400 shrink-0" />
                {h}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Warnings */}
      {notes.warnings && notes.warnings.length > 0 && (
        <div className="space-y-1 rounded-lg bg-yellow-50 border border-yellow-200 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-yellow-600">
            ⚠️ Watch out
          </p>
          <ul className="space-y-1">
            {notes.warnings.map((w, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-yellow-800">
                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-yellow-400 shrink-0" />
                {w}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
