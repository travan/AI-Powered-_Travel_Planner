import { describe, expect, it, vi } from "vitest";
import type { SqlClient } from "../../../../../../apps/server/src/database/database.tokens";
import { CityCatalogWorker } from "../../../../../../apps/server/src/modules/cities/application/city-catalog.worker";

function createWorker() {
  const query = vi.fn();
  const sql = { query } as unknown as SqlClient;
  return { worker: new CityCatalogWorker(sql), query };
}

describe("CityCatalogWorker", () => {
  it("stores itinerary-generated catalog entries with unverified provenance", async () => {
    const { worker, query } = createWorker();
    query
      .mockResolvedValueOnce({
        rows: [{
          id: "job-1",
          attempts: 1,
          payload: { cities: [{ slug: "tokyo", name: "Tokyo" }] },
          result: {
            days: [{
              city: "Tokyo",
              activities: [{
                name: "Senso-ji Temple",
                category: "attraction",
                cost: 0,
                currency: "JPY",
                duration: "1.5 hours",
              }],
            }],
            restaurants: [{
              name: "Tsukiji Outer Market",
              address: "Chuo City",
            }],
            hotels: [{ name: "Tokyo Stay", address: "Shinjuku" }],
          },
        }],
      })
      .mockResolvedValue({ rows: [] });

    await worker.processNextJob();

    expect(query).toHaveBeenCalledTimes(5);
    expect(query.mock.calls[1]?.[0]).toContain("'ai_generated'");
    expect(query.mock.calls[1]?.[1]).toEqual([
      "tokyo",
      "Senso-ji Temple",
      "attraction",
      0,
      "JPY",
      90,
    ]);
    expect(query.mock.calls[2]?.[1]).toEqual([
      "Tsukiji Outer Market",
      "restaurant",
      "tokyo",
      "Chuo City",
    ]);
    expect(query.mock.calls[3]?.[1]).toEqual([
      "Tokyo Stay",
      "hotel",
      "tokyo",
      "Shinjuku",
    ]);
    expect(query.mock.calls[4]?.[0]).toContain("set status = 'completed'");
  });

  it("retries catalog ingestion failures and records the error", async () => {
    const { worker, query } = createWorker();
    query
      .mockResolvedValueOnce({
        rows: [{
          id: "job-2",
          attempts: 1,
          payload: { cities: [] },
          result: {},
        }],
      })
      .mockResolvedValueOnce({ rows: [] });

    await worker.processNextJob();

    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1]?.[0]).toContain("set status = case");
    expect(query.mock.calls[1]?.[1]).toEqual([
      "job-2",
      5,
      "The catalog job is missing its city references or itinerary result.",
    ]);
  });
});
