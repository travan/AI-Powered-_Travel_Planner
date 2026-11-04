import { describe, expect, it, vi } from "vitest";
import {
  PlannerLearningService,
  safeMemoryText,
} from "../../../../../../apps/server/src/modules/itinerary/learning/learning.service";
import type { ItineraryInput } from "@travel/types";
describe("planner learning data boundaries", () => {
  it("masks contact details, links and IDs in bounded historical memory", () => {
    const result = safeMemoryText(
      "email person@example.com call +84 987 654 321 https://private.invalid 12345678-1234-1234-1234-123456789abc",
    );
    expect(result).not.toContain("person@example.com");
    expect(result).not.toContain("987");
    expect(result).not.toContain("private.invalid");
    expect(result).not.toContain("12345678-1234");
    expect(safeMemoryText("x".repeat(3000))).toHaveLength(700);
  });
  it("does not query personal history or expenses when memory is disabled", async () => {
    const query = vi
      .fn()
      .mockResolvedValue({
        rows: [{ memory_enabled: false, training_consent: true }],
      });
    const result = await new PlannerLearningService({ query }).context(
      "owner",
      { cities: ["da-nang"] } as ItineraryInput,
      "request",
    );
    expect(result.costs).toEqual([]);
    expect(result.preferences).toEqual([]);
    expect(query).toHaveBeenCalledTimes(1);
  });
  it("refuses dataset preparation before opt-in", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    await expect(
      new PlannerLearningService({ query }).dataset("owner"),
    ).rejects.toMatchObject({
      response: { code: "TRAINING_CONSENT_REQUIRED" },
    });
    expect(query).toHaveBeenCalledTimes(1);
  });
  it("exports structured reviewed plans without source IDs, dates, free text or booking details", async () => {
    const plan = {
      title: "Private name",
      overview: "private@example.com",
      num_days: 1,
      num_travelers: 2,
      currency: "VND",
      trip_style: "mixed",
      city_catalog: { "da-nang": { name: { en: "Da Nang" } } },
      days: [
        {
          day_number: 1,
          date: "2026-11-04",
          city_slug: "da-nang",
          activities: [
            {
              id: "secret-id",
              name: "Private home",
              description: "Address 123",
              kind: "meal",
              category: "food",
              time: "12:00",
              duration_minutes: 60,
              cost: 100,
            },
          ],
        },
      ],
      planning: {
        budget: { total: 300 },
        experience_preferences: { pace: "relaxed" },
        transport_preferences: { booking_reference: "secret-booking" },
      },
    };
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [{ memory_enabled: true, training_consent: true }],
      })
      .mockResolvedValueOnce({ rows: [{ result: plan, rating: 5 }] })
      .mockResolvedValueOnce({ rows: [] });
    const text = JSON.stringify(
      await new PlannerLearningService({ query }).dataset("owner"),
    );
    for (const privateText of [
      "Private name",
      "private@example.com",
      "2026-11-04",
      "secret-id",
      "Private home",
      "Address 123",
      "secret-booking",
    ])
      expect(text).not.toContain(privateText);
    expect(text).toContain("Da Nang");
    expect(text).toContain("user_reviewed");
  });
});
