import { describe, expect, it } from "vitest";
import {
  MOBILE_SUPABASE_PUBLIC_ENV_SPEC,
  WEB_SUPABASE_PUBLIC_ENV_SPEC,
  resolveSupabasePublicConfig,
} from "../../../../../packages/types/src/supabase-config";

describe("resolveSupabasePublicConfig", () => {
  it("resolves web config using anon key", () => {
    const result = resolveSupabasePublicConfig(
      {
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
      },
      WEB_SUPABASE_PUBLIC_ENV_SPEC
    );

    expect(result.ok).toBe(true);
    expect(result.config?.url).toBe("https://example.supabase.co");
    expect(result.config?.key).toBe("anon-key");
    expect(result.config?.keyKey).toBe("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  });

  it("falls back to publishable key when anon key missing", () => {
    const result = resolveSupabasePublicConfig(
      {
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_abc",
      },
      WEB_SUPABASE_PUBLIC_ENV_SPEC
    );

    expect(result.ok).toBe(true);
    expect(result.config?.key).toBe("sb_publishable_abc");
    expect(result.config?.keyKey).toBe("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  });

  it("returns error when required values are missing", () => {
    const result = resolveSupabasePublicConfig({}, WEB_SUPABASE_PUBLIC_ENV_SPEC);

    expect(result.ok).toBe(false);
    expect(result.config).toBeNull();
    expect(result.errorMessage).toContain("Supabase is not configured for web");
  });

  it("returns error when placeholder values are present", () => {
    const result = resolveSupabasePublicConfig(
      {
        NEXT_PUBLIC_SUPABASE_URL: "https://placeholder.supabase.co",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "placeholder-key",
      },
      WEB_SUPABASE_PUBLIC_ENV_SPEC
    );

    expect(result.ok).toBe(false);
    expect(result.config).toBeNull();
    expect(result.errorMessage).toContain("placeholder");
  });

  it("resolves mobile config with expo keys", () => {
    const result = resolveSupabasePublicConfig(
      {
        EXPO_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        EXPO_PUBLIC_SUPABASE_ANON_KEY: "expo-anon",
      },
      MOBILE_SUPABASE_PUBLIC_ENV_SPEC
    );

    expect(result.ok).toBe(true);
    expect(result.config?.urlKey).toBe("EXPO_PUBLIC_SUPABASE_URL");
    expect(result.config?.keyKey).toBe("EXPO_PUBLIC_SUPABASE_ANON_KEY");
  });
});
