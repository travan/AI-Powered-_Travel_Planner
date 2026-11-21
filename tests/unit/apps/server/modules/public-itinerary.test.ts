import { expect, it } from "vitest";
import { publicItinerary } from "../../../../../apps/server/src/modules/itinerary/application/public-itinerary";

it("keeps display data but strips private roots and nested booking credentials without mutating storage", () => {
  const source = {
    title: "Moscow",
    overview: "City break",
    planning: { private_request: "private" },
    ai_usage: [{ model: "internal" }],
    user_id: "owner",
    unknown_future_private_field: "private",
    days: [
      {
        day: 1,
        booking_reference: "secret",
        activities: [
          { name: "Museum", booking_code: "secret", email: "private" },
        ],
      },
    ],
    hotels: [{ name: "Hotel", booking_reference: "secret" }],
    restaurants: [],
    suggestions: [],
  };
  const display = publicItinerary(source);
  expect(display).toEqual({
    title: "Moscow",
    overview: "City break",
    days: [{ day: 1, activities: [{ name: "Museum" }] }],
    hotels: [{ name: "Hotel" }],
    restaurants: [],
    suggestions: [],
  });
  expect(JSON.stringify(source)).toContain("secret");
});
