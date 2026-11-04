import { afterEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
import { GoogleAuthController } from "../../../../../../apps/server/src/modules/auth/interfaces/http/google-auth.controller";
import {
  GoogleAuthService,
  googleConfig,
  internalPath,
  verifyGoogleToken,
  digest,
} from "../../../../../../apps/server/src/modules/auth/application/google-auth.service";
const require = createRequire(
  new URL("../../../../../../apps/server/package.json", import.meta.url),
);
const { generateKeyPair, SignJWT, createLocalJWKSet, exportJWK } = await import(
  require.resolve("jose")
);
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
function enable() {
  vi.stubEnv("GOOGLE_AUTH_ENABLED", "true");
  vi.stubEnv("GOOGLE_CLIENT_ID", "test-client");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "private-secret");
  vi.stubEnv(
    "GOOGLE_REDIRECT_URI",
    "http://localhost:3000/api/auth/google/callback",
  );
  vi.stubEnv("NODE_ENV", "test");
}
function setup() {
  const query = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
  const db = { query, release: vi.fn() };
  const pool = { query, connect: vi.fn().mockResolvedValue(db) };
  const users = {
    getSessionUser: vi.fn(),
    verifyLocalCredentials: vi.fn(),
    getById: vi.fn(),
  };
  return {
    service: new GoogleAuthService(pool as never, users as never),
    pool,
    query,
    users,
    db,
  };
}
const profile = {
  subject: "subject-1",
  email: "user@example.com",
  fullName: "User",
};
const txn = {
  nonce: "nonce",
  verifier: "verifier",
  intent: "signin" as const,
  user_id: null,
  session_hash: null,
  next_path: "/plan",
};
describe("Google OAuth security", () => {
  it.each([
    { hasPassword: true, googleLinked: false },
    { hasPassword: false, googleLinked: true },
    { hasPassword: true, googleLinked: true },
  ])(
    "reads account methods from DB for the active session: %j",
    async (methods) => {
      enable();
      const { service, users, query } = setup();
      users.getSessionUser.mockResolvedValue({
        id: "current-user",
        provider: "local",
      });
      query.mockResolvedValue({ rows: [methods] });
      expect(await service.accountMethods("active-session")).toEqual({
        ...methods,
        googleEnabled: true,
      });
      expect(query.mock.calls[0][1]).toEqual(["current-user"]);
      expect(query.mock.calls[0][0]).toContain("auth_identities");
    },
  );
  it("does not expose account methods for a revoked session", async () => {
    const { service, users, query } = setup();
    users.getSessionUser.mockResolvedValue(null);
    await expect(service.accountMethods("revoked")).rejects.toMatchObject({
      code: "google_reauth_required",
    });
    expect(query).not.toHaveBeenCalled();
  });
  it("requires a verified cookie before looking up sign-in methods", async () => {
    const google = { accountMethods: vi.fn() };
    const controller = new GoogleAuthController(
      google as never,
      {} as never,
      { verify: () => null } as never,
    );
    await expect(
      controller.status(
        { headers: { cookie: "" } } as never,
        { setHeader: vi.fn() } as never,
      ),
    ).rejects.toBeDefined();
    expect(google.accountMethods).not.toHaveBeenCalled();
  });
  it.each([
    "//evil.test",
    "/\\evil.test",
    "https://evil.test",
    "/\n/evil.test",
    "javascript:alert(1)",
    " /plan",
  ])("rejects unsafe redirect %s", (value) =>
    expect(internalPath(value)).toBe("/plan"),
  );
  it("keeps internal paths and rejects malformed callback config", () => {
    expect(internalPath("/trips?tab=mine")).toBe("/trips?tab=mine");
    enable();
    expect(googleConfig()).not.toBeNull();
    vi.stubEnv("NODE_ENV", "production");
    expect(googleConfig()).toBeNull();
    vi.stubEnv(
      "GOOGLE_REDIRECT_URI",
      "https://app.example/api/auth/google/callback?next=bad",
    );
    expect(googleConfig()).toBeNull();
  });
  it("is unavailable unless explicitly enabled with all credentials", async () => {
    const { service, query } = setup();
    vi.stubEnv("GOOGLE_AUTH_ENABLED", "false");
    await expect(service.start({ intent: "signin" })).rejects.toMatchObject({
      code: "google_unavailable",
    });
    expect(query).not.toHaveBeenCalled();
  });
  it("creates PKCE, scoped state and browser-bound one-use transactions", async () => {
    enable();
    const { service, query } = setup();
    const result = await service.start({
      intent: "signin",
      next: "//evil.test",
    });
    const url = new URL(result.url);
    expect(url.searchParams.get("scope")).toBe("openid email profile");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    const params = query.mock.calls[1][1];
    expect(params[0]).toBe(digest(url.searchParams.get("state")!));
    expect(params[1]).toBe(digest(result.browser));
    expect(params[7]).toBe("/plan");
    expect(params[8]).toBe(10);
    expect(result.url).not.toContain("private-secret");
    expect(result.url).not.toContain(params[3]);
  });
  it("requires password and active local session for linking", async () => {
    enable();
    const { service, users, query } = setup();
    users.getSessionUser.mockResolvedValue({ id: "old", email: profile.email });
    users.verifyLocalCredentials.mockResolvedValue(null);
    await expect(
      service.start({ intent: "link", password: "bad" }, "access"),
    ).rejects.toMatchObject({ code: "google_reauth_required" });
    expect(query).not.toHaveBeenCalled();
  });
  it("rejects token endpoint redirects without following or forwarding credentials", async () => {
    enable();
    const { service, query } = setup();
    query.mockResolvedValueOnce({ rows: [txn] });
    const fetcher = vi.fn().mockImplementation(async (_url, init) => {
      // Workers throws on redirect:error before sending any request.
      if (init.redirect === "error")
        throw new TypeError("Unsupported redirect mode");
      return new Response(null, {
        status: 302,
        headers: { Location: "https://evil.test" },
      });
    });
    vi.stubGlobal("fetch", fetcher);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(
      service.finish({ state: "state", browser: "browser", code: "code" }),
    ).rejects.toMatchObject({ code: "google_callback_error" });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][1].redirect).toBe("manual");
  });
  it("rejects missing state and atomically rejects replay before contacting Google", async () => {
    enable();
    const { service, query } = setup();
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    await expect(service.finish({ code: "code" })).rejects.toMatchObject({
      code: "google_invalid_state",
    });
    await expect(
      service.finish({ state: "state", browser: "browser", code: "code" }),
    ).rejects.toMatchObject({ code: "google_invalid_state" });
    expect(query.mock.calls[0][0]).toContain("delete from oauth_transactions");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("consumes denied consent and changed-browser-session link attempts", async () => {
    enable();
    const { service, query } = setup();
    query.mockResolvedValueOnce({ rows: [txn] });
    await expect(
      service.finish({
        state: "state",
        browser: "browser",
        error: "access_denied",
      }),
    ).rejects.toMatchObject({ code: "google_cancelled" });
    query.mockResolvedValueOnce({
      rows: [{ ...txn, intent: "link", session_hash: digest("old") }],
    });
    await expect(
      service.finish({
        state: "state",
        browser: "browser",
        code: "code",
        sessionToken: "new",
      }),
    ).rejects.toMatchObject({ code: "google_reauth_required" });
  });
  it("does not link an existing password account by email", async () => {
    const { service, query, users, db } = setup();
    await expect(service.resolveIdentity(profile, txn)).rejects.toMatchObject({
      code: "google_link_required",
    });
    expect(query.mock.calls.some(([sql]) => sql === "rollback")).toBe(true);
    expect(users.getById).not.toHaveBeenCalled();
    expect(db.release).toHaveBeenCalled();
  });
  it("existing identity retains its original user ID", async () => {
    const { service, query, users } = setup();
    query.mockImplementation(async (sql: string) => ({
      rows: sql.startsWith("select user_id") ? [{ user_id: "old-user" }] : [],
      rowCount: 0,
    }));
    users.getById.mockResolvedValue({ id: "old-user" });
    expect(await service.resolveIdentity(profile, txn)).toEqual({
      id: "old-user",
    });
    expect(
      query.mock.calls.some(([sql]) => sql.startsWith("insert into users")),
    ).toBe(false);
  });
  it("rejects link to a different email, revoked session, or identity owned by another account", async () => {
    for (const mode of ["email", "revoked", "owner"]) {
      const { service, query } = setup();
      query.mockImplementation(async (sql: string) => {
        if (sql.startsWith("select user_id"))
          return {
            rows: mode === "owner" ? [{ user_id: "someone-else" }] : [],
            rowCount: 0,
          };
        if (sql.startsWith("select email"))
          return {
            rows: [
              { email: mode === "email" ? "other@example.com" : profile.email },
            ],
            rowCount: 1,
          };
        return { rows: [], rowCount: mode === "revoked" ? 0 : 1 };
      });
      await expect(
        service.resolveIdentity(profile, {
          ...txn,
          intent: "link",
          user_id: "old-user",
          session_hash: "hash",
        }),
      ).rejects.toMatchObject({
        code:
          mode === "owner" ? "google_identity_in_use" : "google_link_mismatch",
      });
    }
  });
  it("verifies signature, issuer, audience, expiry, nonce and email verification", async () => {
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    const keys = createLocalJWKSet({
      keys: [{ ...(await exportJWK(publicKey)), kid: "test" }],
    });
    const sign = (
      claims = {},
      issuer = "https://accounts.google.com",
      audience = "test-client",
      expiry: string | number = "5m",
    ) =>
      new SignJWT({
        sub: "sub",
        nonce: "nonce",
        email: "user@example.com",
        email_verified: true,
        ...claims,
      })
        .setProtectedHeader({ alg: "RS256", kid: "test" })
        .setIssuer(issuer)
        .setAudience(audience)
        .setIssuedAt()
        .setExpirationTime(expiry)
        .sign(privateKey);
    expect(
      await verifyGoogleToken(await sign(), "test-client", "nonce", keys),
    ).toMatchObject({ subject: "sub" });
    for (const token of [
      await sign({ nonce: "wrong" }),
      await sign({ email_verified: false }),
      await sign({}, "evil"),
      await sign({}, undefined, "other"),
      await sign({}, undefined, undefined, 1),
      (await sign()).slice(0, -10) + "AAAAAAAAAA",
    ]) {
      await expect(
        verifyGoogleToken(token, "test-client", "nonce", keys),
      ).rejects.toBeDefined();
    }
  });
  it("checks origin on start and issues callback cookies without requiring a custom header", async () => {
    enable();
    const google = {
      start: vi.fn().mockResolvedValue({
        url: "https://accounts.google.com",
        browser: "browser",
        maxAge: 100,
      }),
      finish: vi.fn().mockResolvedValue({ user: { id: "old" }, next: "/plan" }),
    };
    const session = {
      user: { id: "old" },
      access_token: "access",
      refresh_token: "refresh",
    };
    const auth = { signSession: vi.fn().mockResolvedValue(session) };
    const controller = new GoogleAuthController(
      google as never,
      auth as never,
      {} as never,
    );
    const res = {
      setHeader: vi.fn(),
      cookie: vi.fn(),
      clearCookie: vi.fn(),
      redirect: vi.fn(),
      status: vi.fn(),
    };
    await expect(
      controller.start(
        { intent: "signin" },
        {
          headers: { "x-auth-client": "web", origin: "https://evil.test" },
        } as never,
        res as never,
      ),
    ).rejects.toBeDefined();
    expect(google.start).not.toHaveBeenCalled();
    await controller.callback(
      "state",
      "code",
      undefined,
      { headers: { cookie: "horizon_google_oauth=browser" } } as never,
      res as never,
    );
    expect(res.cookie).toHaveBeenCalledWith(
      "horizon_local_auth",
      "access",
      expect.objectContaining({ httpOnly: true, sameSite: "lax" }),
    );
    expect(res.redirect).toHaveBeenCalledWith(
      303,
      "http://localhost:3000/plan",
    );
  });
});
