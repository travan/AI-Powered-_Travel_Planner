import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();

vi.mock("@supabase/supabase-js", () => ({
  createClient: createClientMock,
}));

vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
  deleteItemAsync: vi.fn(),
}));

describe("mobile supabase wiring", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("marks Supabase as unconfigured when env vars are missing", async () => {
    vi.stubEnv("EXPO_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("EXPO_PUBLIC_SUPABASE_ANON_KEY", "");

    const mod = await import("../../../../../apps/mobile/lib/supabase");

    expect(mod.isSupabaseConfigured).toBe(false);
    expect(mod.supabase).toBeNull();
    expect(() => mod.requireSupabase()).toThrow(mod.SUPABASE_CONFIG_ERROR);
  });

  it("creates a Supabase client with secure-store adapter when env is present", async () => {
    vi.stubEnv("EXPO_PUBLIC_SUPABASE_URL", "https://demo.supabase.co");
    vi.stubEnv("EXPO_PUBLIC_SUPABASE_ANON_KEY", "anon-key");

    const fakeClient = { auth: { getSession: vi.fn() } };
    createClientMock.mockReturnValue(fakeClient);

    const mod = await import("../../../../../apps/mobile/lib/supabase");

    expect(mod.isSupabaseConfigured).toBe(true);
    expect(createClientMock).toHaveBeenCalledWith(
      "https://demo.supabase.co",
      "anon-key",
      expect.objectContaining({
        auth: expect.objectContaining({
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: false,
          storage: expect.objectContaining({
            getItem: expect.any(Function),
            setItem: expect.any(Function),
            removeItem: expect.any(Function),
          }),
        }),
      })
    );
    expect(mod.requireSupabase()).toBe(fakeClient);
  });
});
