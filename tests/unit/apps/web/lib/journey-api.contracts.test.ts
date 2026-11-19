import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as api from "../../../../../apps/web/lib/journey-api";
vi.mock("../../../../../apps/web/lib/session-fetch", () => ({
  fetchWithLocalSession: (...args: Parameters<typeof fetch>) => fetch(...args),
}));
let request: ReturnType<typeof vi.fn>;
beforeEach(() => {
  request = vi.fn(async () => Response.json({ id: "record" }));
  vi.stubGlobal("fetch", request);
  vi.stubGlobal("window", { dispatchEvent: vi.fn() });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it.each([
  ["validateJourney", [{}], "/api/planning/validate"],
  ["getPlanningRequests", ["token"], "/api/planning/requests"],
  [
    "retryJourneyJob",
    ["job", "token", "unique-key"],
    "/api/itinerary/jobs/job/retry",
  ],
  [
    "getPlanningStatuses",
    [["one", "two"], "token", new AbortController().signal],
    "/api/planning/statuses?ids=one,two",
  ],
  ["getJourneyPlan", ["trip", "token"], "/api/trips/trip/planning"],
  ["getAccommodations", ["trip", "token"], "/api/trips/trip/accommodations"],
  [
    "getPlanRevisions",
    ["trip", "token"],
    "/api/trips/trip/itinerary-revisions",
  ],
  ["resolveJourneyLocation", [{ query: "Moscow" }], "/api/locations/resolve"],
] as const)(
  "%s returns the backend contract without losing response fields",
  async (name, args, path) => {
    const call = api[name] as (...args: unknown[]) => Promise<unknown>;
    expect(await call(...args)).toEqual({ id: "record" });
    expect(request.mock.calls[0]![0]).toBe(path);
  },
);
it("coalesces concurrent polling and honors an already-aborted request", async () => {
  let finish!: (value: Response) => void;
  request.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const first = api.getJourneyJob("job", "token");
  const second = api.getJourneyJob("job", "token");
  expect(first).toBe(second);
  finish(Response.json({ id: "job" }));
  expect(await first).toEqual({ id: "job" });
  await api.getJourneyJob("job", "token");
  expect(request).toHaveBeenCalledTimes(2);
  const controller = new AbortController();
  controller.abort(new Error("stopped"));
  await expect(
    api.getJourneyJob("job", "token", controller.signal),
  ).rejects.toThrow("stopped");
});
it("propagates structured errors, retry intervals and validation outages", async () => {
  request.mockImplementation(async () =>
    Response.json(
      { code: "LIMIT", message: "Wait", params: { day: 1 } },
      { status: 429, headers: { "Retry-After": "5" } },
    ),
  );
  await expect(api.journeyRequest("trips/trip", "token")).rejects.toMatchObject(
    { status: 429, code: "LIMIT", retryAfterMs: 5000, params: { day: 1 } },
  );
  request.mockImplementation(
    async () => new Response("gateway", { status: 503 }),
  );
  await expect(api.validateJourney({} as never)).rejects.toMatchObject({
    code: "PLANNER_API_UNAVAILABLE",
  });
  request.mockRejectedValue(new TypeError("offline"));
  await expect(api.validateJourney({} as never)).rejects.toMatchObject({
    status: 0,
    code: "PLANNER_API_UNAVAILABLE",
  });
  await expect(api.journeyRequest("trips/trip")).rejects.toThrow("offline");
  request.mockRejectedValue(new DOMException("cancelled", "AbortError"));
  await expect(api.validateJourney({} as never)).rejects.toMatchObject({
    name: "AbortError",
  });
});
it("emits workspace refresh notifications only for relevant mutations", async () => {
  await api.journeyRequest("trips/trip/accommodations", "token", {
    name: "Stay",
  });
  await api.journeyRequest(
    "itinerary/plan/translations",
    "token",
    undefined,
    "POST",
  );
  api.notifyJobStatusChanged();
  expect(window.dispatchEvent).toHaveBeenCalledTimes(3);
});
