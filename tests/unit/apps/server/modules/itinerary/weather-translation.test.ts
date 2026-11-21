import { describe, expect, it } from "vitest";
import { JourneyService } from "../../../../../../apps/server/src/modules/itinerary/journey/journey.service";
import type { Itinerary } from "@travel/types";
describe("weather refresh and translation revision", () => {
  it("keeps the translation source stable when only weather updates", () => {
    const version = (
      JourneyService.prototype as unknown as {
        sourceVersion(plan: Itinerary, kind: string, id: string): string;
      }
    ).sourceVersion;
    const first = {
      title: "Trip",
      version: 1,
      weather: [{ updated_at: "2026-11-01" }],
    } as unknown as Itinerary;
    const refreshed = {
      ...first,
      weather: [{ updated_at: "2026-11-02" }],
    } as unknown as Itinerary;
    expect(version(first, "trip", "id")).toBe(version(refreshed, "trip", "id"));
    expect(version(first, "trip", "id")).not.toBe(
      version({ ...first, version: 2 }, "trip", "id"),
    );
  });
});

it("does not invalidate translations when only the exchange-rate cache expiry changes", () => {
  const version = (
    JourneyService.prototype as unknown as {
      sourceVersion(plan: Itinerary, kind: string, id: string): string;
    }
  ).sourceVersion;
  const first = {
    title: "Trip",
    days: [
      {
        activities: [
          {
            price: {
              amount: 100,
              conversion: { rate: 20000, expires_at: "2026-11-21" },
            },
          },
        ],
      },
    ],
  } as unknown as Itinerary;
  const refreshed = structuredClone(first);
  refreshed.days[0]!.activities[0]!.price!.conversion!.expires_at =
    "2026-11-22";
  expect(version(first, "trip", "id")).toBe(version(refreshed, "trip", "id"));
  refreshed.days[0]!.activities[0]!.price!.amount = 110;
  expect(version(first, "trip", "id")).not.toBe(
    version(refreshed, "trip", "id"),
  );
});
