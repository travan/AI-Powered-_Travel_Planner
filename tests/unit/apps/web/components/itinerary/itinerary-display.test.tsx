import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ActivityCard } from "../../../../../../apps/web/components/itinerary/ActivityCard";
import { TransportSection } from "../../../../../../apps/web/components/itinerary/TransportSection";
import { OverviewCard } from "../../../../../../apps/web/components/itinerary/OverviewCard";
import type { Activity, GoldenMoment, Itinerary, TransportSegment } from "@travel/types";

describe("itinerary display components", () => {
  it("shows measured AI tokens on a reopened itinerary", () => {
    const itinerary = {
      title: "Hanoi trip",
      overview: "A city walk.",
      num_days: 1,
      num_travelers: 1,
      currency: "USD",
      total_cost: 100,
      days: [],
      ai_usage: [{
        operation: "detail",
        provider: "ollama",
        model: "qwen3.5:9b",
        input_tokens: 1200,
        output_tokens: 800,
        total_tokens: 2000,
        duration_ms: 5000,
      }],
    } as Itinerary;
    const markup = renderToStaticMarkup(createElement(OverviewCard, { itinerary }));
    expect(markup).toContain("AI tokens used when this itinerary was created");
    expect(markup).toContain("1,200 input + 800 output = 2,000 tokens");
  });

  it("renders an activity when optional model fields are incomplete", () => {
    const activity = {
      name: "Museum visit",
      description: "Explore the collection.",
      golden_moment: {} as GoldenMoment,
    } as Activity;

    const markup = renderToStaticMarkup(
      createElement(ActivityCard, { activity, index: 0 }),
    );

    expect(markup).toContain("Museum visit");
    expect(markup).toContain("special moment");
  });

  it("renders transport when optional route fields are incomplete", () => {
    const segments = [
      {
        from: "Paris",
        to: "Lyon",
        options: undefined,
      },
    ] as unknown as TransportSegment[];

    const markup = renderToStaticMarkup(
      createElement(TransportSection, { segments }),
    );

    expect(markup).toContain("Paris → Lyon");
    expect(markup).toContain("Transport to be confirmed");
  });
});


describe("transport data quality", () => {
  it("hides the entire section when AI returns empty or malformed routes", () => {
    const segments = [null, {}, { recommended_mode: "taxi" }, { from: " ", to: "Hanoi" }] as unknown as TransportSegment[];
    expect(renderToStaticMarkup(createElement(TransportSection, { segments }))).toBe("");
  });
  it("keeps useful routes and never renders empty or unsafe booking links", () => {
    const segments = [{ from: "Hoan Kiem Lake", to: "Temple of Literature", recommended_mode: "taxi", options: [null, { provider: "Taxi", type: "taxi", booking_url: "" }, { provider: "Unsafe", type: "taxi", booking_url: "javascript:alert(1)" }] }, {}] as unknown as TransportSegment[];
    const markup = renderToStaticMarkup(createElement(TransportSection, { segments }));
    expect(markup).toContain("Hoan Kiem Lake → Temple of Literature");
    expect(markup).not.toContain("Book now");
    expect(markup).not.toContain("Unknown mode");
    expect(markup).not.toContain("javascript:");
  });
});
