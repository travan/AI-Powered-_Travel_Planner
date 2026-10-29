// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { createPlanningCriteria, type Itinerary } from "@travel/types";
import { JourneySummary } from "../../../../../../apps/web/components/itinerary/JourneySummary";

afterEach(cleanup);

function showRoute(cities: string[], endpoint?: string) {
  const planning = createPlanningCriteria();
  planning.journey.origin = { label: "Hanoi", source: "manual" };
  if (endpoint) {
    planning.journey.return_to_origin = false;
    planning.journey.endpoint = { label: endpoint, source: "manual" };
  }
  const plan = {
    planning,
    days: cities.map((city) => ({ city })),
    num_days: cities.length,
    total_cost: 0,
    currency: "VND",
  } as Itinerary;
  render(<JourneySummary plan={plan} />);
  return within(screen.getByRole("list"))
    .getAllByRole("listitem")
    .map((item) => item.querySelector("span:last-child")?.textContent);
}

describe("journey summary route", () => {
  it("shows Hanoi → Busan → Hanoi when travel days include the origin and return", () => {
    expect(showRoute(["Hanoi", "Busan", "Busan", "Hanoi"])).toEqual([
      "Hanoi",
      "Busan",
      "Hanoi",
    ]);
  });

  it("does not repeat a one-way endpoint already present in the last day", () => {
    expect(showRoute([" Hanoi ", "Busan", "Seoul"], "Seoul")).toEqual([
      "Hanoi",
      "Busan",
      "Seoul",
    ]);
  });

  it("preserves repeat visits separated by another city", () => {
    expect(showRoute(["Busan", "Seoul", "Busan"])).toEqual([
      "Hanoi",
      "Busan",
      "Seoul",
      "Busan",
      "Hanoi",
    ]);
  });
});
