import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Itinerary } from "@travel/types";
import { StayDiningRecommendations } from "../../../../../../apps/web/components/itinerary/StayDiningRecommendations";

describe("stay and local dining recommendations", () => {
  it("shows booking guidance, local cafe day slots and only safe provider links", () => {
    const itinerary = {
      hotels: [
        {
          name: "Stay option",
          price_per_night: "Estimate 800000 VND",
          note: "2 rooms, 3 nights. Confirm cancellation with the property.",
          booking_url: "https://example.com/rooms",
          maps_link: "javascript:alert(1)",
        },
      ],
      restaurants: [
        {
          name: "Local cafe",
          cuisine: "Café",
          note: "Day 2, afternoon: local coffee, near the museum.",
          maps_link: "https://example.com/map",
        },
      ],
    } as Itinerary;
    const markup = renderToStaticMarkup(
      createElement(StayDiningRecommendations, { itinerary }),
    );
    expect(markup).toContain("2 rooms, 3 nights");
    expect(markup).toContain("Day 2, afternoon");
    expect(markup).toContain("https://example.com/rooms");
    expect(markup).not.toContain("javascript:");
    expect(markup).toContain("no room or table has been reserved");
  });
  it("does not add empty sections to older itineraries", () => {
    expect(
      renderToStaticMarkup(
        createElement(StayDiningRecommendations, {
          itinerary: {} as Itinerary,
        }),
      ),
    ).toBe("");
  });
});
