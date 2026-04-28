import { createServerClient } from "@supabase/ssr";
import {
  type SupabaseCookieToSet,
  resolveSupabasePublicConfig,
  WEB_SUPABASE_PUBLIC_ENV_SPEC,
} from "@travel/types";
import { NextResponse, type NextRequest } from "next/server";
import { getMockUserFromCookieValue, MOCK_AUTH_COOKIE, MOCK_AUTH_ENABLED } from "./lib/supabase/mock-auth";

export async function middleware(request: NextRequest) {
  if (MOCK_AUTH_ENABLED) {
    const protectedPaths = ["/dashboard", "/saved"];
    const isProtected = protectedPaths.some((p) =>
      request.nextUrl.pathname.startsWith(p)
    );
    const user = getMockUserFromCookieValue(request.cookies.get(MOCK_AUTH_COOKIE)?.value);

    if (isProtected && !user) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("redirectTo", request.nextUrl.pathname);
      return NextResponse.redirect(url);
    }

    return NextResponse.next({ request });
  }

  // In dev without real Supabase credentials, skip auth middleware gracefully
  const resolved = resolveSupabasePublicConfig(process.env, WEB_SUPABASE_PUBLIC_ENV_SPEC);
  if (!resolved.ok || !resolved.config) return NextResponse.next({ request });

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(resolved.config.url, resolved.config.key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: SupabaseCookieToSet[]) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options as Parameters<typeof supabaseResponse.cookies.set>[2])
        );
      },
    },
  });

  const { data: { user } } = await supabase.auth.getUser();

  const protectedPaths = ["/dashboard", "/saved"];
  const isProtected = protectedPaths.some((p) =>
    request.nextUrl.pathname.startsWith(p)
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
