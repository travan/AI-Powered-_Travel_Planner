import { describe, expect, it, vi } from "vitest";
import {
  flexibleMonthWindows,
  validatePlanning,
  createPlanningCriteria,
  type TripWeather,
} from "@travel/types";
import { selectFlexibleWindow } from "../../../../../../apps/server/src/modules/itinerary/enrichment/flexible-dates";

const forecast = (
  date: string,
  rain: number,
  extra: Partial<TripWeather> = {},
): TripWeather => ({
  city_slug: "hanoi",
  date,
  timezone: "Asia/Ho_Chi_Minh",
  status: "forecast",
  precipitation_mm: rain,
  temperature_min: 20,
  temperature_max: 27,
  source: "MET Norway",
  source_url: "https://www.met.no",
  ...extra,
});

describe("flexible trip dates", () => {
  it("contains the entire trip in its month and excludes past dates", () => {
    expect(flexibleMonthWindows("2028-02", 3, "2028-02-26")).toEqual([
      { start: "2028-02-26", end: "2028-02-28" },
      { start: "2028-02-27", end: "2028-02-29" },
    ]);
    expect(flexibleMonthWindows("2027-02", 29, "2027-01-01")).toEqual([]);
    expect(flexibleMonthWindows("2028-13", 3, "2027-01-01")).toEqual([]);
    expect(flexibleMonthWindows("2027-02", 3, "2027-03-01")).toEqual([]);
    expect(flexibleMonthWindows("2028-02", 2.5, "2027-01-01")).toEqual([]);
  });
  it("chooses a dry comfortable consecutive window and randomly breaks ties", () => {
    const windows = flexibleMonthWindows("2028-02", 2, "2028-02-26");
    const pick = vi.fn(() => 1);
    const rows = [
      forecast("2028-02-26", 10),
      forecast("2028-02-27", 0),
      forecast("2028-02-28", 0),
      forecast("2028-02-29", 0),
    ];
    expect(selectFlexibleWindow(windows, ["hanoi"], rows, pick)).toEqual({
      start: "2028-02-28",
      end: "2028-02-29",
      basis: "forecast",
    });
    expect(pick).toHaveBeenCalledWith(2);
    rows[3]!.temperature_max = 40;
    expect(selectFlexibleWindow(windows, ["hanoi"], rows, () => 0).start).toBe(
      "2028-02-27",
    );
  });
  it("does not rank incomplete or missing forecasts as good weather", () => {
    const windows = flexibleMonthWindows("2028-02", 1, "2028-02-27");
    const rows = [
      forecast("2028-02-27", 5),
      forecast("2028-02-28", 0, { partial: true }),
      forecast("2028-02-29", 0, { precipitation_mm: undefined }),
    ];
    expect(selectFlexibleWindow(windows, ["hanoi"], rows, () => 0).start).toBe(
      "2028-02-27",
    );
    expect(
      selectFlexibleWindow(windows, ["hanoi", "tokyo"], rows, () => 2),
    ).toEqual({ ...windows[2], basis: "seasonal_or_unavailable" });
  });
  it("uses random dates without claiming climate is a daily forecast", () => {
    const windows = flexibleMonthWindows("2028-02", 3, "2028-01-01");
    const climate = windows.map((window) =>
      forecast(window.start, 0, { status: "climate" }),
    );
    expect(
      selectFlexibleWindow(windows, ["hanoi"], climate, (n) => n - 1),
    ).toEqual({
      start: "2028-02-27",
      end: "2028-02-29",
      basis: "seasonal_or_unavailable",
    });
  });
  it("accepts resolved flexible dates, including a one-day trip", () => {
    const planning = createPlanningCriteria();
    planning.journey.origin.label = "Hanoi";
    const input = {
      planning,
      cities: ["hue"],
      flexible_month: "2090-02",
      num_days: 1,
      start_date: "2090-02-10",
      end_date: "2090-02-10",
    };
    expect(validatePlanning(input).valid).toBe(true);
    expect(validatePlanning({ ...input, end_date: "2090-03-01" }).valid).toBe(
      false,
    );
  });
  it("rejects impossible months and conflicts with fixed bookings", () => {
    expect(
      validatePlanning({ flexible_month: "2000-01", num_days: 3 }).valid,
    ).toBe(false);
    const planning = createPlanningCriteria();
    planning.transport_preferences.confirmed = true;
    expect(
      validatePlanning({ planning, flexible_month: "2028-02", num_days: 3 })
        .issues,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "MONTH_BOOKING_CONFLICT" }),
      ]),
    );
  });
});
