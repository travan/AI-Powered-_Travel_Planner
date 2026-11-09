import { describe, expect, it } from "vitest";
import {
  buildPlannerRequest,
  preparePlannerSubmission,
  mergePlannerCity,
  applyPlannerCurrencyDefault,
  setPlannerDeparture,
  nextPlannerDate,
  emptyPlanner,
  restorePlannerRequest,
} from "../../../../../apps/web/lib/planner-model";
import {
  appendPlanningPreferences,
  DEFAULT_PLANNING_PREFERENCES,
} from "../../../../../apps/web/lib/planning-preferences";
import { validatePlanning } from "@travel/types";
describe("shared planner model", () => {
  it("defaults currency from language without reinterpreting existing monetary preferences", () => {
    expect(emptyPlanner("en").planning.budget.currency).toBe("USD");
    expect(emptyPlanner("vi").planning.budget.currency).toBe("VND");
    const form = emptyPlanner("en");
    expect(
      applyPlannerCurrencyDefault(form, "vi").planning.budget.currency,
    ).toBe("VND");
    form.planning.stay_preferences.nightly_budget = 100;
    expect(applyPlannerCurrencyDefault(form, "vi")).toBe(form);
  });

  it("upgrades a typed name after a city choice without duplicating it or merging different identified cities", () => {
    const identified = {
      slug: "xi-an-cn",
      name: "Tây An",
      names: { en: "Xi'an", vi: "Tây An" },
    };
    expect(
      mergePlannerCity([{ slug: "tây-an", name: "Tây An" }], identified),
    ).toEqual([identified]);
    expect(
      mergePlannerCity([identified], { slug: "tây-an", name: "Tây An" }),
    ).toEqual([identified]);
    expect(
      mergePlannerCity(
        [{ slug: "paris-fr", name: "Paris", names: { en: "Paris" } }],
        { slug: "paris-us", name: "Paris", names: { en: "Paris" } },
      ),
    ).toHaveLength(2);
  });

  it("prepares pending destination text once, without mutating the original draft", () => {
    const form = { ...emptyPlanner(), destinationQuery: " Tây An " };
    form.planning.journey.origin.label = " Hà Nội ";
    const result = preparePlannerSubmission(form, "vi");
    expect(result.request).toMatchObject({
      cities: ["tây-an"],
      city_names: ["Tây An"],
      planning: { journey: { origin: { label: "Hà Nội" } } },
    });
    expect(result.draft.destinationQuery).toBe("");
    expect(form.cities).toEqual([]);
    expect(form.destinationQuery).toBe(" Tây An ");
    const repeat = preparePlannerSubmission(
      { ...result.draft, destinationQuery: "TÂY AN" },
      "vi",
    );
    expect(repeat.draft.cities).toHaveLength(1);
    expect(
      preparePlannerSubmission(restorePlannerRequest(result.request), "vi")
        .request,
    ).toEqual(result.request);
  });

  it("preserves flexible month and duration through saved requests and login", () => {
    const form = {
      ...emptyPlanner(),
      flexible: true,
      month: "2028-02",
      days: 5,
      start: "2028-01-01",
      end: "2028-01-03",
    };
    const request = buildPlannerRequest(form, "vi");
    expect(request).toMatchObject({ flexible_month: "2028-02", num_days: 5 });
    expect(request.start_date).toBeUndefined();
    expect(request.end_date).toBeUndefined();
    const restored = restorePlannerRequest({
      ...request,
      start_date: "2028-02-10",
      end_date: "2028-02-14",
    });
    expect(restored).toMatchObject({
      flexible: true,
      dated: false,
      month: "2028-02",
      days: 5,
    });
    expect(buildPlannerRequest(restored, "vi")).toEqual(request);
    expect(
      buildPlannerRequest({ ...form, dated: true }, "en").flexible_month,
    ).toBeUndefined();
    expect(
      buildPlannerRequest({ ...form, flexible: false }, "en").flexible_month,
    ).toBeUndefined();
  });
  it("keeps the return strictly after departure across month/year boundaries", () => {
    const form = emptyPlanner();
    expect(nextPlannerDate("2026-12-31")).toBe("2027-01-01");
    expect(nextPlannerDate("2028-02-28")).toBe("2028-02-29");
    expect(nextPlannerDate("bad-date")).toBe("");
    expect(setPlannerDeparture(form, "2026-12-31").end).toBe("2027-01-01");
    form.end = "2027-01-06";
    expect(setPlannerDeparture(form, "2027-01-02").end).toBe("2027-01-06");
    expect(setPlannerDeparture(form, "2027-01-06").end).toBe("2027-01-07");
    expect(setPlannerDeparture(form, "2027-01-08").end).toBe("2027-01-09");
    expect(form.end).toBe("2027-01-06");
  });
  it("suggests times for contradictory unbooked drafts, but preserves fixed tickets", () => {
    const form = emptyPlanner();
    form.cities = [{ slug: "taiwan", name: "Taiwan" }];
    form.planning.journey.origin.label = "Hà Nội";
    const transport = form.planning.transport_preferences;
    transport.arrival_at = "2026-11-03T15:07";
    transport.departure_at = "2026-11-01T15:07";
    const request = buildPlannerRequest(form, "en");
    expect(request.planning!.transport_preferences.arrival_at).toBeUndefined();
    expect(
      request.planning!.transport_preferences.departure_at,
    ).toBeUndefined();
    expect(validatePlanning(request).valid).toBe(true);
    expect(transport.arrival_at).toBe("2026-11-03T15:07");
    transport.confirmed = true;
    transport.provider = "Airline";
    const booked = buildPlannerRequest(form, "en");
    expect(booked.planning!.transport_preferences.arrival_at).toBe(
      transport.arrival_at,
    );
    expect(
      validatePlanning(booked).issues.some(
        (i) => i.code === "TRAVEL_TIME_ORDER" && i.severity === "error",
      ),
    ).toBe(true);
    transport.confirmed = false;
    transport.departure_at = "2026-11-05T15:07";
    expect(
      buildPlannerRequest(form, "en").planning!.transport_preferences
        .departure_at,
    ).toBe(transport.departure_at);
  });
  it("normalizes old structured login intents without mutating the source request", () => {
    const form = emptyPlanner();
    const request = buildPlannerRequest(form, "vi");
    request.planning!.dining_preferences.cafe = "Để hệ thống đề xuất";
    expect(
      restorePlannerRequest(request).planning.dining_preferences.cafe,
    ).toBe("");
    expect(request.planning!.dining_preferences.cafe).toBe(
      "Để hệ thống đề xuất",
    );
    expect(
      buildPlannerRequest({ ...form, planning: request.planning! }, "en")
        .planning?.dining_preferences.cafe,
    ).toBe("");
  });
  it("migrates legacy intent without inventing an origin or losing fields", () => {
    const form = restorePlannerRequest({
      cities: ["da-nang"],
      city_names: ["Đà Nẵng"],
      num_days: 5,
      currency: "USD",
      budget: 900,
      trip_style: "family",
      num_travelers: 4,
      prompt_text: "Keep this note",
    });
    const request = buildPlannerRequest(form, "vi");
    expect(request).toMatchObject({
      cities: ["da-nang"],
      budget: 900,
      currency: "USD",
      trip_style: "family",
      num_travelers: 4,
      prompt_text: "Keep this note",
      locale: "vi",
    });
    expect(
      validatePlanning(request).issues.some(
        (i) => i.code === "ORIGIN_REQUIRED",
      ),
    ).toBe(true);
  });
  it("migrates embedded legacy criteria and preserves the original note", () => {
    const note = appendPlanningPreferences("My note", {
      ...DEFAULT_PLANNING_PREFERENCES,
      origin: "Hà Nội",
      returnToOrigin: false,
      endPoint: "Huế",
      rooms: "2",
      lodgingCriteria: "quiet",
      diningCriteria: "vegetarian",
      cafeCriteria: "independent",
      pace: "relaxed",
    });
    const form = restorePlannerRequest({
      cities: ["da-nang"],
      trip_style: "cultural",
      currency: "EUR",
      num_travelers: 3,
      prompt_text: note,
    });
    expect(form.planning.journey).toMatchObject({
      origin: { label: "Hà Nội" },
      endpoint: { label: "Huế" },
      return_to_origin: false,
    });
    expect(form.planning.stay_preferences.rooms).toBe(2);
    expect(form.planning.dining_preferences.requirements[0]?.value).toBe(
      "vegetarian",
    );
    expect(form.prompt).toBe(note);
  });
  it("keeps money and criteria unchanged when only request locale changes", () => {
    const form = emptyPlanner();
    form.forceRefresh = true;
    form.planning.budget = { currency: "JPY", total: 123456 };
    form.planning.journey.origin.label = "Hà Nội";
    const en = buildPlannerRequest(form, "en"),
      vi = buildPlannerRequest(form, "vi");
    expect({ ...en, locale: "vi" }).toEqual(vi);
    expect(en.force_refresh).toBe(true);
  });
});
