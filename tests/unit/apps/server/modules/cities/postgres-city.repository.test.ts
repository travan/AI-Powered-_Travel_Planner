import { describe, expect, it, vi } from "vitest";
import type { SqlClient } from "../../../../../../apps/server/src/database/database.tokens";
import { PostgresCityRepository } from "../../../../../../apps/server/src/modules/cities/infrastructure/postgres-city.repository";

function createRepository() {
  const sql = { query: vi.fn() } as unknown as SqlClient;
  return { repository: new PostgresCityRepository(sql), query: sql.query as ReturnType<typeof vi.fn> };
}

const taipeiRow = {
  slug: "taipei",
  name: { en: "Taipei", vi: "Taipei" },
  country: "",
  timezone: "",
  currency: "",
  lat: null,
  lon: null,
  popular: false,
};

describe("PostgresCityRepository", () => {
  it("loads known places and activities for itinerary generation", async () => {
    const { repository, query } = createRepository();
    query
      .mockResolvedValueOnce({ rows: [taipeiRow] })
      .mockResolvedValueOnce({
        rows: [{
          name: "Taipei 101",
          type: "attraction",
          category: "landmark",
          address: "Xinyi District",
          tags: ["viewpoint"],
          price_level: "2",
          rating: 4.5,
          opening_hours: {},
          source: "internal_seed",
        }],
      })
      .mockResolvedValueOnce({
        rows: [{
          name: "Raohe Night Market",
          type: "restaurant",
          category: "food",
          address: "Songshan District",
          tags: [],
          price_level: "2",
          rating: null,
          opening_hours: {},
          source: "seed",
        }],
      })
      .mockResolvedValueOnce({
        rows: [{
          title: "Elephant Mountain hike",
          category: "outdoors",
          tags: ["hiking", "viewpoint"],
          estimated_cost: 0,
          currency: "TWD",
          duration_minutes: 90,
          source: "internal_seed",
        }],
      })

    await expect(repository.findForPlanning("taipei")).resolves.toMatchObject({
      slug: "taipei",
      places: [
        { name: "Taipei 101", type: "attraction" },
        { name: "Raohe Night Market", type: "restaurant" },
      ],
      activities: [{ title: "Elephant Mountain hike", duration_minutes: 90 }],
    });
    expect(query).toHaveBeenCalledTimes(4);
    expect(query.mock.calls[1]?.[0]).toContain("from places");
    expect(query.mock.calls[2]?.[0]).toContain("from place_catalog");
    expect(query.mock.calls[3]?.[0]).toContain("from activity_catalog");
  });

  it("stores a manually entered city without inventing coordinates", async () => {
    const { repository, query } = createRepository();
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [taipeiRow] });

    await expect(repository.remember("Taipei")).resolves.toMatchObject({
      slug: "taipei",
      name: { en: "Taipei", vi: "Taipei" },
      lat: null,
      lon: null,
    });
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("on conflict (slug) do nothing"),
      ["taipei", "Taipei"],
    );
  });

  it("reuses an existing city by its display name instead of duplicating it", async () => {
    const { repository, query } = createRepository();
    query.mockResolvedValueOnce({ rows: [{ ...taipeiRow, slug: "taipei-city" }] });

    await expect(repository.remember("Taipei")).resolves.toMatchObject({
      slug: "taipei-city",
    });
    expect(query).toHaveBeenCalledTimes(1);
  });
});
