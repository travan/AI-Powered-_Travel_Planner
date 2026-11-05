import { describe, expect, it } from "vitest";
import {
  activityMinutes,
  mealSlot,
  timelineMinutes,
  type Activity,
} from "../../../../packages/types/src";
import { normalizeOllamaItinerary } from "../../../../packages/ai/src/providers/ollama";

describe("legacy timeline compatibility", () => {
  it.each([
    ["1:00 PM", 780],
    ["10:00 AM", 600],
    ["12:00 AM", 0],
    ["12:00 PM", 720],
    ["23:59", 1439],
    ["24:00", null],
    ["13:00 PM", null],
    ["08:99", null],
  ])("parses %s without inventing a time", (time, expected) => {
    expect(timelineMinutes(time)).toBe(expected);
  });
  it("recovers the meal slot from stored English and Vietnamese meal titles", () => {
    expect(
      mealSlot({
        name: "Lunch at Kani Doraku",
        time: "1:00 PM",
        category: "attraction",
      } as Activity),
    ).toBe("lunch");
    expect(
      mealSlot({ name: "Ăn sáng tại chợ", time: "08:00" } as Activity),
    ).toBe("breakfast");
    expect(
      mealSlot({
        name: "Coffee",
        time: "08:00",
        category: "food",
        kind: "cafe",
      } as Activity),
    ).toBeUndefined();
  });
  it("normalizes meals before validation without inventing transfer time", () => {
    const result = normalizeOllamaItinerary({
      days: [
        {
          activities: [
            {
              name: "Lunch at Kani Doraku",
              category: "Dining",
              time: "1:00 PM",
              duration: "1 hour",
              cost: null,
            },
          ],
        },
      ],
    });
    expect(result.days[0]?.activities[0]).toMatchObject({
      kind: "meal",
      meal_slot: "lunch",
      category: "food",
      time: "13:00",
      duration_minutes: 60,
      cost: null,
    });
    expect(result.days[0]?.activities[0]?.travel_minutes).toBeUndefined();
    expect(activityMinutes({ duration: "1 giờ 30 phút" } as Activity)).toBe(90);
  });
});
