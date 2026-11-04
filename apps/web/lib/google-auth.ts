export type GoogleAccountMethods = {
  googleLinked: boolean;
  hasPassword: boolean;
  googleEnabled: boolean;
};

export async function getGoogleAccountMethods(): Promise<GoogleAccountMethods> {
  const response = await fetch("/api/auth/google/status", {
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Could not load sign-in methods");
  return response.json();
}

export async function startGoogleAuth(input: {
  intent: "signin" | "link";
  next?: string;
  password?: string;
}): Promise<string> {
  const response = await fetch("/api/auth/google/start", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", "x-auth-client": "web" },
    body: JSON.stringify(input),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || typeof data.url !== "string")
    throw Object.assign(new Error("Google authentication failed"), {
      code: data.code ?? "google_error",
    });
  const url = new URL(data.url);
  if (url.origin !== "https://accounts.google.com")
    throw new Error("Invalid Google destination");
  return url.href;
}
