import { describe, expect, it } from "vitest";
import {
  buildEditedScheduleDays,
  localDateKey,
  withEditedSchedule,
} from "../../../../../apps/web/lib/schedule-preview";
import type { Itinerary } from "@travel/types";
import type { TripActivity } from "../../../../../apps/web/lib/workspace-api";
const plan = {
  currency: "VND",
  days: [
    {
      date: "2027-01-01",
      city: "Hanoi",
      title: "Original day",
      transport: "walk",
    },
  ],
} as unknown as Itinerary;
const activity = (input: Partial<TripActivity> = {}): TripActivity =>
  ({
    id: "activity",
    title: "Museum",
    category: "attraction",
    scheduledAt: "2027-01-01T10:00:00",
    locationName: "Old town",
    address: "1 Main street",
    estimatedCost: 100,
    currency: "VND",
    status: "done",
    createdAt: "2026-11-01",
    ...input,
  }) as TripActivity;
describe("edited schedule preview", () => {
  it("groups local dates, sorts timed stops before unscheduled stops, and preserves costs", () => {
    const days = buildEditedScheduleDays(plan, [
      activity({ id: "late", scheduledAt: null, createdAt: "2026-11-03" }),
      activity({ id: "early", scheduledAt: null }),
      activity({ scheduledAt: "2027-01-02T11:00:00" }),
      activity({ scheduledAt: "2027-01-01T09:00:00" }),
      activity({ scheduledAt: "2027-01-01T08:00:00", estimatedCost: null }),
    ]);
    expect(days).toHaveLength(3);
    expect(days[0]!.title).toBe("Original day");
    expect(days[0]!.activities.map((a) => a.time)).toEqual(["08:00", "09:00"]);
    expect(days[0]!.daily_cost_estimate).toBe(100);
    expect(days[2]!.date).toBe("");
    expect(days[2]!.title).toBe("Unscheduled activities");
    expect(days[2]!.activities[0]!.time).toBe("Time not set");
    expect(days[0]!.activities[0]!.maps_link).toContain(
      "Museum%20Old%20town%201%20Main%20street",
    );
    expect(withEditedSchedule(plan, days)).toMatchObject({
      currency: "VND",
      num_days: 3,
      days,
    });
    expect(plan.days).toHaveLength(1);
  });
  it.each([
    ["restaurant", "food"],
    ["meal", "food"],
    ["cafe", "food"],
    ["coffee", "food"],
    ["transit", "transport"],
    ["transportation", "transport"],
    ["hotel", "accommodation"],
    ["stay", "accommodation"],
    ["lodging", "accommodation"],
    ["gift shop", "shopping"],
    ["unknown", "leisure"],
    ["food", "food"],
  ])(
    "maps edited category %s to the timeline category %s",
    (category, expected) => {
      expect(
        buildEditedScheduleDays(plan, [activity({ category })])[0]!
          .activities[0]!.category,
      ).toBe(expected);
    },
  );
  it.each([
    ["done", "Completed"],
    ["cancelled", "Cancelled"],
    ["rejected", "Not approved"],
    ["pending_review", "Pending host review"],
    ["planned", ""],
  ])("preserves the %s review status", (status, expected) => {
    expect(
      buildEditedScheduleDays(plan, [
        activity({ status, address: null, locationName: null }),
      ])[0]!.activities[0]!.description,
    ).toBe(expected);
  });
  it("handles invalid dates, empty original schedules and missing optional location fields", () => {
    const empty = { currency: "USD", days: [] } as unknown as Itinerary;
    const days = buildEditedScheduleDays(empty, [
      activity({
        scheduledAt: "invalid",
        locationName: null,
        address: null,
        currency: "",
      }),
    ]);
    expect(days[0]!.city).toBe("Trip schedule");
    expect(days[0]!.activities[0]!.currency).toBe("USD");
    expect(
      buildEditedScheduleDays(empty, [activity({ scheduledAt: null })])[0]!
        .city,
    ).toBe("Old town");
    expect(
      buildEditedScheduleDays(
        {
          ...plan,
          days: [
            { date: "invalid", city: "", title: "" },
            { date: "", city: "", title: "" },
          ],
        } as Itinerary,
        [activity()],
      )[0]!.title,
    ).toBe("Updated schedule");
    expect(localDateKey(new Date(2027, 0, 2))).toBe("2027-01-02");
    expect(buildEditedScheduleDays(plan, [])).toEqual([]);
  });
});
