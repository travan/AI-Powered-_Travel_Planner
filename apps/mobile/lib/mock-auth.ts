type MockUser = {
  id: string;
  email: string;
  user_metadata: Record<string, unknown>;
};

type MockSession = {
  access_token: string;
  refresh_token: string;
  token_type: "bearer";
  expires_in: number;
  expires_at: number;
  user: MockUser;
};

type StoredMockUser = {
  id: string;
  email: string;
  password: string;
  user_metadata: Record<string, unknown>;
};

type AuthChangeEvent = "INITIAL_SESSION" | "SIGNED_IN" | "SIGNED_OUT" | "PASSWORD_RECOVERY" | "USER_UPDATED";

type AuthCallback = (event: AuthChangeEvent, session: MockSession | null) => void;

const USERS_KEY = "horizon.mobile.mock.users";
const SESSION_KEY = "horizon.mobile.mock.session";
const MEMORY_STORAGE_KEY = "__horizon_mobile_mock_storage__";

export const isMockAuthEnabled = process.env["EXPO_PUBLIC_ENABLE_MOCK_AUTH"] === "true";

const subscribers = new Set<AuthCallback>();

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function getMemoryStorage() {
  const scope = globalThis as typeof globalThis & {
    [MEMORY_STORAGE_KEY]?: Map<string, string>;
  };

  if (!scope[MEMORY_STORAGE_KEY]) {
    scope[MEMORY_STORAGE_KEY] = new Map<string, string>();
  }

  return scope[MEMORY_STORAGE_KEY]!;
}

function getStorageItem(key: string) {
  if (typeof localStorage !== "undefined") {
    return localStorage.getItem(key);
  }

  return getMemoryStorage().get(key) ?? null;
}

function setStorageItem(key: string, value: string | null) {
  if (typeof localStorage !== "undefined") {
    if (value === null) {
      localStorage.removeItem(key);
      return;
    }

    localStorage.setItem(key, value);
    return;
  }

  const memoryStorage = getMemoryStorage();
  if (value === null) {
    memoryStorage.delete(key);
    return;
  }

  memoryStorage.set(key, value);
}

function readJson<T>(key: string, fallback: T) {
  const rawValue = getStorageItem(key);
  if (!rawValue) return fallback;

  try {
    return JSON.parse(rawValue) as T;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T | null) {
  setStorageItem(key, value === null ? null : JSON.stringify(value));
}

function emit(event: AuthChangeEvent, session: MockSession | null) {
  for (const subscriber of subscribers) {
    subscriber(event, session);
  }
}

function createUser(email: string, userMetadata: Record<string, unknown>) {
  const normalizedEmail = normalizeEmail(email);
  const safeId = normalizedEmail.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "traveler";

  return {
    id: `mock-mobile-${safeId}`,
    email: normalizedEmail,
    user_metadata: userMetadata,
  } satisfies MockUser;
}

function createSession(user: MockUser) {
  const expiresAt = Math.floor(Date.now() / 1000) + 3600;
  return {
    access_token: `mock-mobile-access-${user.id}`,
    refresh_token: `mock-mobile-refresh-${user.id}`,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: expiresAt,
    user,
  } satisfies MockSession;
}

function getUsers() {
  return readJson<StoredMockUser[]>(USERS_KEY, []);
}

function setUsers(users: StoredMockUser[]) {
  writeJson(USERS_KEY, users);
}

function getSession() {
  return readJson<MockSession | null>(SESSION_KEY, null);
}

function setSession(session: MockSession | null) {
  writeJson(SESSION_KEY, session);
}

export function createMockSupabaseClient() {
  return {
    auth: {
      async getSession() {
        return { data: { session: getSession() }, error: null };
      },
      async getUser() {
        return { data: { user: getSession()?.user ?? null }, error: null };
      },
      async signUp({
        email,
        password,
        options,
      }: {
        email: string;
        password: string;
        options?: { data?: Record<string, unknown> };
      }) {
        const normalizedEmail = normalizeEmail(email);
        const users = getUsers();
        if (users.some((entry) => entry.email === normalizedEmail)) {
          return { data: { user: null, session: null }, error: new Error("User already registered") };
        }

        const user = createUser(normalizedEmail, options?.data ?? {});
        users.push({
          id: user.id,
          email: normalizedEmail,
          password,
          user_metadata: user.user_metadata,
        });
        setUsers(users);

        const session = createSession(user);
        setSession(session);
        emit("SIGNED_IN", session);

        return { data: { user, session }, error: null };
      },
      async signInWithPassword({ email, password }: { email: string; password: string }) {
        const normalizedEmail = normalizeEmail(email);
        const matchedUser = getUsers().find((entry) => entry.email === normalizedEmail);
        if (!matchedUser || matchedUser.password !== password) {
          return { data: { user: null, session: null }, error: new Error("Invalid login credentials") };
        }

        const session = createSession({
          id: matchedUser.id,
          email: matchedUser.email,
          user_metadata: matchedUser.user_metadata,
        });
        setSession(session);
        emit("SIGNED_IN", session);

        return { data: { user: session.user, session }, error: null };
      },
      async signInWithOAuth({ provider }: { provider: string }) {
        return {
          data: { url: `mock-oauth://${provider}` },
          error: null,
        };
      },
      async exchangeCodeForSession() {
        const session = createSession(
          createUser("google.traveler@horizon.mock", {
            full_name: "Horizon Traveler",
            provider: "google",
          })
        );
        setSession(session);
        emit("SIGNED_IN", session);

        return { data: { session, user: session.user }, error: null };
      },
      async resetPasswordForEmail() {
        emit("PASSWORD_RECOVERY", getSession());
        return { data: {}, error: null };
      },
      async updateUser(attributes: { password?: string; data?: Record<string, unknown> }) {
        const session = getSession();
        if (!session) {
          return { data: { user: null }, error: new Error("No active session") };
        }

        const users = getUsers();
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
        setUsers(users);

        const nextSession = createSession({
          id: nextUser.id,
          email: nextUser.email,
          user_metadata: nextUser.user_metadata,
        });
        setSession(nextSession);
        emit("USER_UPDATED", nextSession);

        return { data: { user: nextSession.user }, error: null };
      },
      async signOut() {
        setSession(null);
        emit("SIGNED_OUT", null);
        return { error: null };
      },
      onAuthStateChange(callback: AuthCallback) {
        subscribers.add(callback);
        queueMicrotask(() => callback("INITIAL_SESSION", getSession()));

        return {
          data: {
            subscription: {
              unsubscribe() {
                subscribers.delete(callback);
              },
            },
          },
        };
      },
    },
  };
}

export async function getMockSavedTrips() {
  const session = getSession();
  if (!session) return [];

  return [
    {
      id: "mock-saved-trip-1",
      title: "Kyoto Cultural Escape",
      cities: ["Kyoto", "Osaka"],
      days: 7,
      date: "10/12/2026",
    },
  ];
}