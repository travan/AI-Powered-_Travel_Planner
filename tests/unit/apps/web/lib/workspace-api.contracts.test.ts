import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as api from "../../../../../apps/web/lib/workspace-api";
vi.mock("../../../../../apps/web/lib/session-fetch", () => ({
  fetchWithLocalSession: (...args: Parameters<typeof fetch>) => fetch(...args),
}));
let request: ReturnType<typeof vi.fn>;
beforeEach(() => {
  request = vi.fn(async () => Response.json({ id: "record" }));
  vi.stubGlobal("fetch", request);
  vi.stubGlobal("window", { dispatchEvent: vi.fn() });
});
afterEach(() => vi.unstubAllGlobals());
type Contract = [keyof typeof api, unknown[], string, string];
const contracts: Contract[] = [
  ["getTripWorkspace", ["trip", "token"], "GET", "/api/trips/trip/workspace"],
  ["listTripMembers", ["trip", "token"], "GET", "/api/trips/trip/members"],
  ["getTripMembership", ["trip", "token"], "GET", "/api/trips/trip/membership"],
  [
    "createTripInvite",
    ["trip", "token", { role: "viewer", email: "friend@example.invalid" }],
    "POST",
    "/api/trips/trip/invites",
  ],
  [
    "updateTripShareLink",
    ["trip", "token", { enabled: true, role: "viewer" }],
    "PATCH",
    "/api/trips/trip/share-link",
  ],
  [
    "updateTripMember",
    ["trip", "user", "token", { role: "editor" }],
    "PATCH",
    "/api/trips/trip/members/user",
  ],
  [
    "joinTripByInviteToken",
    ["token", "invite"],
    "POST",
    "/api/trips/join/invite",
  ],
  [
    "joinTripByShareToken",
    ["token", "share"],
    "POST",
    "/api/trips/join/share-link",
  ],
  [
    "listTripAuditLogs",
    ["trip", "token"],
    "GET",
    "/api/trips/trip/audit-logs?limit=10",
  ],
  [
    "listTripActivities",
    ["trip", "token"],
    "GET",
    "/api/trips/trip/activities",
  ],
  [
    "createTripActivity",
    ["trip", "token", { title: "Museum", category: "attraction" }],
    "POST",
    "/api/trips/trip/activities",
  ],
  [
    "updateTripActivity",
    ["trip", "activity", "token", { title: "Updated" }],
    "PATCH",
    "/api/trips/trip/activities/activity",
  ],
  [
    "updateActivityParticipant",
    ["trip", "activity", "user", "token", "joined"],
    "PATCH",
    "/api/trips/trip/activities/activity/participants/user",
  ],
  [
    "listTransportBookings",
    ["trip", "token"],
    "GET",
    "/api/trips/trip/transport-bookings",
  ],
  [
    "createTransportBooking",
    [
      "trip",
      "token",
      { mode: "train", origin_name: "A", destination_name: "B" },
    ],
    "POST",
    "/api/trips/trip/transport-bookings",
  ],
  [
    "updateTransportBooking",
    ["trip", "booking", "token", { booking_status: "confirmed" }],
    "PATCH",
    "/api/trips/trip/transport-bookings/booking",
  ],
  [
    "createBillUpload",
    ["trip", "token", { file_url: "https://example.invalid/receipt" }],
    "POST",
    "/api/trips/trip/bills",
  ],
  [
    "updateBillUpload",
    ["bill", "token", { status: "reviewed" }],
    "PATCH",
    "/api/bills/bill",
  ],
  ["listExpenses", ["trip", "token"], "GET", "/api/trips/trip/expenses"],
  [
    "createExpense",
    ["trip", "token", { title: "Lunch", amount: 10, split_strategy: "equal" }],
    "POST",
    "/api/trips/trip/expenses",
  ],
  [
    "updateExpense",
    ["trip", "expense", "token", { amount: 20 }],
    "PATCH",
    "/api/trips/trip/expenses/expense",
  ],
  [
    "updateExpenseSplitStatus",
    ["trip", "expense", "split", "token", "paid"],
    "PATCH",
    "/api/trips/trip/expenses/expense/splits/split",
  ],
  ["listReviewQueue", ["trip", "token"], "GET", "/api/trips/trip/review-queue"],
  [
    "reviewSubmission",
    [
      "trip",
      "token",
      { entity_type: "activity", entity_id: "activity", decision: "approved" },
    ],
    "PATCH",
    "/api/trips/trip/review-submissions",
  ],
  ["analyzeBillUpload", ["bill", "token"], "POST", "/api/bills/bill/analyze"],
  [
    "listDataQualitySignals",
    ["trip", "token"],
    "GET",
    "/api/trips/trip/data-quality-signals",
  ],
];
it.each(contracts)(
  "%s preserves the authenticated backend contract",
  async (name, args, method, url) => {
    const call = api[name] as (...values: unknown[]) => Promise<unknown>;
    expect(await call(...args)).toEqual({ id: "record" });
    const [actualUrl, options] = request.mock.calls[0]!;
    expect(actualUrl).toBe(url);
    expect(options.method).toBe(method);
    expect(options.headers.Authorization).toBe("Bearer token");
    expect(options.cache).toBe("no-store");
    if (method !== "GET") expect(window.dispatchEvent).toHaveBeenCalled();
    request.mockImplementation(async () =>
      Response.json({ message: "Not permitted" }, { status: 403 }),
    );
    await expect(call(...args)).rejects.toMatchObject({
      name: "WorkspaceApiError",
      status: 403,
      message: "Not permitted",
    });
  },
);
it("reports non-JSON errors without masking the HTTP status", async () => {
  request.mockImplementation(
    async () => new Response("gateway unavailable", { status: 502 }),
  );
  await expect(api.getTripWorkspace("trip", "token")).rejects.toMatchObject({
    status: 502,
    message: "Workspace request failed: 502",
  });
});
it.each([
  [
    "searchActivityCatalog",
    { citySlug: "hue", category: "food", q: "café & tea", limit: 5 },
    "citySlug=hue&category=food&q=caf%C3%A9+%26+tea&limit=5",
  ],
  [
    "listPlaceRecommendations",
    { citySlug: "hue", category: "food", limit: 5 },
    "citySlug=hue&category=food&limit=5",
  ],
  [
    "listTransportPriceRecommendations",
    { mode: "train", originCity: "hue", destinationCity: "da-nang", limit: 5 },
    "mode=train&originCity=hue&destinationCity=da-nang&limit=5",
  ],
] as const)(
  "%s safely encodes optional public filters and tolerates downtime",
  async (name, query, suffix) => {
    const call = api[name] as (query?: unknown) => Promise<unknown>;
    request.mockImplementation(async () => Response.json([{ id: "public" }]));
    expect(await call(query)).toEqual([{ id: "public" }]);
    expect(String(request.mock.calls[0]![0])).toContain(suffix);
    await call();
    expect(String(request.mock.lastCall![0])).not.toContain("?");
    request.mockImplementation(
      async () => new Response("down", { status: 503 }),
    );
    expect(await call()).toEqual([]);
  },
);
