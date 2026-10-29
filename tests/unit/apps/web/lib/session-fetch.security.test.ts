// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const auth = vi.hoisted(() => ({ getSession: vi.fn(), refresh: vi.fn() }));
vi.mock("../../../../../apps/web/lib/supabase/local-auth", () => ({
  LOCAL_AUTH_ENABLED: true,
  createLocalBrowserClient: () => ({ auth: { getSession: auth.getSession } }),
  refreshLocalBrowserSession: auth.refresh,
}));
import { fetchWithLocalSession } from "../../../../../apps/web/lib/session-fetch";
const fetchMock = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  auth.getSession.mockResolvedValue({
    data: { session: { access_token: "current-token" } },
    error: null,
  });
  auth.refresh.mockResolvedValue({ access_token: "renewed-token" });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());
describe("API requests from long-open pages", () => {
  it("replaces the access token captured when the page originally loaded", async () => {
    fetchMock.mockResolvedValueOnce({ status: 200 });
    await fetchWithLocalSession("/api/planning/requests", {
      headers: { Authorization: "Bearer stale-token" },
    });
    expect(fetchMock.mock.calls[0][1].headers.get("Authorization")).toBe(
      "Bearer current-token",
    );
  });
  it("retries a rejected access token once using a validated server session", async () => {
    fetchMock
      .mockResolvedValueOnce({ status: 401 })
      .mockResolvedValueOnce({ status: 200 });
    expect(
      (
        await fetchWithLocalSession("/api/planning/requests", {
          headers: { Authorization: "Bearer stale-token" },
        })
      ).status,
    ).toBe(200);
    expect(auth.refresh).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[1][1].headers.get("Authorization")).toBe(
      "Bearer renewed-token",
    );
  });
  it("returns unauthorized after revocation without an infinite retry loop", async () => {
    fetchMock.mockResolvedValueOnce({ status: 401 });
    auth.refresh.mockResolvedValueOnce(null);
    expect(
      (
        await fetchWithLocalSession("/api/planning/requests", {
          headers: { Authorization: "Bearer stale-token" },
        })
      ).status,
    ).toBe(401);
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it("keeps public requests anonymous", async () => {
    fetchMock.mockResolvedValueOnce({ status: 200 });
    await fetchWithLocalSession("/api/cities/popular");
    expect(auth.getSession).not.toHaveBeenCalled();
    expect(auth.refresh).not.toHaveBeenCalled();
  });
});
