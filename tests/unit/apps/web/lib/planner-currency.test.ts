import { describe, expect, it } from "vitest";
import { emptyPlanner } from "../../../../../apps/web/lib/planner-model";
import {
  convertPlannerCurrency,
  hasPlannerMoney,
  plannerMoneyKey,
  withPlannerMoney,
} from "../../../../../apps/web/lib/planner-currency";
const quote = {
  from: "USD",
  to: "VND",
  rate: 25000,
  updated_at: "2026-11-08T00:00:00Z",
  expires_at: "2026-11-09T00:00:00Z",
  source_url: "https://www.exchangerate-api.com",
};
describe("planner currency amounts", () => {
  it("converts every monetary preference together without altering the source or trip constraints", () => {
    const form = emptyPlanner("en");
    form.planning.budget.total = 1000;
    form.planning.stay_preferences.nightly_budget = 100;
    form.planning.dining_preferences.per_person_budget = 5;
    form.planning.transport_preferences.total_price = 200;
    form.planning.journey.origin.label = "Hà Nội";
    const converted = convertPlannerCurrency(form, quote);
    expect(converted.planning.budget).toEqual({
      total: 25000000,
      currency: "VND",
    });
    expect(converted.planning.stay_preferences.nightly_budget).toBe(2500000);
    expect(converted.planning.dining_preferences.per_person_budget).toBe(
      125000,
    );
    expect(converted.planning.transport_preferences.total_price).toBe(5000000);
    expect(converted.planning.journey).toEqual(form.planning.journey);
    expect(form.planning.budget).toEqual({ total: 1000, currency: "USD" });
  });
  it("preserves unset values and rounds according to the target currency", () => {
    const form = emptyPlanner("vi");
    form.planning.budget.total = 1000;
    const converted = convertPlannerCurrency(form, {
      ...quote,
      from: "VND",
      to: "USD",
      rate: 1 / 25769,
    });
    expect(converted.planning.budget.total).toBe(0.04);
    expect(converted.planning.stay_preferences.nightly_budget).toBeUndefined();
    expect(hasPlannerMoney(emptyPlanner())).toBe(false);
    expect(() =>
      convertPlannerCurrency(form, { ...quote, from: "VND", rate: 0 }),
    ).toThrow();
  });
  it("can restore the exact original money while retaining later non-money edits", () => {
    const original = emptyPlanner("vi");
    original.planning.budget.total = 1000;
    const converted = convertPlannerCurrency(original, {
      ...quote,
      from: "VND",
      to: "USD",
      rate: 1 / 25769,
    });
    converted.planning.journey.origin.label = "Huế";
    const restored = withPlannerMoney(converted, original);
    expect(plannerMoneyKey(restored)).toBe(plannerMoneyKey(original));
    expect(restored.planning.journey.origin.label).toBe("Huế");
  });
});
