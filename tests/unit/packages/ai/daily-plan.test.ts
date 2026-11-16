import { describe, it, expect, vi } from "vitest";
import {
  dailySlots,
  prepareDailySlots,
  generateDailyPlan,
} from "../../../../packages/ai/src/providers/daily-plan";
import { normalizeOllamaItinerary } from "../../../../packages/ai/src/providers/ollama";
import type { ItineraryInput, ItineraryOverview } from "@travel/types";
import capturedOutline from "../../fixtures/malaysia-singapore-outline.json";
import { malaysiaSingaporeRequest } from "../../fixtures/malaysia-singapore-request";
import { validateDayOutput } from "../../../../packages/ai/src/providers/daily-plan-validation";
const input: ItineraryInput = {
  cities: ["hanoi"],
  num_days: 3,
  num_travelers: 2,
  locale: "en",
  currency: "USD",
  trip_style: "mid_range",
};
const overview: ItineraryOverview = {
  title: "Hanoi",
  overview: "",
  cities: ["Hanoi"],
  total_days: 3,
  day_plan: [],
  estimated_budget: { min: 0, max: 0, currency: "USD" },
};
const description =
  "Walk through the named area and focus on the distinctive buildings and local street life along this route. This fits the day's neighborhood theme without unnecessary backtracking. Take a short break and allow time to reach the following stop comfortably.";
describe("complete daily planning", () => {
  it("reproduces the populated 26-word return rejected after real day 8 repair", () => {
    const description =
      "Trở về khách sạn sau một ngày khám phá. Hãy nghỉ ngơi và chuẩn bị cho ngày mai. Khách sạn là nơi nghỉ ngơi thoải mái.";
    const response = {
      activities: {
        return: {
          name: "Trở về khách sạn",
          description,
          price: {
            amount: 0,
            currency: "VND",
            scope: "person",
            basis: "planning_estimate",
            assumption: "đã bao gồm trong chi phí di chuyển trong ngày",
          },
        },
      },
    };
    expect(description.split(/\s+/)).toHaveLength(26);
    expect(
      validateDayOutput(
        response,
        [{ slot_id: "return", kind: "transfer" }],
        malaysiaSingaporeRequest(),
        false,
        () => false,
      ),
    ).toMatchObject([{ slot: "return", code: "DAY_ENTRY_INCOMPLETE" }]);
  });

  it("repairs only duplicated positions in the outline captured from Workers AI", async () => {
    const request = malaysiaSingaporeRequest();
    const generate = vi.fn(
      async (_prompt: string, _tokens: number, schema: any) => {
        if (schema.properties.days) return structuredClone(capturedOutline);
        if (schema.properties.replacements)
          return {
            replacements: Object.fromEntries(
              schema.properties.replacements.required.map((id: string) => [
                id,
                `Another Singapore venue ${id}`,
              ]),
            ),
          };
        return {
          activities: Object.fromEntries(
            Object.entries(schema.properties.activities.properties).map(
              ([id, slot]: [string, any]) => [
                id,
                {
                  name: slot.properties.name.const ?? id,
                  description,
                  price: {
                    amount: slot.properties.price.properties.amount.const ?? 10,
                    currency: "VND",
                    scope: "person",
                    basis: "planning_estimate",
                    assumption: "Budget estimate, confirm with the venue.",
                  },
                },
              ],
            ),
          ),
        };
      },
    );
    const result = await generateDailyPlan(
      request,
      { ...overview, total_days: 10 },
      [],
      generate,
      normalizeOllamaItinerary,
    );
    expect(result.days).toHaveLength(10);
    expect(generate).toHaveBeenCalledTimes(12);
    expect(Object.keys(generate.mock.calls[1]![2].properties)).toEqual([
      "replacements",
    ]);
    expect(generate.mock.calls[1]![1]).toBeLessThan(5000);
    const visits = result.days.flatMap((day) =>
      day.activities.filter((a) => a.kind === "visit"),
    );
    expect(visits).toHaveLength(40);
    expect(new Set(visits.map((entry) => entry.name)).size).toBe(40);
  });

  it("repairs a missing lunch on that day without regenerating the entire week", async () => {
    let missing = true;
    const generate = vi.fn(async (prompt: string) => {
      if (prompt.startsWith("Plan a geographically"))
        return {
          days: Array.from({ length: 3 }, (_, i) => ({
            day_number: i + 1,
            city: "Hanoi",
            title: `Area ${i + 1}`,
            places: Array.from({ length: 5 }, (_, j) => `Venue ${i}-${j}`),
            all_day: false,
          })),
          hotels: [],
          transport_summary: [],
        };
      const slots = JSON.parse(prompt.match(/REQUIRED SLOTS: ([^\n]+)/)![1]!);
      const day = JSON.parse(
        prompt.match(/TODAY'S ROUTE[^\n]*: ([^\n]+)/)![1]!,
      );
      let v = 0;
      const rows = slots.map((s: any) => ({
        slot_id: s.slot_id,
        name:
          s.place_name ?? (s.kind === "visit" ? day.places[v++] : s.slot_id),
        description,
        price: {
          amount: ["return", "check_in", "check_out"].includes(s.slot_id)
            ? 0
            : 10,
          currency: "USD",
          scope: "person",
          status: "estimated",
          basis: "planning_estimate",
          assumption: "Rounded daily allowance, not a current service quote.",
        },
      }));
      if (missing) {
        missing = false;
        return { activities: rows.filter((a: any) => a.slot_id !== "lunch") };
      }
      return { activities: rows };
    });
    const result = await generateDailyPlan(
      input,
      overview,
      [],
      generate,
      normalizeOllamaItinerary,
    );
    expect(generate).toHaveBeenCalledTimes(5);
    expect(
      result.days.map((day) =>
        day.activities.filter((a) => a.kind === "meal").map((a) => a.meal_slot),
      ),
    ).toEqual(Array(3).fill(["breakfast", "lunch", "dinner"]));
  });
  it("respects supplied arrival and departure windows instead of forcing every slot", () => {
    const outline = {
      day_number: 1,
      city: "Hanoi",
      title: "",
      places: ["a", "b", "c", "d"],
      all_day: false,
    };
    const slots = dailySlots(
      {
        ...input,
        planning: {
          transport_preferences: {
            arrival_at: "2026-12-01T15:00",
            departure_at: "2026-12-01T22:00",
            mode: "flight",
            airport_buffer_minutes: 120,
          },
        } as any,
      },
      outline,
      "2026-12-01",
    );
    expect(slots.map((slot) => slot.slot_id)).toEqual(["cafe", "dinner"]);
  });
});

it.each([3, 4, 6])(
  "keeps the requested daily pace with %i visits and non-overlapping slots",
  (count) => {
    const slots = dailySlots(
      input,
      {
        day_number: 2,
        city: "Hanoi",
        title: "",
        places: Array.from({ length: count }, (_, i) => `Place ${i}`),
        all_day: false,
      },
      "",
    );
    expect(slots.filter((slot) => slot.kind === "visit")).toHaveLength(count);
    let end = 0;
    for (const slot of slots) {
      const [h, m] = slot.time.split(":").map(Number);
      const start = h! * 60 + m!;
      expect(start).toBeGreaterThanOrEqual(end);
      end = start + slot.duration_minutes;
    }
  },
);
it("keeps park dinner nearby and ends the final day at the airport, not the checked-out hotel", () => {
  const planning = {
    transport_preferences: { mode: "flight" },
    journey: { origin: { label: "Hanoi" } },
  } as any;
  const park = prepareDailySlots(
    { ...input, num_days: 7, planning },
    {
      day_number: 3,
      city: "Osaka",
      title: "USJ",
      places: [
        "Universal Studios Japan",
        "Super Nintendo World",
        "Harry Potter",
      ],
      all_day: true,
    },
    "",
  );
  expect(park.find((slot) => slot.slot_id === "dinner")?.place_name).toContain(
    "Universal Studios Japan",
  );
  expect(
    park.find((slot) => slot.slot_id === "evening")?.included_admission,
  ).toBe(true);
  const last = prepareDailySlots(
    { ...input, num_days: 7, planning },
    {
      day_number: 7,
      city: "Osaka",
      title: "",
      places: ["a", "b", "c", "d"],
      all_day: false,
    },
    "",
  );
  expect(last.find((slot) => slot.slot_id === "return")?.place_name).toContain(
    "Airport",
  );
});
