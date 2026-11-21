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
      "days.0.title",
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

it("translates generated titles, system names and budget prose while preserving venue names and money", () => {
  const source = structuredClone(plan);
  const activity = source.days[0]!.activities[0]!;
  activity.kind = "transfer";
  activity.name = "Return to accommodation";
  activity.price = {
    amount: null,
    currency: "VND",
    scope: "group",
    status: "estimated",
    assumption: "Price unavailable.",
  };
  source.budget_breakdown.items = [
    {
      id: "unknown",
      category: "transport",
      label: "Day 1: Café 123",
      amount: null,
      status: "estimated",
      assumption: "Confirm the price.",
    },
  ];
  const segments = itineraryTextSegments(source);
  expect(segments["days.0.title"]).toBe("A day");
  expect(segments["days.0.activities.0.name"]).toBe("Return to accommodation");
  expect(segments["days.0.activities.0.price.assumption"]).toBe(
    "Price unavailable.",
  );
  const safe = protectTranslationText(source, segments);
  expect(safe.texts["days.0.activities.0.name"]).toBe(
    "Return to accommodation",
  );
  const output = safe.restore({
    ...safe.texts,
    "days.0.activities.0.name": "Trở về chỗ ở",
  });
  const translated = applyItineraryTranslation(source, output);
  expect(translated.days[0]!.activities[0]!.name).toBe("Trở về chỗ ở");
  expect(translated.days[0]!.activities[0]!.price).toEqual(activity.price);
  activity.name = "Café 123";
  expect(
    itineraryTextSegments(source)["days.0.activities.0.name"],
  ).toBeUndefined();
  activity.name = "Return to accommodation";
  activity.evidence = { source: "user" };
  expect(
    itineraryTextSegments(source)["days.0.activities.0.name"],
  ).toBeUndefined();
});

it("localizes the photographed generated text and budget labels without changing source or venue names", async () => {
  const { localizedPlan } =
    await import("../../../../../packages/types/src/index");
  const source = structuredClone(plan);
  source.locale = "vi";
  const day = source.days[0]!;
  day.city = "Singapore";
  day.title = "Ngày 1 tại Singapore";
  const activity = day.activities[0]!;
  activity.name = "Trở về chỗ ở";
  activity.kind = "transfer";
  activity.description = `Khung giờ dự kiến cho ${activity.name}. Hãy xác nhận điều kiện, thời gian và giá trước khi đi.`;
  activity.price = {
    amount: null,
    currency: "VND",
    scope: "group",
    status: "estimated",
    assumption:
      "Price unavailable: no verified price source. Excluded from the total.",
  };
  source.budget_breakdown.items = [
    {
      id: "one",
      label: "Ngày 1: Trở về chỗ ở",
      amount: null,
      category: "transport",
      status: "estimated",
    },
  ];
  source.budget_breakdown.missing_items = ["Trở về chỗ ở", "transport"];
  const en = localizedPlan(source, "en");
  expect(en.days[0]!.title).toBe("Day 1 in Singapore");
  expect(en.days[0]!.activities[0]!.name).toBe("Return to accommodation");
  expect(en.days[0]!.activities[0]!.description).toContain(
    "Provisional time for Return to accommodation",
  );
  expect(en.budget_breakdown.items![0]!.label).toBe(
    "Day 1: Return to accommodation",
  );
  expect(en.budget_breakdown.missing_items).toEqual([
    "Return to accommodation",
    "transport",
  ]);
  const vi = localizedPlan(en, "vi");
  expect(vi.days[0]!.activities[0]!.price?.assumption).toContain(
    "Chưa có nguồn giá",
  );
  expect(source.days[0]!.title).toBe("Ngày 1 tại Singapore");
});
