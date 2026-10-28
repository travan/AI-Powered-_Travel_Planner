import { describe, expect, it } from "vitest";
import {
  applyItineraryTranslation,
  itineraryTextSegments,
  type Itinerary,
} from "../../../../../packages/types/src/index";
import { protectTranslationText } from "../../../../../apps/server/src/modules/itinerary/journey/translation-text";
const plan = {
  locale: "en",
  id: "source",
  version: 7,
  title: "Đà Nẵng",
  overview: "Walk at Café 123 at 09:30. Cost 500,000 VND.",
  days: [
    {
      id: "day-one",
      date: "2026-11-20",
      city: "Đà Nẵng",
      day_number: 1,
      title: "A day",
      daily_cost_estimate: 500000,
      activities: [
        {
          id: "item-one",
          name: "Café 123",
          description: "Visit Café 123.",
          time: "09:30",
          cost: 500000,
          currency: "VND",
          duration: "1h",
          category: "food",
          maps_link: "https://maps.google.com/?q=123",
          locked: true,
        },
      ],
    },
  ],
  hotels: [],
  restaurants: [],
  suggestions: [],
  transport_summary: [],
  total_cost: 500000,
  currency: "VND",
  num_days: 1,
  num_travelers: 2,
  seasonal_notes: { weather_note: "Warm", highlights: [], warnings: [] },
  budget_breakdown: { total: 500000 },
} as Itinerary;
describe("text-only itinerary translations", () => {
  it("exposes descriptive strings and preserves every other field", () => {
    const segments = itineraryTextSegments(plan);
    expect(Object.keys(segments)).toEqual([
      "overview",
      "seasonal_notes.weather_note",
      "days.0.activities.0.description",
    ]);
    const translated = applyItineraryTranslation(plan, {
      overview: "Đi bộ và nghỉ ngơi.",
      "days.0.activities.0.description": "Ghé Café 123.",
    });
    expect(translated.overview).toBe("Đi bộ và nghỉ ngơi.");
    expect({ ...translated, overview: plan.overview, days: plan.days }).toEqual(
      plan,
    );
    expect({
      ...translated.days[0]!.activities[0],
      description: plan.days[0]!.activities[0]!.description,
    }).toEqual(plan.days[0]!.activities[0]);
    expect(plan.overview).toContain("Walk");
  });
  it("rejects unauthorized paths, prototype paths and non-text output", () => {
    for (const texts of [
      { "days.0.activities.0.time": "11:00" },
      { "__proto__.polluted": "yes" },
      { overview: 9 },
      { overview: "" },
    ])
      expect(() =>
        applyItineraryTranslation(plan, texts as Record<string, string>),
      ).toThrow();
  });
  it("masks names, numbers and links inside text and restores them exactly", () => {
    const safe = protectTranslationText(plan, { overview: plan.overview });
    expect(safe.texts.overview).not.toContain("Café 123");
    expect(safe.texts.overview).not.toContain("09:30");
    expect(
      safe.restore({
        overview: safe.texts.overview!.replace("Walk at", "Ghé"),
      }),
    ).toEqual({ overview: plan.overview.replace("Walk at", "Ghé") });
  });
  it("rejects missing, repeated or altered invariant tokens and changed keys", () => {
    const safe = protectTranslationText(plan, { overview: plan.overview });
    expect(() => safe.restore({ overview: "Changed 08:00" })).toThrow();
    expect(() =>
      safe.restore({ overview: safe.texts.overview + " __KEEP_0__" }),
    ).toThrow();
    expect(() => safe.restore({ other: safe.texts.overview! })).toThrow();
    expect(() =>
      safe.restore({ overview: safe.texts.overview!, added: "extra" }),
    ).toThrow();
  });
});
