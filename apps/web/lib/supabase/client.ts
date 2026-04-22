import { createBrowserClient } from "@supabase/ssr";
import { createMockBrowserClient, MOCK_AUTH_ENABLED } from "./mock-auth";

export function createClient() {
  if (MOCK_AUTH_ENABLED) {
    return createMockBrowserClient();
  }

  return createBrowserClient(
    process.env["NEXT_PUBLIC_SUPABASE_URL"]!,
    process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"]!
  );
}
