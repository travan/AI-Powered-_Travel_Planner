"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { journeyRequest } from "@/lib/journey-api";
import { createClient } from "@/lib/supabase/client";

export type Notification = {
  id: string;
  subject_id: string;
  trip_id: string | null;
  category: string;
  event: string;
  attempt: number | null;
  created_at: string;
  read_at: string | null;
};

type Page = { items: Notification[]; next: string | null };
type Session = { access_token: string; user: { id: string } };
type Snapshot = {
  userId?: string;
  count: number;
  page?: Page;
  error: boolean;
  loadingMore: boolean;
};

const empty: Snapshot = { count: 0, error: false, loadingMore: false };
const staleAfter = 60_000;

function createNotificationStore() {
  let state = empty;
  let session: Session | null = null;
  let scope = new AbortController();
  let countAt = 0;
  let pageAt = 0;
  let countRequest: Promise<void> | undefined;
  let pageRequest: Promise<void> | undefined;
  let refreshNeeded = false;
  let countVersion = 0;
  let listVersion = 0;
  let eventTimer: ReturnType<typeof setTimeout> | undefined;
  const reads = new Map<string, string>();
  const pageOverrides = new Map<string, string>();
  const listeners = new Set<() => void>();

  const update = (patch: Partial<Snapshot>) => {
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener());
  };

  function refreshCount(force = false) {
    if (!session || document.hidden) return;
    if (!force && Date.now() - countAt < staleAfter) return;
    if (countRequest || reads.size) {
      if (force || reads.size) refreshNeeded = true;
      return;
    }
    const signal = scope.signal;
    const version = countVersion;
    countRequest = journeyRequest<{ count: number }>(
      "notifications/unread",
      session.access_token,
      undefined,
      "GET",
      signal,
    )
      .then(({ count }) => {
        if (signal.aborted || version !== countVersion) return;
        countAt = Date.now();
        update({ count });
      })
      .catch(() => {
        // Keep the last count. The next foreground refresh can recover.
      })
      .finally(() => {
        if (signal.aborted) return;
        countRequest = undefined;
        flushCount();
      });
  }

  function flushCount() {
    if (!refreshNeeded || countRequest || reads.size || document.hidden) return;
    refreshNeeded = false;
    refreshCount(true);
  }

  function loadPage(more = false) {
    if (!session || pageRequest) return;
    const previous = state.page;
    if (more ? !previous?.next : previous && Date.now() - pageAt < staleAfter)
      return;
    const signal = scope.signal;
    const version = listVersion;
    const path = more
      ? `notifications?before=${previous!.next}`
      : "notifications";
    pageOverrides.clear();
    for (const [id, timestamp] of reads) pageOverrides.set(id, timestamp);
    update({ error: false, loadingMore: more });
    pageRequest = journeyRequest<Page>(
      path,
      session.access_token,
      undefined,
      "GET",
      signal,
    )
      .then((result) => {
        if (signal.aborted) return;
        const items = result.items.map((item) => {
          const readAt = pageOverrides.get(item.id);
          return readAt ? { ...item, read_at: readAt } : item;
        });
        if (!more && version === listVersion) pageAt = Date.now();
        const current = more ? (state.page?.items ?? []) : [];
        const seen = new Set(current.map((item) => item.id));
        update({
          page: {
            items: [...current, ...items.filter((item) => !seen.has(item.id))],
            next: result.next,
          },
        });
      })
      .catch(() => {
        if (!signal.aborted) update({ error: true });
      })
      .finally(() => {
        if (signal.aborted) return;
        pageRequest = undefined;
        pageOverrides.clear();
        if (more) update({ loadingMore: false });
      });
  }

  function setReadAt(id: string, readAt: string | null, count: number) {
    const page = state.page;
    update({
      count,
      page: page && {
        ...page,
        items: page.items.map((item) =>
          item.id === id ? { ...item, read_at: readAt } : item,
        ),
      },
    });
  }

  async function markRead(id: string) {
    const item = state.page?.items.find((row) => row.id === id);
    if (!item || item.read_at || !session || reads.has(id)) return;
    const signal = scope.signal;
    const readAt = new Date().toISOString();
    const decrement = state.count > 0 ? 1 : 0;
    reads.set(id, readAt);
    if (pageRequest) pageOverrides.set(id, readAt);
    countVersion++;
    if (countRequest) refreshNeeded = true;
    if (state.error) update({ error: false });
    setReadAt(id, readAt, state.count - decrement);

    try {
      await journeyRequest(
        `notifications/${id}/read`,
        session.access_token,
        undefined,
        "PATCH",
        signal,
      );
    } catch {
      if (signal.aborted) return;
      pageOverrides.delete(id);
      setReadAt(id, null, state.count + decrement);
      update({ error: true });
    } finally {
      if (!signal.aborted) {
        reads.delete(id);
        flushCount();
      }
    }
  }

  function setSession(next: Session | null) {
    if (scope.signal.aborted || session?.user.id !== next?.user.id) {
      scope.abort();
      scope = new AbortController();
      clearTimeout(eventTimer);
      eventTimer = undefined;
      countRequest = undefined;
      pageRequest = undefined;
      refreshNeeded = false;
      countAt = pageAt = 0;
      reads.clear();
      pageOverrides.clear();
      session = next;
      update({ ...empty, page: undefined, userId: next?.user.id });
      refreshCount();
      return;
    }
    session = next;
  }

  function foreground() {
    if (refreshNeeded) flushCount();
    else refreshCount();
  }

  function invalidate() {
    if (!session) return;
    listVersion++;
    pageAt = 0;
    if (eventTimer) return;
    eventTimer = setTimeout(() => {
      eventTimer = undefined;
      if (document.hidden) refreshNeeded = true;
      else refreshCount(true);
    }, 1000);
  }

  return {
    setSession,
    foreground,
    invalidate,
    dispose() {
      scope.abort();
      clearTimeout(eventTimer);
    },
    open() {
      foreground();
      loadPage();
    },
    loadMore: () => loadPage(true),
    markRead,
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

const NotificationContext = createContext<ReturnType<
  typeof createNotificationStore
> | null>(null);
const serverSnapshot = () => empty;

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [store] = useState(createNotificationStore);

  useEffect(() => {
    const client = createClient();
    let active = true;
    let receivedAuthEvent = false;
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      receivedAuthEvent = true;
      if (active) store.setSession(session);
    });
    void client.auth
      .getSession()
      .then(({ data: { session } }) => {
        if (active && !receivedAuthEvent) store.setSession(session);
      })
      .catch(() => {});
    window.addEventListener("focus", store.foreground);
    window.addEventListener("cohorizon:job-status", store.invalidate);
    document.addEventListener("visibilitychange", store.foreground);
    return () => {
      active = false;
      data.subscription.unsubscribe();
      store.dispose();
      window.removeEventListener("focus", store.foreground);
      window.removeEventListener("cohorizon:job-status", store.invalidate);
      document.removeEventListener("visibilitychange", store.foreground);
    };
  }, [store]);

  return (
    <NotificationContext.Provider value={store}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const store = useContext(NotificationContext);
  if (!store) throw new Error("NotificationProvider is required");
  const state = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    serverSnapshot,
  );
  return { store, ...state };
}
