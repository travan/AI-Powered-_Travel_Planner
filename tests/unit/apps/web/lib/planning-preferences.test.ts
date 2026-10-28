import { describe, expect, it } from "vitest";
import {
  appendPlanningPreferences,
  DEFAULT_PLANNING_PREFERENCES,
  restorePlanningPreferences,
} from "../../../../../apps/web/lib/planning-preferences";

describe("planning preferences through saved search/login", () => {
  it("preserves route, stay and food criteria and resolves the return endpoint", () => {
    const preferences = {
      ...DEFAULT_PLANNING_PREFERENCES,
      origin: "Hanoi",
      endPoint: "Da Lat",
      rooms: "2",
      lodgingCriteria: "Twin beds",
      diningCriteria: "Vegetarian",
      cafeCriteria: "Quiet, local coffee",
    };
    const prompt = appendPlanningPreferences("Plan Da Nang", preferences);
    expect(restorePlanningPreferences(prompt)).toEqual({
      ...preferences,
      endPoint: "Hanoi",
    });
    expect(prompt).toContain("Plan Da Nang");
  });
  it("keeps a different final destination for a one-way journey", () => {
    const preferences = {
      ...DEFAULT_PLANNING_PREFERENCES,
      origin: "Hanoi",
      returnToOrigin: false,
      endPoint: "Hue",
    };
    expect(
      restorePlanningPreferences(
        appendPlanningPreferences("Trip", preferences),
      ),
    ).toEqual(preferences);
  });
  it("restores old/malformed drafts safely and ignores wrong field types", () => {
    expect(restorePlanningPreferences("Old saved trip")).toEqual(
      DEFAULT_PLANNING_PREFERENCES,
    );
    expect(
      restorePlanningPreferences("Trip\nPLANNING_PREFERENCES_JSON: broken"),
    ).toEqual(DEFAULT_PLANNING_PREFERENCES);
    expect(
      restorePlanningPreferences(
        'Trip\nPLANNING_PREFERENCES_JSON: {"returnToOrigin":"false","origin":42}',
      ),
    ).toEqual(DEFAULT_PLANNING_PREFERENCES);
  });
});
