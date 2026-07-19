import { createBrowserClient } from "@supabase/ssr";
import { resolveSupabasePublicConfig, WEB_SUPABASE_PUBLIC_ENV_SPEC } from "@travel/types";
import { createLocalBrowserClient, LOCAL_AUTH_ENABLED } from "./local-auth";
import { createMockBrowserClient, MOCK_AUTH_ENABLED } from "./mock-auth";

export function createClient() {
  const forceRealAuthClientForE2E = process.env.NEXT_PUBLIC_E2E_FORCE_REAL_AUTH_CLIENT === "true";

  if (LOCAL_AUTH_ENABLED && !forceRealAuthClientForE2E) {
    return createLocalBrowserClient();
  }

  if (MOCK_AUTH_ENABLED && !forceRealAuthClientForE2E) {
    return createMockBrowserClient();
  }

  const resolved = resolveSupabasePublicConfig(process.env, WEB_SUPABASE_PUBLIC_ENV_SPEC);
  if (!resolved.ok || !resolved.config) {
    throw new Error(resolved.errorMessage ?? "Supabase configuration is invalid.");
  }

  return createBrowserClient(resolved.config.url, resolved.config.key);
}
