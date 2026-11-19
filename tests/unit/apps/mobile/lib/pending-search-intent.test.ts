import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  clearPendingSearchIntent,
  getPendingSearchIntent,
  getPendingSearchIntentResult,
  savePendingSearchIntent,
} from "../../../../../apps/mobile/lib/pending-search-intent";
const store = vi.hoisted(() => ({
  values: new Map<string, string>(),
  broken: false,
}));
vi.mock("expo-secure-store", () => ({
  getItemAsync: async (key: string) => {
    if (store.broken) throw new Error("unavailable");
    return store.values.get(key) ?? null;
  },
  setItemAsync: async (key: string, value: string) => {
    if (store.broken) throw new Error("unavailable");
    store.values.set(key, value);
  },
  deleteItemAsync: async (key: string) => {
    if (store.broken) throw new Error("unavailable");
    store.values.delete(key);
  },
}));
beforeEach(() => {
  store.values.clear();
  store.broken = false;
});
afterEach(() => vi.unstubAllGlobals());
it.each([false, true])(
  "retains drafts with native storage or browser fallback (fallback=%s)",
  async (broken) => {
    store.broken = broken;
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.values.get(k) ?? null,
      setItem: (k: string, v: string) => store.values.set(k, v),
      removeItem: (k: string) => store.values.delete(k),
    });
    const request = { cities: ["moscow"], num_days: 5 } as never;
    expect(await getPendingSearchIntentResult()).toEqual({
      status: "missing",
      request: null,
    });
    await savePendingSearchIntent(request);
    expect(await getPendingSearchIntent()).toEqual(request);
    const key = "horizon.mobile.search.intent";
    store.values.set(
      key,
      JSON.stringify({ request, createdAt: Date.now() - 25 * 3600000 }),
    );
    expect((await getPendingSearchIntentResult()).status).toBe("stale");
    expect(store.values.size).toBe(0);
    store.values.set(key, JSON.stringify({ createdAt: Date.now() }));
    expect((await getPendingSearchIntentResult()).status).toBe("invalid");
    store.values.set(key, "broken json");
    expect((await getPendingSearchIntentResult()).status).toBe("invalid");
    await clearPendingSearchIntent();
    expect(store.values.size).toBe(0);
  },
);
it("tolerates unavailable native and browser storage without crashing navigation", async () => {
  store.broken = true;
  vi.stubGlobal("localStorage", undefined);
  await savePendingSearchIntent({ cities: ["hanoi"] } as never);
  expect(await getPendingSearchIntent()).toBeNull();
  await clearPendingSearchIntent();
});
