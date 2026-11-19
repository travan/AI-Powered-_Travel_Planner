import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  os: "ios",
  mock: false,
  configured: true,
  values: new Map<string, string>(),
  sdk: { auth: {} as Record<string, ReturnType<typeof vi.fn>> },
}));
vi.mock("react-native", () => ({
  Platform: {
    get OS() {
      return state.os;
    },
  },
}));
vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(async (key: string) => state.values.get(key) ?? null),
  setItemAsync: vi.fn(async (key: string, value: string) => {
    state.values.set(key, value);
  }),
  deleteItemAsync: vi.fn(async (key: string) => {
    state.values.delete(key);
  }),
}));
vi.mock("../../../../../apps/mobile/lib/supabase", () => ({
  get isMockAuthEnabled() {
    return state.mock;
  },
  get isSupabaseConfigured() {
    return state.configured;
  },
  requireSupabase: () => state.sdk,
}));
const session = () => ({
  access_token: "test-access",
  refresh_token: "test-refresh",
  expires_at: Date.now() / 1000 + 3600,
  user: {
    id: "user",
    email: "test@example.invalid",
    full_name: "Traveler",
    avatar_url: "avatar",
    provider: "local",
  },
});
const reply = (body: unknown, status = 200) => Response.json(body, { status });
let request: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.resetModules();
  state.values.clear();
  state.os = "ios";
  state.mock = false;
  state.configured = true;
  vi.stubEnv("EXPO_PUBLIC_AUTH_PROVIDER", "local");
  request = vi.fn();
  vi.stubGlobal("fetch", request);
  state.sdk.auth = Object.fromEntries(
    [
      "getSession",
      "getUser",
      "signUp",
      "signInWithPassword",
      "signOut",
      "resetPasswordForEmail",
      "exchangeCodeForSession",
      "onAuthStateChange",
    ].map((name) => [name, vi.fn()]),
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const load = () => import("../../../../../apps/mobile/lib/auth-provider");

describe("mobile authentication lifecycle", () => {
  it.each(["ios", "web"])(
    "registers, restores the session, verifies identity and logs out on %s",
    async (os) => {
      state.os = os;
      if (os === "web")
        vi.stubGlobal("window", { sessionStorage: { removeItem: vi.fn() } });
      const auth = await load();
      expect(auth.isAuthConfigured).toBe(true);
      const changed = vi.fn();
      const subscription = auth.onAuthStateChange(changed);
      request.mockImplementation(async () => reply({ session: session() }));
      const signed = await auth.signUpWithEmail({
        email: "test@example.invalid",
        password: "test-only-password",
        fullName: "Traveler",
      });
      expect(signed.error).toBeNull();
      expect(signed.data.user?.user_metadata.full_name).toBe("Traveler");
      expect(
        request.mock.calls.some(([url]) =>
          String(url).endsWith("/api/auth/register"),
        ),
      ).toBe(true);
      expect((await auth.getAuthSession())?.access_token).toBe("test-access");
      request.mockResolvedValueOnce(reply({ user: session().user }));
      expect((await auth.getAuthUser())?.email).toBe("test@example.invalid");
      request.mockResolvedValueOnce(reply({}));
      await auth.signOut();
      expect(changed).toHaveBeenCalledWith("SIGNED_OUT", null);
      subscription.unsubscribe();
      await auth.handleAuthCallback("app://callback");
      expect(state.sdk.auth.exchangeCodeForSession).not.toHaveBeenCalled();
    },
  );

  it("refreshes an expired native session once for concurrent readers", async () => {
    state.values.set(
      "horizon.mobile.local.session",
      JSON.stringify({ ...session(), expires_at: 1 }),
    );
    request.mockImplementation(async () => reply({ session: session() }));
    const auth = await load();
    const restored = await Promise.all([
      auth.getAuthSession(),
      auth.getAuthSession(),
    ]);
    expect(restored[0]?.user.id).toBe("user");
    expect(request).toHaveBeenCalledTimes(1);
    expect(JSON.parse(request.mock.calls[0]![1].body)).toEqual({
      refresh_token: "test-refresh",
    });
  });

  it("clears corrupt storage and returns no native session without a refresh token", async () => {
    state.values.set("horizon.mobile.local.session", "invalid json");
    const auth = await load();
    expect(await auth.getAuthSession()).toBeNull();
    expect(state.values.size).toBe(0);
    expect(await auth.getAuthUser()).toBeNull();
    expect(request).not.toHaveBeenCalled();
  });

  it.each([401, 503])(
    "handles refresh HTTP %s without accepting an invalid session",
    async (status) => {
      state.values.set(
        "horizon.mobile.local.session",
        JSON.stringify({ ...session(), expires_at: 1 }),
      );
      request.mockResolvedValue(
        reply(
          { message: ["Service", "unavailable"], code: "REFRESH_FAILED" },
          status,
        ),
      );
      const auth = await load();
      if (status === 401) {
        expect(await auth.getAuthSession()).toBeNull();
        expect(state.values.size).toBe(0);
      } else
        await expect(auth.getAuthSession()).rejects.toMatchObject({
          status,
          message: "Service unavailable",
          code: "REFRESH_FAILED",
        });
    },
  );

  it.each([401, 403, 503])(
    "handles identity HTTP %s and clears stale credentials",
    async (status) => {
      state.values.set(
        "horizon.mobile.local.session",
        JSON.stringify(session()),
      );
      request.mockResolvedValue(reply({}, status));
      const auth = await load();
      if (status === 503)
        await expect(auth.getAuthUser()).rejects.toMatchObject({ status });
      else expect(await auth.getAuthUser()).toBeNull();
      expect(state.values.size).toBe(0);
    },
  );

  it("returns sign-in errors and clears storage even if logout fails", async () => {
    const auth = await load();
    request.mockResolvedValue(reply({}, 500));
    expect(
      (await auth.signInWithEmail("test@example.invalid", "wrong")).error,
    ).toBeInstanceOf(Error);
    request.mockResolvedValue(reply({}));
    expect(
      (await auth.signInWithEmail("test@example.invalid", "wrong")).error
        ?.message,
    ).toContain("no session");
    request.mockRejectedValue("network failure");
    expect(
      (await auth.signInWithEmail("test@example.invalid", "wrong")).error
        ?.message,
    ).toBe("Authentication failed");
    state.values.set("horizon.mobile.local.session", JSON.stringify(session()));
    request.mockResolvedValue(reply({}, 500));
    await expect(auth.signOut()).rejects.toThrow();
    expect(state.values.size).toBe(0);
  });

  it("restores browser cookies before retrying refresh and uses the browser lock", async () => {
    state.os = "web";
    vi.stubGlobal("window", { sessionStorage: { removeItem: vi.fn() } });
    const lock = vi.fn(async (_name, run) => run());
    vi.stubGlobal("navigator", { locks: { request: lock } });
    request
      .mockResolvedValueOnce(reply({}, 401))
      .mockResolvedValueOnce(reply({ session: session() }));
    const auth = await load();
    expect((await auth.getAuthSession())?.user.id).toBe("user");
    expect(lock).toHaveBeenCalledOnce();
    expect(request.mock.calls.map(([url]) => new URL(url).pathname)).toEqual([
      "/api/auth/restore",
      "/api/auth/refresh",
    ]);
    expect(request.mock.calls[0]![1].credentials).toBe("include");
  });

  it("posts password recovery without leaking untrimmed addresses and reports errors", async () => {
    const auth = await load();
    request.mockResolvedValue(reply({}));
    await auth.requestPasswordReset(" test@example.invalid ");
    expect(JSON.parse(request.mock.calls[0]![1].body)).toEqual({
      email: "test@example.invalid",
    });
    request.mockResolvedValue(reply({ message: "Try later" }, 429));
    await expect(
      auth.requestPasswordReset("test@example.invalid"),
    ).rejects.toThrow("Try later");
    request.mockResolvedValue(new Response("not json", { status: 500 }));
    await expect(
      auth.requestPasswordReset("test@example.invalid"),
    ).rejects.toThrow("Password recovery failed");
  });

  it.each(["supabase", "mock"])(
    "preserves the existing %s adapter contract",
    async (provider) => {
      state.mock = provider === "mock";
      vi.stubEnv("EXPO_PUBLIC_AUTH_PROVIDER", "supabase");
      const auth = await load();
      expect(auth.supportsGoogleAuth).toBe(true);
      state.sdk.auth.getSession.mockResolvedValue({
        data: { session: session() },
        error: null,
      });
      expect((await auth.getAuthSession())?.user.id).toBe("user");
      state.sdk.auth.getSession.mockResolvedValue({
        data: { session: null },
        error: null,
      });
      expect(await auth.getAuthSession()).toBeNull();
      state.sdk.auth.getSession.mockResolvedValue({
        error: new Error("expired"),
      });
      await expect(auth.getAuthSession()).rejects.toThrow("expired");
      state.sdk.auth.getUser.mockResolvedValue({
        data: { user: { id: "sdk-user", user_metadata: {} } },
        error: null,
      });
      expect((await auth.getAuthUser())?.id).toBe("sdk-user");
      state.sdk.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: null,
      });
      expect(await auth.getAuthUser()).toBeNull();
      state.sdk.auth.getUser.mockResolvedValue({ error: new Error("invalid") });
      await expect(auth.getAuthUser()).rejects.toThrow("invalid");
      await auth.signUpWithEmail({
        email: "sdk@example.invalid",
        password: "password",
        fullName: "SDK",
      });
      await auth.signInWithEmail("sdk@example.invalid", "password");
      state.sdk.auth.signOut.mockResolvedValue({ error: null });
      await auth.signOut();
      state.sdk.auth.signOut.mockResolvedValue({ error: new Error("logout") });
      await expect(auth.signOut()).rejects.toThrow("logout");
      const changed = vi.fn();
      const unsubscribe = vi.fn();
      state.sdk.auth.onAuthStateChange.mockImplementation((callback) => {
        callback("SIGNED_IN", session());
        callback("SIGNED_OUT", null);
        return { data: { subscription: { unsubscribe } } };
      });
      auth.onAuthStateChange(changed).unsubscribe();
      expect(changed).toHaveBeenCalledWith("SIGNED_OUT", null);
      expect(unsubscribe).toHaveBeenCalledOnce();
      await auth.handleAuthCallback("app://callback");
      expect(state.sdk.auth.exchangeCodeForSession).toHaveBeenCalledWith(
        "app://callback",
      );
      if (provider === "mock") {
        state.sdk.auth.resetPasswordForEmail.mockResolvedValue({ error: null });
        await auth.requestPasswordReset("sdk@example.invalid");
        state.sdk.auth.resetPasswordForEmail.mockResolvedValue({
          error: new Error("reset"),
        });
        await expect(
          auth.requestPasswordReset("sdk@example.invalid"),
        ).rejects.toThrow("reset");
      }
    },
  );
});
