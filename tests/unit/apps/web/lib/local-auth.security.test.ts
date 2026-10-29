// @vitest-environment jsdom
import { JSDOM } from "jsdom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const session = {
  access_token: "test-access-token",
  refresh_token: "",
  token_type: "bearer",
  expires_in: 900,
  expires_at: Math.floor(Date.now() / 1000) + 900,
  user: { id: "user-1", email: "user@test.invalid", user_metadata: {} },
};
const fetchMock = vi.fn();
let auth: typeof import("../../../../../apps/web/lib/supabase/local-auth");
const response = (status: number, payload: unknown = {}) => ({
  ok: status < 400,
  status,
  json: async () => payload,
});
beforeEach(async () => {
  vi.resetModules();
  vi.stubGlobal(
    "localStorage",
    new JSDOM("", { url: "https://travel.test" }).window.localStorage,
  );
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  auth = await import("../../../../../apps/web/lib/supabase/local-auth");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("browser memory-only access and protected refresh sessions", () => {
  it.each([undefined, "", "%ZZ", "{invalid-json", "%7B"])(
    "rejects malformed server cookie hints: %s",
    (value) => {
      expect(auth.getLocalSessionFromCookieValue(value)).toBeNull();
    },
  );
  it("keeps login credentials out of browser storage and never writes a cookie from JS", async () => {
    localStorage.setItem("horizon.local.auth.session", "legacy-token");
    const setter = vi.spyOn(document, "cookie", "set");
    fetchMock.mockResolvedValueOnce(response(200, { session }));
    const client = auth.createLocalBrowserClient();
    const result = await client.auth.signInWithPassword({
      email: session.user.email,
      password: "Private-password!",
    });
    expect(result.error).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/session",
      expect.objectContaining({
        credentials: "same-origin",
        method: "POST",
        headers: { "content-type": "application/json", "x-auth-client": "web" },
      }),
    );
    expect(localStorage.getItem("horizon.local.auth.session")).toBeNull();
    expect(JSON.stringify(Object.entries(localStorage))).not.toContain(
      session.access_token,
    );
    expect(setter).not.toHaveBeenCalled();
    expect((await client.auth.getSession()).data.session).toEqual(session);
    setter.mockRestore();
  });
  it.each([401, 429, 500])(
    "does not establish a session on failed login HTTP %s",
    async (status) => {
      fetchMock.mockResolvedValueOnce(response(status));
      const result = await auth
        .createLocalBrowserClient()
        .auth.signInWithPassword({
          email: session.user.email,
          password: "wrong",
        });
      expect(result.error).toMatchObject({ status });
      expect(result.data.session).toBeNull();
      expect(localStorage.getItem("horizon.local.auth.session")).toBeNull();
    },
  );
  it("restores an existing server cookie without rotating the refresh token", async () => {
    fetchMock.mockResolvedValueOnce(response(200, { session }));
    expect(
      (await auth.createLocalBrowserClient().auth.getSession()).data.session,
    ).toEqual(session);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/auth/restore");
  });
  it("refreshes an expired access cookie and deduplicates concurrent session requests", async () => {
    fetchMock
      .mockResolvedValueOnce(response(401))
      .mockResolvedValueOnce(response(200, { session }));
    const client = auth.createLocalBrowserClient();
    const results = await Promise.all([
      client.auth.getSession(),
      client.auth.getSession(),
      client.auth.getSession(),
    ]);
    expect(
      results.every(
        (result) => result.data.session?.access_token === session.access_token,
      ),
    ).toBe(true);
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      "/api/auth/restore",
      "/api/auth/refresh",
    ]);
  });
  it("reports network failure without discarding or consuming refresh credentials", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    const result = await auth.createLocalBrowserClient().auth.getSession();
    expect(result.error?.message).toBe("offline");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("rejects revoked refresh credentials", async () => {
    fetchMock
      .mockResolvedValueOnce(response(401))
      .mockResolvedValueOnce(response(401));
    expect(
      (await auth.createLocalBrowserClient().auth.getSession()).data.session,
    ).toBeNull();
  });
  it("gets identity from the API rather than untrusted browser data", async () => {
    fetchMock
      .mockResolvedValueOnce(response(200, { session }))
      .mockResolvedValueOnce(response(200, { user: session.user }));
    expect(
      (await auth.createLocalBrowserClient().auth.getUser()).data.user,
    ).toEqual(session.user);
    expect(fetchMock.mock.calls[1][1].headers.authorization).toBe(
      `Bearer ${session.access_token}`,
    );
  });
  it.each([false, true])(
    "requests server logout and reports failures (offline: %s)",
    async (offline) => {
      fetchMock.mockResolvedValueOnce(response(200, { session }));
      const client = auth.createLocalBrowserClient();
      await client.auth.getSession();
      if (offline) fetchMock.mockRejectedValueOnce(new Error("offline"));
      else fetchMock.mockResolvedValueOnce(response(200));
      const result = await client.auth.signOut();
      expect(Boolean(result.error)).toBe(offline);
      expect(fetchMock.mock.calls[1][0]).toBe("/api/auth/logout");
      expect(fetchMock.mock.calls[1][1].headers["x-auth-client"]).toBe("web");
      expect(localStorage.getItem("horizon.local.auth.session")).toBeNull();
    },
  );
});
