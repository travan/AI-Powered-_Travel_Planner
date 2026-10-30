import {
  createLocalBrowserClient,
  LOCAL_AUTH_ENABLED,
  refreshLocalBrowserSession,
} from "./supabase/local-auth";

// Keep requests from long-open pages working after their original access token expires.
export async function fetchWithLocalSession(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  const headers = new Headers(init?.headers);
  if (
    typeof window === "undefined" ||
    !LOCAL_AUTH_ENABLED ||
    !headers.has("Authorization")
  ) {
    return fetch(url, init);
  }
  const { data, error } = await createLocalBrowserClient().auth.getSession();
  if (error) throw error;
  if (data.session)
    headers.set("Authorization", `Bearer ${data.session.access_token}`);
  else headers.delete("Authorization");
  const response = await fetch(url, { ...init, headers });
  if (response.status !== 401 || init?.signal?.aborted) return response;
  const session = await refreshLocalBrowserSession();
  if (!session) return response;
  headers.set("Authorization", `Bearer ${session.access_token}`);
  return fetch(url, { ...init, headers });
}
