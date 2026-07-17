import { createServerClient } from "@supabase/ssr";
import {
  type SupabaseCookieToSet,
  resolveSupabasePublicConfig,
  WEB_SUPABASE_PUBLIC_ENV_SPEC,
} from "@travel/types";
import { cookies } from "next/headers";
import { getLocalUserFromCookieValue, LOCAL_AUTH_COOKIE, LOCAL_AUTH_ENABLED } from "./local-auth";
import { getMockUserFromCookieValue, MOCK_AUTH_COOKIE, MOCK_AUTH_ENABLED } from "./mock-auth";

export async function createClient() {
  const cookieStore = await cookies();

  if (LOCAL_AUTH_ENABLED) {
    return {
      auth: {
        async getUser() {
          return {
            data: {
              user: getLocalUserFromCookieValue(cookieStore.get(LOCAL_AUTH_COOKIE)?.value),
            },
            error: null,
          };
        },
      },
    };
  }

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

  const resolved = resolveSupabasePublicConfig(process.env, WEB_SUPABASE_PUBLIC_ENV_SPEC);
  if (!resolved.ok || !resolved.config) {
    throw new Error(resolved.errorMessage ?? "Supabase configuration is invalid.");
  }

  return createServerClient(
    resolved.config.url,
    resolved.config.key,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: SupabaseCookieToSet[]) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options as Parameters<typeof cookieStore.set>[2]);
          });
        },
      },
    }
  );
}
