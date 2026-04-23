import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getMockUserFromCookieValue, MOCK_AUTH_COOKIE, MOCK_AUTH_ENABLED } from "./mock-auth";

type CookieToSet = {
  name: string;
  value: string;
  options: Record<string, unknown>;
};

export async function createClient() {
  const cookieStore = await cookies();

  if (MOCK_AUTH_ENABLED) {
    return {
      auth: {
        async getUser() {
          return {
            data: {
              user: getMockUserFromCookieValue(cookieStore.get(MOCK_AUTH_COOKIE)?.value),
            },
            error: null,
          };
        },
      },
    };
  }

  return createServerClient(
    process.env["NEXT_PUBLIC_SUPABASE_URL"]!,
    process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"]!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options as Parameters<typeof cookieStore.set>[2]);
          });
        },
      },
    }
  );
}
