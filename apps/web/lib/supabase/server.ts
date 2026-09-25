import { createServerClient } from "@supabase/ssr";
import {
  type MockSession,
  type SupabaseCookieToSet,
  resolveSupabasePublicConfig,
  WEB_SUPABASE_PUBLIC_ENV_SPEC,
} from "@travel/types";
import { cookies } from "next/headers";
import {
  getLocalSessionFromCookieValue,
  LOCAL_AUTH_COOKIE,
  LOCAL_AUTH_ENABLED,
} from "./local-auth";
import {
  getMockSessionFromCookieValue,
  getMockUserFromCookieValue,
  MOCK_AUTH_COOKIE,
  MOCK_AUTH_ENABLED,
} from "./mock-auth";

const LOCAL_AUTH_API_TARGET = (
  process.env["E2E_API_PROXY_TARGET"] ??
  process.env["API_PROXY_TARGET"] ??
  "http://127.0.0.1:3001"
).replace(/\/$/, "");

async function validateLocalSession(session: MockSession | null) {
  if (!session?.access_token) return null;

  try {
    const response = await fetch(`${LOCAL_AUTH_API_TARGET}/api/auth/me`, {
      headers: { authorization: `Bearer ${session.access_token}` },
      cache: "no-store",
    });

    if (!response.ok) return null;

    const payload = (await response.json()) as { user?: MockSession["user"] };
    if (!payload.user?.id) return null;

    return { ...session, user: payload.user };
  } catch {
    // An unavailable API should not make a stale browser cookie look like a
    // valid authenticated session and redirect the user away from /login.
    return null;
  }
}

export async function createClient() {
  const cookieStore = await cookies();

  if (LOCAL_AUTH_ENABLED) {
    return {
      auth: {
        async getSession() {
          const session = await validateLocalSession(
            getLocalSessionFromCookieValue(cookieStore.get(LOCAL_AUTH_COOKIE)?.value)
          );

          return {
            data: {
              session,
            },
            error: null,
          };
        },
        async getUser() {
          const session = await validateLocalSession(
            getLocalSessionFromCookieValue(cookieStore.get(LOCAL_AUTH_COOKIE)?.value)
          );

          return {
            data: {
              user: session?.user ?? null,
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
        async getSession() {
          return {
            data: {
              session: getMockSessionFromCookieValue(cookieStore.get(MOCK_AUTH_COOKIE)?.value),
            },
            error: null,
          };
        },
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
