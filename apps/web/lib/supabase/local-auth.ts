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
  (process.env["NEXT_PUBLIC_AUTH_PROVIDER"] ??
    process.env["AUTH_PROVIDER"] ??
    "local") === "local";

let memorySession: MockSession | null = null;
let pendingSession: Promise<MockSession | null> | null = null;
let authVersion = 0;
let lastSessionError: Error | null = null;
const AUTH_SIGNAL_KEY = "horizon.local.auth.event";
export const LOCAL_REFRESH_COOKIE = "horizon_local_refresh";

function readSession() {
  return memorySession;
}

export async function refreshLocalBrowserSession() {
  memorySession = null;
  return restoreSession();
}

function writeSession(session: MockSession | null) {
  memorySession = session ? { ...session, refresh_token: "" } : null;
  if (session) lastSessionError = null;
  // Remove credentials left by the previous browser implementation.
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(SESSION_STORAGE_KEY);
    } catch {
      /* Storage may be disabled. */
    }
  }
}

async function restoreSession(): Promise<MockSession | null> {
  if (typeof window === "undefined") return null;
  if (memorySession && memorySession.expires_at > Date.now() / 1000 + 30)
    return memorySession;
  if (pendingSession) return pendingSession;
  const version = authVersion;
  const restore = async () => {
    const existing = await postAuth("/api/auth/restore", {});
    let result = existing;
    // A temporary network error must not consume or discard a refresh token.
    if (
      (existing.error &&
        (existing.error as Error & { status?: number }).status === 401) ||
      (!existing.error &&
        existing.data.session &&
        existing.data.session.expires_at <= Date.now() / 1000 + 30)
    ) {
      result = await postAuth("/api/auth/refresh", {});
    }
    if (version !== authVersion) return memorySession;
    lastSessionError =
      result.error &&
      (result.error as Error & { status?: number }).status !== 401
        ? result.error
        : null;
    if (!result.error) writeSession(result.data.session);
    else if ((result.error as Error & { status?: number }).status === 401)
      writeSession(null);
    return result.error ? null : memorySession;
  };
  // Coordinate tabs so one-use refresh cookies are never redeemed concurrently.
  pendingSession = (
    typeof navigator !== "undefined" && navigator.locks
      ? navigator.locks.request("horizon-auth-refresh", restore)
      : restore()
  ).finally(() => {
    pendingSession = null;
  });
  return pendingSession;
}

function emitAuthChange(
  event: MockAuthChangeEvent,
  session: MockSession | null,
) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(AUTH_CHANGE_EVENT, { detail: { event, session } }),
  );
  try {
    window.localStorage.setItem(
      AUTH_SIGNAL_KEY,
      JSON.stringify({ event, time: Date.now() }),
    );
  } catch {
    /* No credentials are stored in this signal. */
  }
}

function successResponse(session: MockSession | null): MockAuthResponse {
  const browserSession = session ? { ...session, refresh_token: "" } : null;
  return {
    data: {
      session: browserSession,
      user: browserSession?.user ?? null,
    },
    error: null,
  };
}

function errorResponse(
  message: string,
  code?: string,
  status?: number,
): MockAuthResponse {
  const error = new Error(message) as Error & {
    code?: string;
    status?: number;
  };
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

// Server/middleware hint only. Actual identity is validated with /api/auth/me.
export function getLocalSessionFromCookieValue(
  value: string | undefined,
): MockSession | null {
  if (!value) return null;
  try {
    const claims = JSON.parse(
      atob(value.split(".")[1]!.replace(/-/g, "+").replace(/_/g, "/")),
    );
    if (
      typeof claims.sub !== "string" ||
      typeof claims.exp !== "number" ||
      claims.exp <= Date.now() / 1000
    )
      return null;
    return {
      access_token: value,
      refresh_token: "",
      token_type: "bearer",
      expires_in: Math.max(0, claims.exp - Math.floor(Date.now() / 1000)),
      expires_at: claims.exp,
      user: {
        id: claims.sub,
        email: typeof claims.email === "string" ? claims.email : "",
        user_metadata: {},
      },
    };
  } catch {
    return null;
  }
}

export function createLocalBrowserClient(): MockAuthClient {
  return {
    auth: {
      async getSession() {
        const session = await restoreSession();
        return { data: { session }, error: lastSessionError };
      },
      async getUser() {
        const session = await restoreSession();
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
        const fullName =
          typeof options?.data?.["full_name"] === "string"
            ? options.data["full_name"]
            : undefined;
        await pendingSession;
        const result = await postAuth("/api/auth/register", {
          email,
          password,
          full_name: fullName,
        });
        if (result.error) return result;

        authVersion++;
        writeSession(result.data.session);
        emitAuthChange("SIGNED_IN", result.data.session);
        return result;
      },
      async signInWithPassword({ email, password }) {
        await pendingSession;
        const result = await postAuth("/api/auth/session", { email, password });
        if (result.error) return result;

        authVersion++;
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
      async resetPasswordForEmail(email) {
        try {
          const response = await fetch("/api/auth/forgot-password", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ email }),
          });
          const payload = await response.json().catch(() => ({}));
          return {
            data: {},
            error: response.ok
              ? null
              : new Error(
                  typeof payload.message === "string"
                    ? payload.message
                    : "Password recovery failed",
                ),
          };
        } catch {
          return {
            data: {},
            error: new Error("Password recovery failed. Please try again."),
          };
        }
      },
      async resend() {
        return { data: {}, error: null };
      },
      async updateUser() {
        return {
          data: { user: readSession()?.user ?? null },
          error: new Error(
            "Open the reset link in your email to change your password.",
          ),
        };
      },
      async signOut() {
        const session = readSession();
        authVersion++;
        await pendingSession;
        const response = await fetch("/api/auth/logout", {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "content-type": "application/json",
            "x-auth-client": "web",
            ...(session?.access_token
              ? { authorization: `Bearer ${session.access_token}` }
              : {}),
          },
          body: "{}",
        }).catch(() => null);
        // A failed network logout cannot clear HttpOnly cookies; report it.
        if (!response?.ok)
          return {
            error: new Error(
              "Sign out could not reach the server. Please try again.",
            ),
          };
        writeSession(null);
        emitAuthChange("SIGNED_OUT", null);
        return { error: null };
      },
      onAuthStateChange(callback: MockAuthCallback) {
        if (typeof window === "undefined") {
          return { data: { subscription: { unsubscribe() {} } } };
        }

        const customEventHandler = (event: Event) => {
          const detail = (
            event as CustomEvent<{
              event: MockAuthChangeEvent;
              session: MockSession | null;
            }>
          ).detail;
          callback(detail.event, detail.session);
        };
        let active = true;
        const storageEventHandler = (event: StorageEvent) => {
          if (event.key !== AUTH_SIGNAL_KEY) return;
          authVersion++;
          writeSession(null);
          if (event.newValue?.includes("SIGNED_OUT"))
            callback("SIGNED_OUT", null);
          else
            void restoreSession().then((session) => {
              if (active) callback("SIGNED_IN", session);
            });
        };
        window.addEventListener("storage", storageEventHandler);
        window.addEventListener(AUTH_CHANGE_EVENT, customEventHandler);
        void restoreSession().then((session) => {
          if (active) callback("INITIAL_SESSION", session);
        });

        return {
          data: {
            subscription: {
              unsubscribe() {
                window.removeEventListener(
                  AUTH_CHANGE_EVENT,
                  customEventHandler,
                );
                active = false;
                window.removeEventListener("storage", storageEventHandler);
              },
            },
          },
        };
      },
    },
  };
}

async function postAuth(
  path: string,
  body: Record<string, unknown>,
): Promise<MockAuthResponse> {
  try {
    const response = await fetch(path, {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json", "x-auth-client": "web" },
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
        response.status,
      );
    }

    return successResponse(payload.session);
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Authentication failed",
    );
  }
}
