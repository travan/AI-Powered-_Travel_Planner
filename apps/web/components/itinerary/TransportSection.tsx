"use client";
import { UiText } from "../i18n/UiText";

import React from "react";
import type { TransportSegment } from "@travel/types";

const MODE_ICONS: Record<string, string> = {
  flight: "✈️",
  train: "🚆",
  bus: "🚌",
  car: "🚗",
  self_drive: "🚙",
  motorbike: "🛵",
  taxi: "🚕",
  bicycle: "🚲",
  boat: "🛥️",
  ferry: "⛴️",
  cruise: "🚢",
  walk: "🚶",
  other: "🧭",
};

interface Props {
  segments: TransportSegment[];
}

export function TransportSection({ segments }: Props) {
  const routes = (Array.isArray(segments) ? segments : []).filter(
    (segment) =>
      segment &&
      typeof segment.from === "string" &&
      segment.from.trim() &&
      typeof segment.to === "string" &&
      segment.to.trim(),
  );
  if (routes.length === 0) return null;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-6 space-y-4">
      <h2 className="font-semibold text-gray-900 text-lg">
        {" "}
        <UiText id="ta7f3acf6ca59" fallback="Getting Around" />{" "}
      </h2>

      <div className="grid gap-4 sm:grid-cols-2">
        {routes.map((seg, i) => (
          <div
            key={i}
            className="flex flex-col gap-3 rounded-xl border border-gray-100 bg-gray-50 p-4"
          >
            {/* Route header */}
            <div className="flex items-center gap-2">
              <span className="text-xl">
                {MODE_ICONS[seg.recommended_mode] ?? "🧭"}
              </span>
              <div>
                <p className="font-medium text-gray-900 text-sm">
                  {seg.from} → {seg.to}
                </p>
                <p className="text-xs text-gray-500 capitalize">
                  {typeof seg.recommended_mode === "string" ? (
                    seg.recommended_mode.replace(/_/g, " ")
                  ) : (
                    <UiText
                      id="tac9906e1aaf8"
                      fallback="Transport to be confirmed"
                    />
                  )}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              {(Array.isArray(seg.options) ? seg.options : [])
                .filter((option) => option && typeof option === "object")
                .map((option, j) => (
                  <div
                    key={j}
                    className="rounded-lg border border-gray-200 bg-white p-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-gray-900">
                        {option.provider}
                      </p>
                      <span className="text-sm font-semibold text-emerald-700">
                        {option.price_range}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      {typeof option.type === "string" ? (
                        option.type.replace(/_/g, " ")
                      ) : (
                        <UiText
                          id="t4a7c2f5f4c5d"
                          fallback="Unknown transport"
                        />
                      )}
                      {option.duration ? ` · ${option.duration}` : ""}
                      {option.departure ? ` · ${option.departure}` : ""}
                      {option.arrival ? ` - ${option.arrival}` : ""}
                    </p>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      {typeof option.booking_url === "string" &&
                        /^https?:\/\//i.test(option.booking_url) && (
                          <a
                            href={option.booking_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-xs font-medium ring-1 ring-gray-300 hover:ring-brand-400 hover:text-brand-700 transition-colors"
                          >
                            {" "}
                            <UiText
                              id="ta4fba6976adf"
                              fallback="Book now"
                            />{" "}
                          </a>
                        )}
                      {option.note && (
                        <span className="text-xs text-gray-500 italic">
                          {option.note}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
