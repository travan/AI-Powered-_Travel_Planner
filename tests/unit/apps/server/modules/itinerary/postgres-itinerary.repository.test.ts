import { describe, expect, it, vi } from "vitest";
import { PostgresItineraryRepository } from "../../../../../../apps/server/src/modules/itinerary/infrastructure/postgres-itinerary.repository";

const request = {
  cities: ["tokyo"],
  num_days: 2,
  currency: "USD",
  trip_style: "mid_range",
  locale: "en",
  num_travelers: 1,
};

describe("itinerary persistence", () => {
  it("stores bounded diagnostics privately as a failed itinerary", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    await new PostgresItineraryRepository({ query }).recordFailure({
      userId: "user-1",
      request,
      provider: "ollama",
      code: "AI_UNAVAILABLE",
      message: "x".repeat(5000),
    });
    const [sql, values] = query.mock.calls[0]!;
    expect(sql).toContain("'failed'");
    expect(values.slice(0, 8)).toEqual([
      "user-1",
      ["tokyo"],
      null,
      null,
      2,
      null,
      "USD",
      "mid_range",
    ]);
    expect(values[8].error).toEqual({
      provider: "ollama",
      code: "AI_UNAVAILABLE",
      message: "x".repeat(4000),
    });
  });

  it("propagates database errors instead of pretending the itinerary was saved", async () => {
    const query = vi.fn().mockRejectedValue(new Error("database unavailable"));
    await expect(
      new PostgresItineraryRepository({ query }).createComplete({
        userId: "user-1",
        request,
        result: { num_days: 2 } as never,
        catalogCities: [],
      }),
    ).rejects.toThrow("database unavailable");
  });
});
