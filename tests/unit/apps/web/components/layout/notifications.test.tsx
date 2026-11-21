// @vitest-environment jsdom
import React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  authChanged: undefined as
    | undefined
    | ((event: string, session: unknown) => void),
}));
vi.mock("@/lib/journey-api", () => ({ journeyRequest: mocks.request }));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getSession: async () => ({
        data: { session: { access_token: "token", user: { id: "owner" } } },
      }),
      onAuthStateChange: (callback: typeof mocks.authChanged) => {
        mocks.authChanged = callback;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
    },
  }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, prefetch: _prefetch, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
import {
  NotificationProvider,
  useNotifications,
  type Notification,
} from "../../../../../../apps/web/components/layout/NotificationProvider";
import { NotificationBell } from "../../../../../../apps/web/components/layout/NotificationBell";
import { LanguageProvider } from "../../../../../../apps/web/components/i18n/LanguageProvider";
let snapshot: ReturnType<typeof useNotifications>;
function Probe() {
  snapshot = useNotifications();
  return <NotificationBell />;
}
const timestamp = "2026-11-20T10:00:00.000Z";
function item(id: string, extra = {}): Notification {
  return {
    id,
    subject_id: id,
    trip_id: "trip",
    category: "checklist",
    event: "todo",
    attempt: null,
    created_at: "2026-11-20T09:00:00.000Z",
    read_at: null,
    trip_title: "Moscow trip",
    subject_label: `Task ${id}`,
    ...extra,
  };
}
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
beforeEach(() => {
  mocks.request.mockReset();
  mocks.request.mockImplementation(async (path: string) =>
    path === "notifications/unread"
      ? { count: 3 }
      : { items: [item("1"), item("2"), item("3")], next: null },
  );
});
afterEach(cleanup);
async function open() {
  render(
    <LanguageProvider initialLocale="vi">
      <NotificationProvider>
        <Probe />
      </NotificationProvider>
    </LanguageProvider>,
  );
  await waitFor(() => expect(snapshot.userId).toBe("owner"));
  fireEvent.click(screen.getByRole("button", { name: "Thông báo" }));
  await waitFor(() => expect(snapshot.page?.items).toHaveLength(3));
}
it("groups checklist tasks by trip and names each task, then marks all read", async () => {
  await open();
  expect(
    screen.getAllByText(/Danh sách việc · Moscow trip · 3 việc/),
  ).toHaveLength(1);
  expect(screen.getByText("Task 2")).toBeTruthy();
  mocks.request.mockImplementation(async (path: string) =>
    path === "notifications/read-all" ? { read_at: timestamp } : { count: 0 },
  );
  fireEvent.click(screen.getByRole("button", { name: "Đọc hết" }));
  await waitFor(() => expect(snapshot.count).toBe(0));
  expect(snapshot.page?.items.every((row) => row.read_at === timestamp)).toBe(
    true,
  );
  expect(mocks.request).toHaveBeenCalledWith(
    "notifications/read-all",
    "token",
    undefined,
    "PATCH",
    expect.any(AbortSignal),
  );
});
it("keeps items unread if bulk marking fails", async () => {
  await open();
  mocks.request.mockImplementation(async (path: string) => {
    if (path === "notifications/read-all") throw Error("offline");
    return { count: 3 };
  });
  await act(async () => {
    await snapshot.store.markAllRead();
  });
  expect(snapshot.error).toBe(true);
  expect(snapshot.count).toBe(3);
  expect(snapshot.page?.items.every((row) => !row.read_at)).toBe(true);
});
it("does not roll back a successful read-all when an earlier individual read fails", async () => {
  await open();
  const read = deferred<unknown>();
  mocks.request.mockImplementation((path: string) =>
    path === "notifications/1/read"
      ? read.promise
      : Promise.resolve(
          path === "notifications/read-all"
            ? { read_at: timestamp }
            : { count: 0 },
        ),
  );
  let pending!: Promise<void>;
  act(() => {
    pending = snapshot.store.markRead("1");
  });
  await act(async () => {
    await snapshot.store.markAllRead();
    read.reject(Error("old failure"));
    await pending;
  });
  expect(snapshot.count).toBe(0);
  expect(snapshot.error).toBe(false);
  expect(snapshot.page?.items.every((row) => row.read_at)).toBe(true);
});
it("preserves the bulk result against a stale page while retaining newer unread arrivals", async () => {
  await open();
  const page = deferred<unknown>();
  // Invalidate the cached list and start a load that overlaps the bulk write.
  act(() => snapshot.store.invalidate());
  mocks.request.mockImplementation((path: string) =>
    path === "notifications"
      ? page.promise
      : Promise.resolve(
          path === "notifications/read-all"
            ? { read_at: timestamp }
            : { count: 1 },
        ),
  );
  act(() => snapshot.store.open());
  await act(async () => {
    await snapshot.store.markAllRead();
    page.resolve({
      items: [
        item("old"),
        item("new", { created_at: "2026-11-20T10:01:00.000Z" }),
      ],
      next: null,
    });
    await page.promise;
  });
  expect(snapshot.page?.items.find((row) => row.id === "old")?.read_at).toBe(
    timestamp,
  );
  expect(
    snapshot.page?.items.find((row) => row.id === "new")?.read_at,
  ).toBeNull();
  expect(snapshot.count).toBe(1);
});
it("discards a pending bulk write when the user signs out", async () => {
  await open();
  const bulk = deferred<{ read_at: string }>();
  mocks.request.mockReturnValue(bulk.promise);
  let pending!: Promise<void>;
  act(() => {
    pending = snapshot.store.markAllRead();
  });
  await act(async () => {
    mocks.authChanged?.("SIGNED_OUT", null);
    bulk.resolve({ read_at: timestamp });
    await pending;
  });
  expect(snapshot.userId).toBeUndefined();
  expect(snapshot.count).toBe(0);
  expect(snapshot.page).toBeUndefined();
  expect(snapshot.markingAll).toBe(false);
});
