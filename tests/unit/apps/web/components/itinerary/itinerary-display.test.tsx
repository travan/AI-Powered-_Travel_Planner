import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ActivityCard } from "../../../../../../apps/web/components/itinerary/ActivityCard";
import { TransportSection } from "../../../../../../apps/web/components/itinerary/TransportSection";
import type { Activity, GoldenMoment, TransportSegment } from "@travel/types";

describe("itinerary display components", () => {
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
    expect(markup).toContain("Unknown mode");
  });
});
