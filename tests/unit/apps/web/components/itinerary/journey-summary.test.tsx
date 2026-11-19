// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { createPlanningCriteria, type Itinerary } from "@travel/types";
import { JourneySummary } from "../../../../../../apps/web/components/itinerary/JourneySummary";
import { LanguageProvider } from "../../../../../../apps/web/components/i18n/LanguageProvider";

afterEach(cleanup);

function showRoute(cities: string[], endpoint?: string | null, locale = "en") {
  const planning = createPlanningCriteria();
  planning.journey.origin = { label: "Hanoi", source: "manual" };
  if (endpoint !== undefined) {
    planning.journey.return_to_origin = false;
    if (endpoint !== null)
      planning.journey.endpoint = { label: endpoint, source: "manual" };
  }
  const plan = {
    planning,
    days: cities.map((city) => ({ city })),
    num_days: cities.length,
    total_cost: 0,
    currency: "VND",
  } as Itinerary;
  render(
    <LanguageProvider initialLocale={locale}>
      <JourneySummary plan={plan} />
    </LanguageProvider>,
  );
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

  it("collapses adjacent labels with different case or repeated whitespace", () => {
    expect(
      showRoute([
        " hAnOi ",
        "New   York",
        "new york",
        "BUSAN",
        "Busan",
        "Hanoi",
      ]),
    ).toEqual(["Hanoi", "New York", "BUSAN", "Hanoi"]);
  });

  it("treats composed and decomposed Unicode as the same adjacent stop", () => {
    expect(showRoute(["Đà Nẵng", "Đà Nẵng".normalize("NFD")])).toEqual([
      "Hanoi",
      "Đà Nẵng",
      "Hanoi",
    ]);
  });

  it("ignores empty day labels", () => {
    expect(showRoute([" ", "Busan", "", "Busan"])).toEqual([
      "Hanoi",
      "Busan",
      "Hanoi",
    ]);
  });

  it("translates the missing endpoint in English", () => {
    expect(showRoute(["Busan"], null)).toEqual([
      "Hanoi",
      "Busan",
      "Final destination not selected",
    ]);
  });

  it("translates the missing endpoint in Vietnamese even when its label is blank", () => {
    expect(showRoute(["Busan"], " ", "vi")).toEqual([
      "Hanoi",
      "Busan",
      "Chưa chọn điểm cuối",
    ]);
  });
});

describe("booking review messages", () => {
  it.each(["en", "vi"])(
    "shows the result, budget and overage as a warning in %s",
    (locale) => {
      const planning = createPlanningCriteria();
      planning.budget = { currency: "VND", total: 20000000 };
      const plan = {
        planning,
        days: [{ city: "Hanoi" }],
        num_days: 1,
        total_cost: 25000000,
        currency: "VND",
        issues: [
          {
            code: "OVER_BUDGET",
            severity: "warning",
            params: { amount: 5000000, currency: "VND" },
          },
        ],
      } as Itinerary;
      render(
        <LanguageProvider initialLocale={locale}>
          <JourneySummary plan={plan} />
        </LanguageProvider>,
      );
      const text = screen.getByRole("region").textContent!;
      expect(text).toContain((25000000).toLocaleString(locale));
      expect(text).toContain((20000000).toLocaleString(locale));
      expect(text).toContain((5000000).toLocaleString(locale));
      expect(text).toContain(
        locale === "vi"
          ? "Chi phí dự kiến vượt ngân sách"
          : "Estimated cost exceeds the budget",
      );
      expect(text).not.toContain(
        locale === "vi" ? "Cần sửa:" : "Needs fixing:",
      );
    },
  );

  it("omits internal diagnostics while keeping actionable conflicts", () => {
    const plan = {
      days: [],
      issues: [
        {
          code: "MEAL_MISSING",
          message: "Day 1: missing breakfast.",
          severity: "warning",
        },
        {
          code: "STAY_NOT_SELECTED",
          message: "Accommodation will be suggested.",
          severity: "warning",
        },
        {
          code: "SCHEDULE_DETAILS_MISSING",
          message: "Missing transfer time.",
          severity: "warning",
        },
        {
          code: "SCHEDULE_CONFLICT",
          message: "Dinner overlaps your departure.",
          severity: "warning",
        },
      ],
    } as Itinerary;
    render(
      <LanguageProvider initialLocale="en">
        <JourneySummary plan={plan} />
      </LanguageProvider>,
    );
    expect(screen.queryByText("Day 1: missing breakfast.")).toBeNull();
    expect(screen.queryByText("Accommodation will be suggested.")).toBeNull();
    expect(screen.getByText("Dinner overlaps your departure.")).toBeTruthy();
  });
});
