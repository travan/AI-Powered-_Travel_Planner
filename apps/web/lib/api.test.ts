import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  generateItinerary,
  getItinerary,
  getPopularCities,
  getPromptHistory,
  saveTrip,
  searchCities,
  shareItinerary,
} from "./api";

describe("web api client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("sends generate request with auth header", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch" as never).mockResolvedValue({
      ok: true,
      json: async () => ({ job_id: "job-1", status: "queued" }),
    } as Response);

    const result = await generateItinerary(
      {
        city: "Tokyo",
        startDate: "2026-06-01",
        endDate: "2026-06-05",
        adults: 2,
      } as never,
      "token-123"
    );

    expect(result).toEqual({ job_id: "job-1", status: "queued" });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/itinerary/generate",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          Authorization: "Bearer token-123",
        }),
      })
    );
  });

  it("throws when generate endpoint returns non-ok", async () => {
    vi.spyOn(globalThis, "fetch" as never).mockResolvedValue({ ok: false, status: 500 } as Response);

    await expect(
      generateItinerary(
        {
          city: "Tokyo",
          startDate: "2026-06-01",
          endDate: "2026-06-05",
          adults: 2,
        } as never
      )
    ).rejects.toThrow("Generate failed: 500");
  });

  it("fetches itinerary details", async () => {
    vi.spyOn(globalThis, "fetch" as never).mockResolvedValue({
      ok: true,
      json: async () => ({ itinerary_id: "it-1" }),
    } as Response);

    await expect(getItinerary("it-1")).resolves.toEqual({ itinerary_id: "it-1" });
  });

  it("returns empty arrays when cities endpoints fail", async () => {
    vi.spyOn(globalThis, "fetch" as never).mockResolvedValue({ ok: false } as Response);

    await expect(searchCities("to")).resolves.toEqual([]);
    await expect(getPopularCities()).resolves.toEqual([]);
  });

  it("returns prompt history and handles non-ok as empty", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch" as never)
      .mockResolvedValueOnce({ ok: true, json: async () => [{ city: "Tokyo" }] } as Response)
      .mockResolvedValueOnce({ ok: false } as Response);

    await expect(getPromptHistory("token-1", 2)).resolves.toEqual([{ city: "Tokyo" }]);
    await expect(getPromptHistory("token-1", 2)).resolves.toEqual([]);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/users/me/prompt-history?limit=2",
      expect.objectContaining({ headers: { Authorization: "Bearer token-1" } })
    );
  });

  it("throws on save/share non-ok responses and returns share payload on success", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch" as never)
      .mockResolvedValueOnce({ ok: false, status: 401 } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ share_token: "abc", share_url: "https://example.test/s/abc" }),
      } as Response)
      .mockResolvedValueOnce({ ok: false, status: 403 } as Response);

    await expect(saveTrip("it-2", "token-2")).rejects.toThrow("Save failed: 401");
    await expect(shareItinerary("it-2", "token-2")).resolves.toEqual({
      share_token: "abc",
      share_url: "https://example.test/s/abc",
    });
    await expect(shareItinerary("it-2", "token-2")).rejects.toThrow("Share failed: 403");

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
