import { createServerClient } from "@supabase/ssr";
import {
  type SupabaseCookieToSet,
  resolveSupabasePublicConfig,
  WEB_SUPABASE_PUBLIC_ENV_SPEC,
} from "@travel/types";
import { NextResponse, type NextRequest } from "next/server";
import {
  getLocalSessionFromCookieValue,
  LOCAL_AUTH_COOKIE,
  LOCAL_REFRESH_COOKIE,
  LOCAL_AUTH_ENABLED,
} from "./lib/supabase/local-auth";
import {
  getMockUserFromCookieValue,
  MOCK_AUTH_COOKIE,
  MOCK_AUTH_ENABLED,
} from "./lib/supabase/mock-auth";

export async function middleware(request: NextRequest) {
  if (LOCAL_AUTH_ENABLED) {
    const protectedPaths = ["/dashboard", "/saved", "/trips", "/profile", "/account"];
    const isProtected = protectedPaths.some((p) =>
      request.nextUrl.pathname.startsWith(p),
    );
    const session = getLocalSessionFromCookieValue(
      request.cookies.get(LOCAL_AUTH_COOKIE)?.value,
    );
    const refresh = request.cookies.has(LOCAL_REFRESH_COOKIE);
    if (!session && refresh && request.nextUrl.pathname !== "/auth/renew") {
      const url = request.nextUrl.clone();
      url.pathname = "/auth/renew";
      url.search = "";
      url.searchParams.set(
        "returnTo",
        request.nextUrl.pathname + request.nextUrl.search,
      );
      // Build an absolute URL with the incoming Host; Next dev normalizes loopback URLs.
      const origin = new URL(request.url);
      origin.host = request.headers.get("host") ?? origin.host;
      return NextResponse.redirect(new URL(url.pathname + url.search, origin));
    }
    if (isProtected) {
      let authenticated = false;
      if (session) {
        try {
          const target = (
            process.env.E2E_API_PROXY_TARGET ??
            process.env.API_PROXY_TARGET ??
            "http://127.0.0.1:3001"
          ).replace(/\/$/, "");
          const response = await fetch(`${target}/api/auth/me`, {
            headers: { authorization: `Bearer ${session.access_token}` },
            cache: "no-store",
          });
          authenticated = response.ok;
        } catch {
          /* Deny protected pages when validation is unavailable. */
        }
      }
      if (!authenticated) {
        const url = request.nextUrl.clone();
        url.pathname = "/login";
        url.searchParams.set("redirectTo", request.nextUrl.pathname);
        const origin = new URL(request.url);
        origin.host = request.headers.get("host") ?? origin.host;
        return NextResponse.redirect(
          new URL(url.pathname + url.search, origin),
        );
      }
    }

    return NextResponse.next({ request });
  }

  if (MOCK_AUTH_ENABLED) {
    const protectedPaths = ["/dashboard", "/saved", "/trips", "/profile", "/account"];
    const isProtected = protectedPaths.some((p) =>
      request.nextUrl.pathname.startsWith(p),
    );
    const user = getMockUserFromCookieValue(
      request.cookies.get(MOCK_AUTH_COOKIE)?.value,
    );

    if (isProtected && !user) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("redirectTo", request.nextUrl.pathname);
      return NextResponse.redirect(url);
    }

    return NextResponse.next({ request });
  }

  // In dev without real Supabase credentials, skip auth middleware gracefully
  const resolved = resolveSupabasePublicConfig(
    process.env,
    WEB_SUPABASE_PUBLIC_ENV_SPEC,
  );
  if (!resolved.ok || !resolved.config) return NextResponse.next({ request });

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    resolved.config.url,
    resolved.config.key,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: SupabaseCookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(
              name,
              value,
              options as Parameters<typeof supabaseResponse.cookies.set>[2],
            ),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const protectedPaths = ["/dashboard", "/saved", "/trips", "/profile", "/account"];
  const isProtected = protectedPaths.some((p) =>
    request.nextUrl.pathname.startsWith(p),
  );

  if (isProtected && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirectTo", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api).*)"],
};
