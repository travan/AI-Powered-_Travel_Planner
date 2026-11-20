import { describe, expect, it } from "vitest";
import { validateCanaryPlan } from "../../scripts/check-production-generation.mjs";

function sample() {
  const activity = (kind, time, duration_minutes, extra = {}) => ({
    kind,
    time,
    duration_minutes,
    name: `${kind} ${time}`,
    description: "A proposed activity",
    price: { amount: 0 },
    ...extra,
  });
  return {
    request: {
      num_days: 1,
      currency: "VND",
      cities: ["ha-giang"],
      planning: {
        journey: { origin: { label: "Hanoi" }, return_to_origin: true },
      },
    },
    plan: {
      currency: "VND",
      total_cost: 2,
      budget_breakdown: {
        complete: true,
        total: 2,
        accommodation: 0,
        food: 0,
        activities: 0,
        transport: 2,
        contingency: 0,
      },
      days: [
        {
          day_number: 1,
          date: "2027-01-01",
          city: "Ha Giang",
          city_slug: "ha-giang",
          destination_slug: "ha-giang",
          activities: [
            activity("transfer", "08:30", 360, { main_transport: true }),
            activity("meal", "12:00", 60, { during_transport: true }),
            activity("visit", "14:45", 60),
          ],
        },
      ],
      transport_summary: [
        { from: "Hanoi", to: "Ha Giang", price: { amount: 1 } },
        { from: "Ha Giang", to: "Hanoi", price: { amount: 1 } },
      ],
    },
  };
}
describe("production transit meals", () => {
  it("accepts a meal fully contained in a main travel leg", () => {
    const { plan, request } = sample();
    expect(() => validateCanaryPlan(plan, request)).not.toThrow();
  });
  it.each([
    "not-marked",
    "outside-leg",
    "flagged-visit",
    "overlapping-visit",
    "overlapping-meal",
  ])("rejects an actual conflict: %s", (scenario) => {
    const { plan, request } = sample();
    const activities = plan.days[0].activities;
    if (scenario === "not-marked") delete activities[1].during_transport;
    if (scenario === "outside-leg") activities[1].duration_minutes = 180;
    if (scenario === "flagged-visit") activities[1].kind = "visit";
    if (scenario === "overlapping-visit") activities[2].time = "13:30";
    if (scenario === "overlapping-meal")
      activities.push({ ...activities[1], time: "12:30" });
    expect(() => validateCanaryPlan(plan, request)).toThrow(
      "Overlapping activities",
    );
  });
});
