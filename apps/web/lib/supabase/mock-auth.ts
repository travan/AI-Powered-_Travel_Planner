import type {
  MockAuthChangeEvent,
  MockAuthClient,
  MockAuthResponse,
  MockSession,
  MockUser,
  StoredMockUser,
} from "@travel/types";

const USERS_STORAGE_KEY = "horizon.mock.auth.users";
const SESSION_STORAGE_KEY = "horizon.mock.auth.session";
const AUTH_CHANGE_EVENT = "horizon:mock-auth-change";
export const MOCK_AUTH_COOKIE = "horizon_mock_auth";
export const MOCK_AUTH_ENABLED = process.env["ENABLE_MOCK_AUTH_SERVER"] === "true";

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

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

function readBrowserStorage<T>(key: string, fallback: T) {
  if (typeof window === "undefined") return fallback;

  try {
    const value = window.localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeBrowserStorage<T>(key: string, value: T | null) {
  if (typeof window === "undefined") return;

  if (value === null) {
    window.localStorage.removeItem(key);
    return;
  }

  window.localStorage.setItem(key, JSON.stringify(value));
}

function setBrowserCookie(session: MockSession | null) {
  if (typeof document === "undefined") return;

  if (!session) {
    document.cookie = `${MOCK_AUTH_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
    return;
  }

  document.cookie = `${MOCK_AUTH_COOKIE}=${encodeCookieValue(session)}; Path=/; Max-Age=86400; SameSite=Lax`;
}

function createUser(email: string, userMetadata: Record<string, unknown>) {
  const normalizedEmail = normalizeEmail(email);
  const safeId = normalizedEmail.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "traveler";

  return {
    id: `mock-${safeId}`,
    email: normalizedEmail,
    user_metadata: userMetadata,
  } satisfies MockUser;
}

function createSession(user: MockUser) {
  const expiresAt = Math.floor(Date.now() / 1000) + 3600;
  return {
    access_token: `mock-access-${user.id}`,
    refresh_token: `mock-refresh-${user.id}`,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: expiresAt,
    user,
  } satisfies MockSession;
}

function getStoredUsers() {
  return readBrowserStorage<StoredMockUser[]>(USERS_STORAGE_KEY, []);
}

function setStoredUsers(users: StoredMockUser[]) {
  writeBrowserStorage(USERS_STORAGE_KEY, users);
}

function upsertStoredUser(user: MockUser, password: string) {
  const users = getStoredUsers();
  const index = users.findIndex((entry) => entry.id === user.id || entry.email === user.email);
  const nextUser: StoredMockUser = {
    id: user.id,
    email: user.email,
    password,
    user_metadata: user.user_metadata,
  };

  if (index === -1) {
    users.push(nextUser);
  } else {
    users[index] = {
      ...users[index],
      ...nextUser,
    };
  }

  setStoredUsers(users);
}

function getStoredSession() {
  return readBrowserStorage<MockSession | null>(SESSION_STORAGE_KEY, null);
}

function setStoredSession(session: MockSession | null) {
  writeBrowserStorage(SESSION_STORAGE_KEY, session);
  setBrowserCookie(session);
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

function errorResponse(message: string, code?: string): MockAuthResponse {
  const err = new Error(message) as Error & { code?: string };
  if (code) err.code = code;
  return {
    data: {
      session: null,
      user: null,
    },
    error: err,
  };
}

const E2E_SIGNUP_ERROR_KEY = "horizon.e2e.signup.force_error";

/** Read and consume the injected error scenario (set by E2E test setup). */
function consumeInjectedSignUpError(): { message: string; code: string } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(E2E_SIGNUP_ERROR_KEY);
    if (!raw) return null;
    window.localStorage.removeItem(E2E_SIGNUP_ERROR_KEY);
    return JSON.parse(raw) as { message: string; code: string };
  } catch {
    return null;
  }
}

export function getMockUserFromCookieValue(cookieValue: string | undefined) {
  return decodeCookieValue(cookieValue)?.user ?? null;
}

export function createMockBrowserClient(): MockAuthClient {
  return {
    auth: {
      async getSession() {
        return { data: { session: getStoredSession() }, error: null };
      },
      async getUser() {
        return { data: { user: getStoredSession()?.user ?? null }, error: null };
      },
      async signUp({ email, password, options }) {
        // Allow E2E tests to inject a specific error scenario via localStorage.
        const injected = consumeInjectedSignUpError();
        if (injected) {
          return errorResponse(injected.message, injected.code);
        }

        const normalizedEmail = normalizeEmail(email);
        const users = getStoredUsers();
        const existingUser = users.find((entry) => entry.email === normalizedEmail);

        if (existingUser) {
          return errorResponse("User already registered");
        }

        const user = createUser(normalizedEmail, options?.data ?? {});
        users.push({
          id: user.id,
          email: normalizedEmail,
          password,
          user_metadata: user.user_metadata,
        });
        setStoredUsers(users);

        const session = createSession(user);
        setStoredSession(session);
        emitAuthChange("SIGNED_IN", session);
        return successResponse(session);
      },
      async signInWithPassword({ email, password }) {
        const normalizedEmail = normalizeEmail(email);
        const matchedUser = getStoredUsers().find((entry) => entry.email === normalizedEmail);

        if (!matchedUser || matchedUser.password !== password) {
          return errorResponse("Invalid login credentials");
        }

        const session = createSession({
          id: matchedUser.id,
          email: matchedUser.email,
          user_metadata: matchedUser.user_metadata,
        });
        setStoredSession(session);
        emitAuthChange("SIGNED_IN", session);
        return successResponse(session);
      },
      async signInWithOAuth({ provider, options }) {
        const user = createUser(`${provider}.traveler@horizon.mock`, {
          full_name: "Horizon Traveler",
          avatar_url: null,
          provider,
        });
        upsertStoredUser(user, `oauth-${provider}-mock-password`);

        const session = createSession(user);
        setStoredSession(session);
        emitAuthChange("SIGNED_IN", session);

        return {
          data: {
            provider,
            url: options?.redirectTo ?? null,
          },
          error: null,
        };
      },
      async resetPasswordForEmail() {
        emitAuthChange("PASSWORD_RECOVERY", getStoredSession());
        return { data: {}, error: null };
      },
      async resend() {
        // Mock: no-op, just return success
        return { data: {}, error: null };
      },
      async updateUser(attributes) {
        const session = getStoredSession();
        if (!session) {
          return { data: { user: null }, error: new Error("No active session") };
        }

        const users = getStoredUsers();
        const index = users.findIndex((entry) => entry.id === session.user.id);
        if (index === -1) {
          return { data: { user: null }, error: new Error("User not found") };
        }

        const currentUser = users[index]!;

        const nextUser: StoredMockUser = {
          ...currentUser,
          password: attributes.password ?? currentUser.password,
          user_metadata: {
            ...currentUser.user_metadata,
            ...(attributes.data ?? {}),
          },
        };

        users[index] = nextUser;
        setStoredUsers(users);

        const nextSession = createSession({
          id: nextUser.id,
          email: nextUser.email,
          user_metadata: nextUser.user_metadata,
        });
        setStoredSession(nextSession);
        emitAuthChange("USER_UPDATED", nextSession);

        return { data: { user: nextSession.user }, error: null };
      },
      async signOut() {
        setStoredSession(null);
        emitAuthChange("SIGNED_OUT", null);
        return { error: null };
      },
      onAuthStateChange(callback) {
        if (typeof window === "undefined") {
          return { data: { subscription: { unsubscribe() {} } } };
        }

        const customEventHandler = (event: Event) => {
          const detail = (event as CustomEvent<{ event: MockAuthChangeEvent; session: MockSession | null }>).detail;
          callback(detail.event, detail.session);
        };
        const storageEventHandler = (event: StorageEvent) => {
          if (event.key !== SESSION_STORAGE_KEY) return;
          callback(event.newValue ? "SIGNED_IN" : "SIGNED_OUT", getStoredSession());
        };

        window.addEventListener(AUTH_CHANGE_EVENT, customEventHandler);
        window.addEventListener("storage", storageEventHandler);
        queueMicrotask(() => callback("INITIAL_SESSION", getStoredSession()));

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
