import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApiRequestError,
  checkAccountExists,
  generateItinerary,
  getItinerary,
  getSavedTripItinerary,
  getMyTrips,
  getPopularCities,
  getPromptHistory,
  saveTrip,
  searchCities,
  shareItinerary,
} from "../../../../../apps/web/lib/api";

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
      "http://127.0.0.1:3001/api/itinerary/generate",
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

  it("exposes unauthorized generate responses for auth redirect handling", async () => {
    vi.spyOn(globalThis, "fetch" as never).mockResolvedValue({ ok: false, status: 401 } as Response);

    await expect(
      generateItinerary(
        {
          city: "Tokyo",
          startDate: "2026-06-01",
          endDate: "2026-06-05",
          adults: 2,
        } as never,
        "stale-token"
      )
    ).rejects.toEqual(
      expect.objectContaining<ApiRequestError>({
        name: "ApiRequestError",
        status: 401,
        message: "Generate failed: 401",
      })
    );
  });

  it("fetches itinerary details", async () => {
    vi.spyOn(globalThis, "fetch" as never).mockResolvedValue({
      ok: true,
      json: async () => ({ itinerary_id: "it-1" }),
    } as Response);

    await expect(getItinerary("it-1")).resolves.toEqual({ itinerary_id: "it-1" });
  });

  it("exposes itinerary response status for route-level error handling", async () => {
    vi.spyOn(globalThis, "fetch" as never).mockResolvedValue({
      ok: false,
      status: 404,
    } as Response);

    await expect(getItinerary("missing")).rejects.toEqual(
      expect.objectContaining<ApiRequestError>({
        name: "ApiRequestError",
        status: 404,
      })
    );
  });

  it("fetches the AI itinerary attached to a saved trip", async () => {
    const itinerary = { id: "it-1", title: "Tokyo Discovery", days: [] };
    const fetchMock = vi.spyOn(globalThis, "fetch" as never).mockResolvedValue({
      ok: true,
      json: async () => ({ itinerary }),
    } as Response);

    await expect(getSavedTripItinerary("trip-1", "token-1")).resolves.toEqual(itinerary);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:3001/api/itinerary/trips/trip-1",
      { headers: { Authorization: "Bearer token-1" } },
    );
  });

  it("treats a trip without a source itinerary as empty", async () => {
    vi.spyOn(globalThis, "fetch" as never).mockResolvedValue({ ok: false, status: 404 } as Response);

    await expect(getSavedTripItinerary("trip-1", "token-1")).resolves.toBeNull();
  });

  it("exposes unauthorized trips responses for auth redirect handling", async () => {
    vi.spyOn(globalThis, "fetch" as never).mockResolvedValue({ ok: false, status: 401 } as Response);

    await expect(getMyTrips("stale-token")).rejects.toEqual(
      expect.objectContaining<ApiRequestError>({
        name: "ApiRequestError",
        status: 401,
        message: "Trips fetch failed: 401",
      })
    );
  });

  it("returns empty arrays when cities endpoints fail", async () => {
    vi.spyOn(globalThis, "fetch" as never).mockResolvedValue({ ok: false } as Response);

    await expect(searchCities("to")).resolves.toEqual([]);
    await expect(getPopularCities()).resolves.toEqual([]);
  });

  it("treats account existence network failures as an unavailable hint", async () => {
    vi.spyOn(globalThis, "fetch" as never).mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(checkAccountExists("traveler@example.com")).resolves.toBeNull();
  });

  it("returns prompt history and handles non-ok as empty", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch" as never)
      .mockResolvedValueOnce({ ok: true, json: async () => [{ city: "Tokyo" }] } as Response)
      .mockResolvedValueOnce({ ok: false } as Response);

    await expect(getPromptHistory("token-1", 2)).resolves.toEqual([{ city: "Tokyo" }]);
    await expect(getPromptHistory("token-1", 2)).resolves.toEqual([]);

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:3001/api/users/me/prompt-history?limit=2",
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

  it("returns the workspace trip id after saving an itinerary", async () => {
    vi.spyOn(globalThis, "fetch" as never).mockResolvedValue({
      ok: true,
      json: async () => ({ saved: true, trip_id: "trip-1" }),
    } as Response);

    await expect(saveTrip("it-1", "token-1")).resolves.toEqual({
      saved: true,
      trip_id: "trip-1",
    });
  });
});
