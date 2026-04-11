"use client";

import type { TransportOption } from "@travel/types";

const MODE_ICONS: Record<string, string> = {
  flight: "✈️",
  train: "🚆",
  bus: "🚌",
  car_rental: "🚗",
  motorbike_rental: "🛵",
  taxi: "🚕",
  ferry: "⛴️",
  walk: "🚶",
};

interface Props {
  segments: TransportOption[];
}

export function TransportSection({ segments }: Props) {
  if (!segments || segments.length === 0) return null;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-6 space-y-4">
      <h2 className="font-semibold text-gray-900 text-lg">Getting Around</h2>

      <div className="grid gap-4 sm:grid-cols-2">
        {segments.map((seg, i) => (
          <div
            key={i}
            className="flex flex-col gap-3 rounded-xl border border-gray-100 bg-gray-50 p-4"
          >
            {/* Route header */}
            <div className="flex items-center gap-2">
              <span className="text-xl">{MODE_ICONS[seg.mode] ?? "🚀"}</span>
              <div>
                <p className="font-medium text-gray-900 text-sm">
                  {seg.from} → {seg.to}
                </p>
                <p className="text-xs text-gray-500 capitalize">
                  {seg.mode.replace(/_/g, " ")}
                  {seg.duration_hours != null && ` · ~${seg.duration_hours}h`}
                  {seg.distance_km != null && ` · ${Math.round(seg.distance_km)} km`}
                </p>
              </div>
            </div>

            {/* Price */}
            {seg.estimated_price != null && (
              <p className="text-sm font-semibold text-emerald-700">
                ~{seg.currency ?? "USD"} {seg.estimated_price.toLocaleString()}
              </p>
            )}

            {/* Booking links */}
            {seg.booking_links && seg.booking_links.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {seg.booking_links.map((link, j) => (
                  <a
                    key={j}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-xs font-medium ring-1 ring-gray-300 hover:ring-brand-400 hover:text-brand-700 transition-colors"
                  >
                    {link.provider}
                  </a>
                ))}
              </div>
            )}

            {/* Notes */}
            {seg.notes && (
              <p className="text-xs text-gray-500 italic">{seg.notes}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
