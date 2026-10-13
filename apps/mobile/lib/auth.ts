import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { AUTH_PROVIDER, supportsGoogleAuth } from "./auth-provider";
import { isMockAuthEnabled, requireSupabase } from "./supabase";

WebBrowser.maybeCompleteAuthSession();

export const OAUTH_REDIRECT_URL = Linking.createURL("auth/callback");

export async function signInWithGoogleOnMobile() {
  if (!supportsGoogleAuth) {
    throw new Error("Google sign-in is unavailable for local accounts. Choose Supabase auth to enable OAuth.");
  }

  const supabase = requireSupabase();

  if (AUTH_PROVIDER === "mock" || isMockAuthEnabled) {
    const { error } = await supabase.auth.exchangeCodeForSession("mock-oauth://google");
    if (error) throw error;
    return;
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: OAUTH_REDIRECT_URL,
      skipBrowserRedirect: true,
    },
  });

  if (error) throw error;

  if (data?.url) {
    const result = await WebBrowser.openAuthSessionAsync(
      data.url,
      OAUTH_REDIRECT_URL,
    );

    if (result.type === "success" && result.url) {
      await supabase.auth.exchangeCodeForSession(result.url);
    }
  }
}
