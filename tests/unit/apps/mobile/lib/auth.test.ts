import { beforeEach, describe, expect, it, vi } from "vitest";

const createURLMock = vi.fn(() => "travel://auth/callback");
const maybeCompleteAuthSessionMock = vi.fn();
const openAuthSessionAsyncMock = vi.fn();
const signInWithOAuthMock = vi.fn();
const exchangeCodeForSessionMock = vi.fn();

vi.mock("expo-linking", () => ({
  default: undefined,
  createURL: createURLMock,
}));

vi.mock("expo-web-browser", () => ({
  maybeCompleteAuthSession: maybeCompleteAuthSessionMock,
  openAuthSessionAsync: openAuthSessionAsyncMock,
}));

vi.mock("../../../../../apps/mobile/lib/supabase", () => ({
  isMockAuthEnabled: false,
  requireSupabase: () => ({
    auth: {
      signInWithOAuth: signInWithOAuthMock,
      exchangeCodeForSession: exchangeCodeForSessionMock,
    },
  }),
}));

describe("mobile auth helpers", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("bootstraps auth session at module load and exposes redirect URL", async () => {
    const mod = await import("../../../../../apps/mobile/lib/auth");

    expect(createURLMock).toHaveBeenCalledWith("auth/callback");
    expect(maybeCompleteAuthSessionMock).toHaveBeenCalledTimes(1);
    expect(mod.OAUTH_REDIRECT_URL).toBe("travel://auth/callback");
  });

  it("opens browser session and exchanges code on successful OAuth callback", async () => {
    signInWithOAuthMock.mockResolvedValue({
      data: { url: "https://auth.test/start" },
      error: null,
    });
    openAuthSessionAsyncMock.mockResolvedValue({
      type: "success",
      url: "travel://auth/callback?code=abc",
    });

    const { signInWithGoogleOnMobile, OAUTH_REDIRECT_URL } = await import("../../../../../apps/mobile/lib/auth");
    await signInWithGoogleOnMobile();

    expect(signInWithOAuthMock).toHaveBeenCalledWith({
      provider: "google",
      options: {
        redirectTo: OAUTH_REDIRECT_URL,
        skipBrowserRedirect: true,
      },
    });
    expect(openAuthSessionAsyncMock).toHaveBeenCalledWith(
      "https://auth.test/start",
      OAUTH_REDIRECT_URL
    );
    expect(exchangeCodeForSessionMock).toHaveBeenCalledWith("travel://auth/callback?code=abc");
  });

  it("throws when Supabase OAuth call fails", async () => {
    signInWithOAuthMock.mockResolvedValue({
      data: null,
      error: new Error("oauth unavailable"),
    });

    const { signInWithGoogleOnMobile } = await import("../../../../../apps/mobile/lib/auth");
    await expect(signInWithGoogleOnMobile()).rejects.toThrow("oauth unavailable");
  });

  it("skips code exchange when browser auth is cancelled", async () => {
    signInWithOAuthMock.mockResolvedValue({
      data: { url: "https://auth.test/start" },
      error: null,
    });
    openAuthSessionAsyncMock.mockResolvedValue({ type: "cancel" });

    const { signInWithGoogleOnMobile } = await import("../../../../../apps/mobile/lib/auth");
    await signInWithGoogleOnMobile();

    expect(exchangeCodeForSessionMock).not.toHaveBeenCalled();
  });
});
