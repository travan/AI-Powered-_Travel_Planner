import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import type {
  MockAuthCallback,
  MockAuthChangeEvent,
  MockSession,
  MockUser,
} from "@travel/types";
import { mobileApiUrl } from "./api";
import {
  isMockAuthEnabled,
  isSupabaseConfigured,
  requireSupabase,
} from "./supabase";

export type MobileAuthProvider = "local" | "supabase" | "mock";

export const AUTH_PROVIDER: MobileAuthProvider = isMockAuthEnabled
  ? "mock"
  : process.env.EXPO_PUBLIC_AUTH_PROVIDER === "supabase"
    ? "supabase"
    : "local";

export const isAuthConfigured =
  AUTH_PROVIDER === "local" ||
  AUTH_PROVIDER === "mock" ||
  (AUTH_PROVIDER === "supabase" && isSupabaseConfigured);

export const AUTH_CONFIG_ERROR =
  AUTH_PROVIDER === "supabase"
    ? "Supabase auth is not configured. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY."
    : "Mobile authentication is not configured.";

export const supportsGoogleAuth =
  AUTH_PROVIDER === "supabase" || AUTH_PROVIDER === "mock";

const LOCAL_SESSION_KEY = "horizon.mobile.local.session";
let browserSessionValue: string | null = null;
let refreshing: Promise<MockSession | null> | null = null;
const localAuthSubscribers = new Set<MockAuthCallback>();

async function getLocalSessionValue() {
  if (Platform.OS === "web") {
    return browserSessionValue;
  }
  return SecureStore.getItemAsync(LOCAL_SESSION_KEY);
}

async function setLocalSessionValue(value: string | null) {
  if (Platform.OS === "web") {
    if (typeof window === "undefined") return;
    window.sessionStorage.removeItem(LOCAL_SESSION_KEY);
    browserSessionValue = value;
    return;
  }
  if (value === null) await SecureStore.deleteItemAsync(LOCAL_SESSION_KEY);
  else await SecureStore.setItemAsync(LOCAL_SESSION_KEY, value);
}

type LocalApiUser = {
  id: string;
  email: string;
  full_name?: string | null;
  avatar_url?: string | null;
  provider?: string;
};

type LocalApiSession = Omit<MockSession, "user"> & { user: LocalApiUser };

function mapUser(user: LocalApiUser | MockUser): MockUser {
  if ("user_metadata" in user) return user;
  return {
    id: user.id,
    email: user.email,
    user_metadata: {
      ...(user.full_name ? { full_name: user.full_name } : {}),
      ...(user.avatar_url ? { avatar_url: user.avatar_url } : {}),
      ...(user.provider ? { provider: user.provider } : {}),
    },
  };
}

function mapSession(session: LocalApiSession | MockSession): MockSession {
  return { ...session, user: mapUser(session.user) };
}

async function readLocalSession(): Promise<MockSession | null> {
  const serialized = await getLocalSessionValue();
  let current: MockSession | null = null;
  try {
    current = serialized ? mapSession(JSON.parse(serialized)) : null;
  } catch {
    await setLocalSessionValue(null);
  }
  if (current && current.expires_at > Date.now() / 1000 + 30) return current;
  if (Platform.OS !== "web" && !current?.refresh_token) return null;
  if (refreshing) return refreshing;
  const refresh = async () => {
    const web = Platform.OS === "web";
    const send = (path: string) =>
      fetch(mobileApiUrl(path), {
        method: "POST",
        credentials: web ? "include" : "omit",
        headers: {
          "content-type": "application/json",
          ...(web ? { "x-auth-client": "web" } : {}),
        },
        body: JSON.stringify(
          web ? {} : { refresh_token: current!.refresh_token },
        ),
      });
    let response = await send(web ? "/api/auth/restore" : "/api/auth/refresh");
    if (web && response.status === 401)
      response = await send("/api/auth/refresh");
    if (!response.ok) {
      if (response.status === 401) await writeLocalSession(null);
      else throw await readError(response);
      return null;
    }
    const payload = await response.json();
    const session = mapSession(payload.session);
    await writeLocalSession(session);
    return session;
  };
  refreshing = (
    Platform.OS === "web" && typeof navigator !== "undefined" && navigator.locks
      ? navigator.locks.request("horizon-auth-refresh", refresh)
      : refresh()
  ).finally(() => {
    refreshing = null;
  });
  return refreshing;
}

async function writeLocalSession(session: MockSession | null) {
  await setLocalSessionValue(session ? JSON.stringify(session) : null);
}

function emitLocalAuthChange(
  event: MockAuthChangeEvent,
  session: MockSession | null,
) {
  for (const callback of localAuthSubscribers) callback(event, session);
}

async function readError(response: Response) {
  const payload = (await response.json().catch(() => ({}))) as {
    message?: string | string[];
    code?: string;
  };
  const message = Array.isArray(payload.message)
    ? payload.message.join(" ")
    : payload.message;
  const error = new Error(
    message ?? `Authentication request failed (${response.status})`,
  ) as Error & { code?: string; status?: number };
  error.code = payload.code;
  error.status = response.status;
  return error;
}

async function localAuthPost(path: string, body?: Record<string, unknown>) {
  const current = path === "/api/auth/logout" ? await readLocalSession() : null;
  const response = await fetch(mobileApiUrl(path), {
    method: "POST",
    credentials: Platform.OS === "web" ? "include" : "omit",
    headers: {
      ...(Platform.OS === "web" ? { "x-auth-client": "web" } : {}),
      "content-type": "application/json",
      ...(current?.access_token
        ? { authorization: `Bearer ${current.access_token}` }
        : {}),
    },
    body: JSON.stringify(
      body ??
        (Platform.OS === "web"
          ? {}
          : { refresh_token: current?.refresh_token }),
    ),
  });
  if (!response.ok) throw await readError(response);
  return response.json() as Promise<{
    session?: LocalApiSession;
    user?: LocalApiUser;
  }>;
}

async function localSignIn(path: string, body: Record<string, unknown>) {
  try {
    const payload = await localAuthPost(path, body);
    if (!payload.session)
      throw new Error("The auth server returned no session.");
    const session = mapSession(payload.session);
    await writeLocalSession(session);
    emitLocalAuthChange("SIGNED_IN", session);
    return { data: { user: session.user, session }, error: null };
  } catch (error) {
    return {
      data: { user: null, session: null },
      error:
        error instanceof Error ? error : new Error("Authentication failed"),
    };
  }
}

export async function getAuthSession(): Promise<MockSession | null> {
  if (AUTH_PROVIDER === "local") return readLocalSession();
  const { data, error } = await requireSupabase().auth.getSession();
  if (error) throw error;
  return data.session ? mapSession(data.session as MockSession) : null;
}

export async function getAuthUser(): Promise<MockUser | null> {
  if (AUTH_PROVIDER === "local") {
    const session = await readLocalSession();
    if (!session) return null;
    const response = await fetch(mobileApiUrl("/api/auth/me"), {
      headers: { authorization: `Bearer ${session.access_token}` },
    });
    if (!response.ok) {
      await writeLocalSession(null);
      emitLocalAuthChange("SIGNED_OUT", null);
      if (response.status === 401 || response.status === 403) return null;
      throw await readError(response);
    }
    const payload = (await response.json()) as { user: LocalApiUser };
    return mapUser(payload.user);
  }
  const { data, error } = await requireSupabase().auth.getUser();
  if (error) throw error;
  return data.user ? mapUser(data.user as MockUser) : null;
}

export async function signUpWithEmail(input: {
  email: string;
  password: string;
  fullName: string;
}) {
  if (AUTH_PROVIDER === "local") {
    return localSignIn("/api/auth/register", {
      email: input.email,
      password: input.password,
      full_name: input.fullName,
    });
  }
  return requireSupabase().auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      data: { full_name: input.fullName, display_name: input.fullName },
    },
  });
}

export async function signInWithEmail(email: string, password: string) {
  if (AUTH_PROVIDER === "local") {
    return localSignIn("/api/auth/session", { email, password });
  }
  return requireSupabase().auth.signInWithPassword({ email, password });
}

export async function signOut() {
  if (AUTH_PROVIDER === "local") {
    try {
      await localAuthPost("/api/auth/logout");
    } finally {
      await writeLocalSession(null);
      emitLocalAuthChange("SIGNED_OUT", null);
    }
    return;
  }
  const { error } = await requireSupabase().auth.signOut();
  if (error) throw error;
}

export function onAuthStateChange(callback: MockAuthCallback) {
  if (AUTH_PROVIDER !== "local") {
    return requireSupabase().auth.onAuthStateChange((event, session) => {
      callback(
        event as MockAuthChangeEvent,
        session ? mapSession(session as MockSession) : null,
      );
    }).data.subscription;
  }

  localAuthSubscribers.add(callback);
  void getAuthSession().then((session) => {
    if (localAuthSubscribers.has(callback))
      callback("INITIAL_SESSION", session);
  });
  return { unsubscribe: () => localAuthSubscribers.delete(callback) };
}

export async function requestPasswordReset(
  email: string,
  _redirectTo?: string,
) {
  if (AUTH_PROVIDER === "mock") {
    const { error } = await requireSupabase().auth.resetPasswordForEmail(email);
    if (error) throw error;
    return;
  }
  const response = await fetch(mobileApiUrl("/api/auth/forgot-password"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: email.trim() }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(
      typeof payload.message === "string"
        ? payload.message
        : "Password recovery failed. Please try again.",
    );
  }
}

export async function handleAuthCallback(url: string) {
  if (AUTH_PROVIDER === "local") return;
  await requireSupabase().auth.exchangeCodeForSession(url);
}
