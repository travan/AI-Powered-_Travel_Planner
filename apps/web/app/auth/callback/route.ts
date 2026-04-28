import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import {
  type SupabaseCookieToSet,
  resolveSupabasePublicConfig,
  WEB_SUPABASE_PUBLIC_ENV_SPEC,
} from "@travel/types";
import { cookies } from "next/headers";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/plan";
  const resolved = resolveSupabasePublicConfig(process.env, WEB_SUPABASE_PUBLIC_ENV_SPEC);

  // Only allow internal redirects
  const redirectTo = next.startsWith("/") && !next.startsWith("//") ? next : "/plan";

  if (code) {
    if (!resolved.ok || !resolved.config) {
      console.error("Missing Supabase env vars for auth callback", {
        error: resolved.errorMessage,
      });

      return NextResponse.redirect(`${origin}/login?error=auth_config_missing`);
    }

    const cookieStore = await cookies();

    const supabase = createServerClient(
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

    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(`${origin}${redirectTo}`);
    }
  }

  // Redirect to login with error if code exchange fails
  return NextResponse.redirect(`${origin}/login?error=auth_callback_error`);
}
