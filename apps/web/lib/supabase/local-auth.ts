import type {
  MockAuthCallback,
  MockAuthChangeEvent,
  MockAuthClient,
  MockAuthResponse,
  MockSession,
  MockUser,
} from "@travel/types";

const SESSION_STORAGE_KEY = "horizon.local.auth.session";
const AUTH_CHANGE_EVENT = "horizon:local-auth-change";
export const LOCAL_AUTH_COOKIE = "horizon_local_auth";
export const LOCAL_AUTH_ENABLED =
  (process.env["NEXT_PUBLIC_AUTH_PROVIDER"] ?? process.env["AUTH_PROVIDER"] ?? "local") === "local";

function encodeCookieValue(session: MockSession | null) {
  if (!session) return "";
  return encodeURIComponent(JSON.stringify(session));
}

function decodeCookieValue(value: string | undefined) {
  if (!value) return null;

  try {
    return JSON.parse(decodeURIComponent(value)) as MockSession;
  } catch {
    return null;
  }
}

function readSessionCookie() {
  if (typeof document === "undefined") return null;

  const cookie = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${LOCAL_AUTH_COOKIE}=`));

  return decodeCookieValue(cookie?.slice(`${LOCAL_AUTH_COOKIE}=`.length));
}

function readSession() {
  if (typeof window === "undefined") return null;

  const cookieSession = readSessionCookie();

  try {
    const value = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (value) {
      const storedSession = JSON.parse(value) as MockSession;

      // The cookie is what SSR uses to decide whether /login should redirect.
      // Prefer it when the browser has two different local sessions, otherwise
      // the server and client can disagree about whether the user is signed in.
      if (!cookieSession || storedSession.access_token === cookieSession.access_token) {
        return storedSession;
      }

      window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(cookieSession));
      return cookieSession;
    }
  } catch {
    // Fall back to the server-readable cookie when localStorage is stale or
    // unavailable after a browser reload.
  }

  if (cookieSession) {
    try {
      window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(cookieSession));
    } catch {
      // The cookie is still enough to continue this session.
    }
  }
  return cookieSession;
}

function writeSession(session: MockSession | null) {
  if (typeof window === "undefined") return;

  if (session) {
    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    document.cookie = `${LOCAL_AUTH_COOKIE}=${encodeCookieValue(session)}; Path=/; Max-Age=604800; SameSite=Lax`;
    return;
  }

  window.localStorage.removeItem(SESSION_STORAGE_KEY);
  document.cookie = `${LOCAL_AUTH_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}

function emitAuthChange(event: MockAuthChangeEvent, session: MockSession | null) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(AUTH_CHANGE_EVENT, { detail: { event, session } }));
}

function successResponse(session: MockSession | null): MockAuthResponse {
  return {
    data: {
      session,
      user: session?.user ?? null,
    },
    error: null,
  };
}

function errorResponse(message: string, code?: string, status?: number): MockAuthResponse {
  const error = new Error(message) as Error & { code?: string; status?: number };
  if (code) error.code = code;
  if (status) error.status = status;
  return {
    data: {
      session: null,
      user: null,
    },
    error,
  };
}

export function getLocalUserFromCookieValue(cookieValue: string | undefined): MockUser | null {
  return decodeCookieValue(cookieValue)?.user ?? null;
}

export function getLocalSessionFromCookieValue(cookieValue: string | undefined): MockSession | null {
  return decodeCookieValue(cookieValue);
}

export function createLocalBrowserClient(): MockAuthClient {
  return {
    auth: {
      async getSession() {
        const session = readSession();
        // Keep the server-readable cookie in sync for users who already had a
        // localStorage session before SSR itinerary pages were introduced.
        writeSession(session);
        return { data: { session }, error: null };
      },
      async getUser() {
        const session = readSession();
        if (!session?.access_token) {
          writeSession(null);
          return { data: { user: null }, error: null };
        }

        const response = await fetch("/api/auth/me", {
          headers: { authorization: `Bearer ${session.access_token}` },
        });

        if (!response.ok) {
          writeSession(null);
          return { data: { user: null }, error: null };
        }

        const payload = (await response.json()) as { user: MockUser };
        return { data: { user: payload.user }, error: null };
      },
      async signUp({ email, password, options }) {
        const fullName = typeof options?.data?.["full_name"] === "string"
          ? options.data["full_name"]
          : undefined;
        const result = await postAuth("/api/auth/register", {
          email,
          password,
          full_name: fullName,
        });
        if (result.error) return result;

        writeSession(result.data.session);
        emitAuthChange("SIGNED_IN", result.data.session);
        return result;
      },
      async signInWithPassword({ email, password }) {
        const result = await postAuth("/api/auth/session", { email, password });
        if (result.error) return result;

        writeSession(result.data.session);
        emitAuthChange("SIGNED_IN", result.data.session);
        return result;
      },
      async signInWithOAuth({ provider }) {
        return {
          data: { provider, url: null },
          error: new Error("OAuth provider is not configured for local auth"),
        };
      },
      async resetPasswordForEmail() {
        return { data: {}, error: null };
      },
      async resend() {
        return { data: {}, error: null };
      },
      async updateUser() {
        return { data: { user: readSession()?.user ?? null }, error: null };
      },
      async signOut() {
        const session = readSession();
        if (session?.access_token) {
          await fetch("/api/auth/logout", {
            method: "POST",
            headers: { authorization: `Bearer ${session.access_token}` },
          }).catch(() => undefined);
        }

        writeSession(null);
        emitAuthChange("SIGNED_OUT", null);
        return { error: null };
      },
      onAuthStateChange(callback: MockAuthCallback) {
        if (typeof window === "undefined") {
          return { data: { subscription: { unsubscribe() {} } } };
        }

        const customEventHandler = (event: Event) => {
          const detail = (event as CustomEvent<{ event: MockAuthChangeEvent; session: MockSession | null }>).detail;
          callback(detail.event, detail.session);
        };
        const storageEventHandler = (event: StorageEvent) => {
          if (event.key !== SESSION_STORAGE_KEY) return;
          callback(event.newValue ? "SIGNED_IN" : "SIGNED_OUT", readSession());
        };

        window.addEventListener(AUTH_CHANGE_EVENT, customEventHandler);
        window.addEventListener("storage", storageEventHandler);
        queueMicrotask(() => callback("INITIAL_SESSION", readSession()));

        return {
          data: {
            subscription: {
              unsubscribe() {
                window.removeEventListener(AUTH_CHANGE_EVENT, customEventHandler);
                window.removeEventListener("storage", storageEventHandler);
              },
            },
          },
        };
      },
    },
  };
}

async function postAuth(path: string, body: Record<string, unknown>): Promise<MockAuthResponse> {
  try {
    const response = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      code?: string;
      message?: string;
      session?: MockSession;
    };

    if (!response.ok || !payload.session) {
      return errorResponse(
        payload.message ?? "Authentication failed",
        payload.code,
        response.status
      );
    }

    return successResponse(payload.session);
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Authentication failed");
  }
}
