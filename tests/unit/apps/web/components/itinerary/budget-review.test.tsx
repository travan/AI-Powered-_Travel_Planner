import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BudgetBreakdown } from "../../../../../../apps/web/components/itinerary/BudgetBreakdown";
import type { BudgetBreakdown as Budget } from "@travel/types";
const partial: Budget = {
  accommodation: 0,
  food: 100,
  activities: 125,
  transport: 0,
  contingency: 0,
  total: 225,
  currency: "USD",
  per_person: 112.5,
  per_day: 32.142857,
  complete: false,
  missing_items: ["Day 1: missing breakfast."],
  transport_details: { flight: null },
};
describe("partial budget presentation", () => {
  it("labels the subtotal, lists missing items and avoids misleading daily totals", () => {
    const markup = renderToStaticMarkup(
      <BudgetBreakdown breakdown={partial} />,
    );
    expect(markup).toContain("Subtotal");
    expect(markup).toContain("missing breakfast");
    expect(markup).not.toContain("Unknown");
    expect(markup).not.toContain("Per day");
    expect(markup).not.toContain("32.142857");
  });
  it("keeps missing items visible when no priced categories exist", () => {
    expect(
      renderToStaticMarkup(
        <BudgetBreakdown
          breakdown={{ ...partial, food: 0, activities: 0, total: 0 }}
        />,
      ),
    ).toContain("Items not estimated yet");
  });
});

it("shows planning assumptions and itemized group costs instead of hiding estimates", () => {
  const markup = renderToStaticMarkup(
    <BudgetBreakdown
      breakdown={{
        ...partial,
        items: [
          {
            id: "food",
            category: "food",
            label: "Breakfast for two",
            amount: 30,
            status: "estimated",
            basis: "planning_estimate",
            assumption: "15 per person, not a live quote.",
          },
        ],
      }}
    />,
  );
  expect(markup).toContain("Planning allowances, not confirmed quotes");
  expect(markup).toContain("Breakfast for two");
  expect(markup).toContain("15 per person, not a live quote.");
});
