import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { requireSupabase } from "./supabase";

WebBrowser.maybeCompleteAuthSession();

export const OAUTH_REDIRECT_URL = Linking.createURL("auth/callback");

export async function signInWithGoogleOnMobile() {
  const supabase = requireSupabase();
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
