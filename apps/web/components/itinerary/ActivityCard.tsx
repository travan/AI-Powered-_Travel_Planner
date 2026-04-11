"use client";

import type { Activity, GoldenMoment, TicketOption } from "@travel/types";
import { Badge } from "@travel/ui";

// ─── Ticket chip ────────────────────────────────────────────────────────────
function TicketChip({ option }: { option: TicketOption }) {
  if (!option.url) return null;
  return (
    <a
      href={option.url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-medium ring-1 ring-gray-300 hover:ring-brand-400 hover:text-brand-700 transition-colors"
    >
      {option.platform}
      {option.price_from !== undefined && (
        <span className="text-gray-400">
          from {option.currency} {option.price_from}
        </span>
      )}
    </a>
  );
}

// ─── Golden moment badge ─────────────────────────────────────────────────────
function GoldenBadge({ moment }: { moment: GoldenMoment }) {
  const icons: Record<string, string> = {
    sunrise: "🌅",
    sunset: "🌇",
    blue_hour: "🌆",
    golden_hour: "✨",
  };
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-amber-200">
      {icons[moment.type] ?? "⭐"} {moment.label}
    </span>
  );
}

// ─── Activity Card ───────────────────────────────────────────────────────────
interface ActivityCardProps {
  activity: Activity;
  index: number;
}

export function ActivityCard({ activity, index }: ActivityCardProps) {
  return (
    <div className="relative flex gap-4">
      {/* Timeline dot */}
      <div className="flex flex-col items-center">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700 ring-2 ring-brand-200">
          {index + 1}
        </div>
        <div className="mt-1 flex-1 w-px bg-gray-200" />
      </div>

      {/* Content */}
      <div className="mb-6 flex-1 rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-3">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="font-semibold text-gray-900">{activity.name}</h4>
              {activity.category && (
                <Badge variant="default" className="text-xs">
                  {activity.category.replace(/_/g, " ")}
                </Badge>
              )}
              {activity.golden_moment && (
                <GoldenBadge moment={activity.golden_moment} />
              )}
            </div>
            {activity.time_slot && (
              <p className="text-xs text-gray-400 mt-0.5">{activity.time_slot}</p>
            )}
          </div>
          {activity.estimated_cost != null && (
            <span className="text-sm font-medium text-emerald-700 whitespace-nowrap">
              ~{activity.currency ?? "USD"} {activity.estimated_cost.toLocaleString()}
            </span>
          )}
        </div>

        {/* Description */}
        {activity.description && (
          <p className="text-sm text-gray-700 leading-relaxed">{activity.description}</p>
        )}

        {/* Tips */}
        {activity.tips && (
          <div className="rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-800">
            <span className="font-semibold">Tip:</span> {activity.tips}
          </div>
        )}

        {/* Ticket options */}
        {activity.ticket_activities && activity.ticket_activities.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {activity.ticket_activities.map((t, i) => (
              <TicketChip key={i} option={t} />
            ))}
          </div>
        )}

        {/* Links */}
        <div className="flex flex-wrap gap-3 pt-1">
          {activity.google_maps_url && (
            <a
              href={activity.google_maps_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-brand-600 hover:underline"
            >
              <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z"
                  clipRule="evenodd"
                />
              </svg>
              View on Maps
            </a>
          )}
          {activity.suggestions && activity.suggestions.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {activity.suggestions.map((s, i) => (
                <a
                  key={i}
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-gray-500 hover:text-brand-600 hover:underline"
                >
                  {s.platform}
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
