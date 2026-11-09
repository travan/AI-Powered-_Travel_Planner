import { randomInt } from "node:crypto";
import type { TripWeather } from "@travel/types";
import * as travelTypes from "@travel/types";
const { flexibleMonthWindows } =
  (travelTypes as unknown as { default?: typeof travelTypes }).default ??
  travelTypes;

export type DateWindow = { start: string; end: string };

/** Compare complete forecasts only; monthly climate cannot distinguish days. */
export function selectFlexibleWindow(
  windows: DateWindow[],
  citySlugs: string[],
  weather: TripWeather[],
  pick: (length: number) => number = randomInt,
): DateWindow & { basis: "forecast" | "seasonal_or_unavailable" } {
  if (!windows.length)
    throw new Error("No available dates in the selected month");
  const byDate = new Map(
    weather.map((row) => [`${row.city_slug}:${row.date}`, row]),
  );
  const ranked = windows.flatMap((window) => {
    let score = 0;
    if (!citySlugs.length) return [];
    for (let date = window.start; date <= window.end; ) {
      for (const city of citySlugs) {
        const row = byDate.get(`${city}:${date}`);
        // Missing/partial observations must not appear better than a rainy day.
        if (
          row?.status !== "forecast" ||
          row.partial ||
          row.precipitation_mm == null ||
          row.temperature_min == null ||
          row.temperature_max == null
        )
          return [];
        score +=
          Math.max(0, row.precipitation_mm) * 3 +
          Math.max(0, 15 - row.temperature_min) +
          Math.max(0, row.temperature_max - 30);
      }
      date = new Date(Date.parse(`${date}T00:00:00Z`) + 86400000)
        .toISOString()
        .slice(0, 10);
    }
    return [{ ...window, score }];
  });
  if (!ranked.length)
    return {
      ...windows[pick(windows.length)]!,
      basis: "seasonal_or_unavailable",
    };
  const best = Math.min(...ranked.map((window) => window.score));
  const ties = ranked.filter((window) => Math.abs(window.score - best) < 0.001);
  const selected = ties[pick(ties.length)]!;
  return { start: selected.start, end: selected.end, basis: "forecast" };
}

export function flexibleMonthDates(month: string, today: string): string[] {
  return flexibleMonthWindows(month, 1, today).map((window) => window.start);
}
