import * as SecureStore from "expo-secure-store";
import type { GenerateRequest } from "@travel/types";

const PENDING_SEARCH_INTENT_KEY = "horizon.mobile.search.intent";

// expo-secure-store has no web implementation — fall back to localStorage on web
async function storageGet(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    if (typeof localStorage !== "undefined") return localStorage.getItem(key);
    return null;
  }
}

async function storageSet(key: string, value: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(key, value);
  } catch {
    if (typeof localStorage !== "undefined") localStorage.setItem(key, value);
  }
}

async function storageDelete(key: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    if (typeof localStorage !== "undefined") localStorage.removeItem(key);
  }
}
const PENDING_SEARCH_INTENT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

type PendingSearchIntent = {
  request: GenerateRequest;
  createdAt: number;
};

type PendingSearchIntentStatus = "ok" | "missing" | "stale" | "invalid";

export type PendingSearchIntentResult = {
  status: PendingSearchIntentStatus;
  request: GenerateRequest | null;
};

export async function savePendingSearchIntent(request: GenerateRequest) {
  const payload: PendingSearchIntent = {
    request,
    createdAt: Date.now(),
  };

  await storageSet(PENDING_SEARCH_INTENT_KEY, JSON.stringify(payload));
}

export async function getPendingSearchIntent(): Promise<GenerateRequest | null> {
  const result = await getPendingSearchIntentResult();
  return result.request;
}

export async function getPendingSearchIntentResult(): Promise<PendingSearchIntentResult> {
  const raw = await storageGet(PENDING_SEARCH_INTENT_KEY);
  if (!raw) {
    return { status: "missing", request: null };
  }

  try {
    const parsed = JSON.parse(raw) as PendingSearchIntent;
    const isStale = Date.now() - parsed.createdAt > PENDING_SEARCH_INTENT_MAX_AGE_MS;

    if (!parsed.request || isStale) {
      await clearPendingSearchIntent();
      return {
        status: isStale ? "stale" : "invalid",
        request: null,
      };
    }

    return { status: "ok", request: parsed.request };
  } catch {
    await clearPendingSearchIntent();
    return { status: "invalid", request: null };
  }
}

export async function clearPendingSearchIntent() {
  await storageDelete(PENDING_SEARCH_INTENT_KEY);
}
