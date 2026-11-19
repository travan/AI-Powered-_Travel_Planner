import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  createMockSupabaseClient,
  getMockSavedTrips,
} from "../../../../../apps/mobile/lib/mock-auth";
const values = new Map<string, string>();
beforeEach(() => {
  values.clear();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => values.set(k, v),
    removeItem: (k: string) => values.delete(k),
  });
});
afterEach(() => vi.unstubAllGlobals());

it("persists registration, validates passwords, updates an account and emits lifecycle events", async () => {
  const { auth } = createMockSupabaseClient();
  const events = vi.fn();
  const subscription = auth.onAuthStateChange(events).data.subscription;
  await Promise.resolve();
  expect(events).toHaveBeenCalledWith("INITIAL_SESSION", null);
  expect(await getMockSavedTrips()).toEqual([]);
  expect((await auth.getUser()).data.user).toBeNull();
  expect((await auth.updateUser({ password: "new" })).error?.message).toBe(
    "No active session",
  );
  const signup = await auth.signUp({
    email: " USER@example.invalid ",
    password: "first",
    options: { data: { full_name: "Traveler" } },
  });
  expect(signup.data.user?.email).toBe("user@example.invalid");
  expect(signup.data.session).toBeNull();
  expect(
    (await auth.signUp({ email: "user@example.invalid", password: "first" }))
      .error?.message,
  ).toContain("registered");
  expect(
    (
      await auth.signInWithPassword({
        email: "user@example.invalid",
        password: "wrong",
      })
    ).error?.message,
  ).toContain("Invalid login");
  const login = await auth.signInWithPassword({
    email: "USER@example.invalid",
    password: "first",
  });
  expect(login.error).toBeNull();
  expect((await auth.getSession()).data.session?.user.id).toBe(
    login.data.user?.id,
  );
  expect((await auth.getUser()).data.user?.email).toBe("user@example.invalid");
  expect(await getMockSavedTrips()).toHaveLength(1);
  const updated = await auth.updateUser({
    password: "second",
    data: { full_name: "Updated" },
  });
  expect(updated.data.user?.user_metadata.full_name).toBe("Updated");
  await auth.updateUser({});
  await auth.resetPasswordForEmail();
  expect(events).toHaveBeenCalledWith("PASSWORD_RECOVERY", expect.any(Object));
  expect((await auth.signInWithOAuth({ provider: "google" })).data.url).toBe(
    "mock-oauth://google",
  );
  await auth.signOut();
  expect((await auth.getSession()).data.session).toBeNull();
  subscription.unsubscribe();
  const count = events.mock.calls.length;
  expect(
    (
      await auth.signInWithPassword({
        email: "user@example.invalid",
        password: "second",
      })
    ).error,
  ).toBeNull();
  expect(events).toHaveBeenCalledTimes(count);
});

it("does not update an OAuth-only user absent from the registered-user store", async () => {
  const { auth } = createMockSupabaseClient();
  await auth.exchangeCodeForSession();
  expect(
    (await auth.updateUser({ data: { full_name: "No account" } })).error
      ?.message,
  ).toBe("User not found");
});

it("recovers from corrupt persisted users and supports memory storage without a browser", async () => {
  values.set("horizon.mobile.mock.users", "broken json");
  let auth = createMockSupabaseClient().auth;
  expect(
    (
      await auth.signUp({
        email: "fresh@example.invalid",
        password: "password",
      })
    ).error,
  ).toBeNull();
  vi.stubGlobal("localStorage", undefined);
  (globalThis as Record<string, unknown>).__horizon_mobile_mock_storage__ =
    new Map();
  auth = createMockSupabaseClient().auth;
  expect(
    (
      await auth.signUp({
        email: "memory@example.invalid",
        password: "password",
      })
    ).error,
  ).toBeNull();
  await auth.signInWithPassword({
    email: "memory@example.invalid",
    password: "password",
  });
  expect((await auth.getSession()).data.session?.user.email).toBe(
    "memory@example.invalid",
  );
  await auth.signOut();
  expect((await auth.getSession()).data.session).toBeNull();
});
