"use client";

import Link from "next/link";
import React, { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { journeyRequest } from "@/lib/journey-api";
import { useAppLanguage } from "../i18n/LanguageProvider";

type Notification = {
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

const categories: Record<string, [string, string]> = {
  generate: ["Trip planning", "Tạo lịch trình"],
  translate: ["Translation", "Dịch lịch trình"],
  revision: ["Plan revision", "Chỉnh sửa lịch trình"],
  revision_applied: ["Trip plan", "Lịch trình chuyến đi"],
  trip: ["Trip", "Chuyến đi"],
  member: ["Membership", "Thành viên"],
  invite: ["Invitation", "Lời mời"],
  activity: ["Trip activity", "Hoạt động chuyến đi"],
  participant: ["Activity participation", "Tham gia hoạt động"],
  checklist: ["Checklist", "Danh sách việc"],
  transport: ["Transport", "Vận chuyển"],
  transport_participant: ["Transport assignment", "Phân công vận chuyển"],
  stay: ["Accommodation", "Chỗ ở"],
  bill: ["Bill", "Hóa đơn"],
  expense: ["Expense", "Chi phí"],
  split: ["Expense split", "Chia tiền"],
  review: ["Review", "Xét duyệt"],
  saved: ["Saved itinerary", "Lịch trình đã lưu"],
  draft: ["Draft", "Bản nháp"],
  account: ["Account", "Tài khoản"],
};
const events: Record<string, [string, string]> = {
  queued: ["Received", "Đã tiếp nhận"],
  processing: ["Processing", "Đang xử lý"],
  retry: ["Waiting to retry", "Đang chờ thử lại"],
  complete: ["Completed", "Hoàn tất"],
  failed: ["Failed", "Thất bại"],
  created: ["Created", "Đã tạo"],
  updated: ["Updated", "Đã cập nhật"],
  approved: ["Approved", "Đã duyệt"],
  rejected: ["Rejected", "Đã từ chối"],
  pending: ["Pending", "Đang chờ"],
  pending_review: ["Awaiting review", "Chờ duyệt"],
  active: ["Joined", "Đã tham gia"],
  invited: ["Invited", "Đã mời"],
  accepted: ["Accepted", "Đã chấp nhận"],
  removed: ["Access removed", "Đã thu hồi quyền"],
  revoked: ["Revoked", "Đã thu hồi"],
  expired: ["Expired", "Đã hết hạn"],
  role_changed: ["Role changed", "Đã đổi vai trò"],
  sharing_changed: ["Sharing changed", "Đã đổi quyền chia sẻ"],
  applied: ["Applied", "Đã áp dụng"],
  password_changed: ["Password changed", "Đã đổi mật khẩu"],
  draft: ["Draft", "Bản nháp"],
  planning: ["Planning", "Đang lên kế hoạch"],
  planned: ["Planned", "Đã lên kế hoạch"],
  booked: ["Booked", "Đã đặt"],
  selected: ["Selected", "Đã chọn"],
  traveling: ["Traveling", "Đang đi"],
  completed: ["Completed", "Hoàn tất"],
  archived: ["Archived", "Đã lưu trữ"],
  cancelled: ["Cancelled", "Đã hủy"],
  visited: ["Visited", "Đã ghé"],
  skipped: ["Skipped", "Đã bỏ qua"],
  joined: ["Joined", "Đã tham gia"],
  declined: ["Declined", "Đã từ chối"],
  todo: ["To do", "Cần làm"],
  in_progress: ["In progress", "Đang thực hiện"],
  done: ["Done", "Đã xong"],
  blocked: ["Blocked", "Đang bị chặn"],
  held: ["Held", "Đã giữ chỗ"],
  purchased: ["Purchased", "Đã mua"],
  refunded: ["Refunded", "Đã hoàn tiền"],
  ocr_pending: ["Waiting for analysis", "Đang chờ phân tích"],
  ocr_processed: ["Analyzed", "Đã phân tích"],
  uploaded: ["Uploaded", "Đã tải lên"],
  parsed: ["Analyzed", "Đã phân tích"],
  needs_review: ["Needs review", "Cần kiểm tra"],
  confirmed: ["Confirmed", "Đã xác nhận"],
  void: ["Voided", "Đã hủy"],
  owed: ["Owed", "Còn nợ"],
  settled: ["Settled", "Đã thanh toán"],
  waived: ["Waived", "Đã miễn"],
  claimed: ["Restored", "Đã khôi phục"],
  discarded: ["Discarded", "Đã bỏ"],
};

function destination(item: Notification) {
  if (item.category === "generate") return `/plan/jobs/${item.subject_id}`;
  if (item.trip_id) {
    const tab: Record<string, string> = {
      revision: "revisions",
      revision_applied: "plan",
      translate: "plan",
      member: "members",
      activity: "schedule",
      participant: "schedule",
      checklist: "schedule",
      transport: "transport",
      transport_participant: "transport",
      stay: "stays",
      bill: "bills",
      expense: "bills",
      split: "bills",
      review: "review",
    };
    return `/trips/${item.trip_id}/workspace${tab[item.category] ? `?tab=${tab[item.category]}` : ""}`;
  }
  if (item.category === "invite" && item.event === "pending")
    return "/trips/join";
  if (item.category === "translate" || item.category === "revision")
    return `/plan/jobs/${item.subject_id}`;
  if (item.category === "account") return "/account/security";
  if (item.category === "draft") return "/plan";
  return "/trips";
}

export function NotificationBell({ className }: { className?: string }) {
  const { locale } = useAppLanguage();
  const language = locale === "vi" ? 1 : 0;
  const label = language ? "Thông báo" : "Notifications";
  const [session, setSession] = useState<{ token: string; userId: string }>();
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState<Page>();
  const [error, setError] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const refresh = useRef<() => void>(() => {});
  const liveSession = useRef(session);
  liveSession.current = session;

  useEffect(() => {
    const client = createClient();
    let active = true;
    const update = (
      value: { access_token: string; user: { id: string } } | null,
    ) => {
      if (!active) return;
      if (liveSession.current?.userId !== value?.user.id) {
        setPage(undefined);
        setCount(0);
        setOpen(false);
      }
      setSession(
        value
          ? { token: value.access_token, userId: value.user.id }
          : undefined,
      );
    };
    void client.auth
      .getSession()
      .then(({ data }) => update(data.session))
      .catch(() => {});
    const { data } = client.auth.onAuthStateChange((_event, value) =>
      update(value),
    );
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session) return;
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let pending = false;
    let refreshQueued = false;
    const load = async () => {
      clearTimeout(timer);
      if (abort.signal.aborted || document.hidden) return;
      if (pending) {
        refreshQueued = true;
        return;
      }
      pending = true;
      try {
        const result = await journeyRequest<{ count: number }>(
          "notifications/unread",
          session.token,
          undefined,
          "GET",
          abort.signal,
        );
        if (!abort.signal.aborted) setCount(result.count);
      } catch {
        // The next foreground refresh can recover from a temporary failure.
      } finally {
        pending = false;
        if (refreshQueued) {
          refreshQueued = false;
          void load();
        } else if (!abort.signal.aborted && !document.hidden)
          timer = setTimeout(load, 55_000 + Math.random() * 10_000);
      }
    };
    refresh.current = () => void load();
    window.addEventListener("focus", refresh.current);
    window.addEventListener("cohorizon:job-status", refresh.current);
    document.addEventListener("visibilitychange", refresh.current);
    const listener = refresh.current;
    void load();
    return () => {
      abort.abort();
      clearTimeout(timer);
      refresh.current = () => {};
      window.removeEventListener("focus", listener);
      window.removeEventListener("cohorizon:job-status", listener);
      document.removeEventListener("visibilitychange", listener);
    };
  }, [session]);

  useEffect(() => {
    if (!open || !session) return;
    const abort = new AbortController();
    setPage(undefined);
    setError(false);
    journeyRequest<Page>(
      "notifications",
      session.token,
      undefined,
      "GET",
      abort.signal,
    )
      .then((result) => {
        if (!abort.signal.aborted) setPage(result);
      })
      .catch(() => {
        if (!abort.signal.aborted) setError(true);
      });
    return () => abort.abort();
  }, [open, session]);

  const more = async () => {
    if (!page?.next || !session || loadingMore) return;
    setLoadingMore(true);
    setError(false);
    try {
      const next = await journeyRequest<Page>(
        `notifications?before=${page.next}`,
        session.token,
      );
      if (liveSession.current?.userId === session.userId)
        setPage({ items: [...page.items, ...next.items], next: next.next });
    } catch {
      setError(true);
    } finally {
      setLoadingMore(false);
    }
  };

  const read = async (item: Notification) => {
    if (item.read_at || !session) return;
    try {
      await journeyRequest(
        `notifications/${item.id}/read`,
        session.token,
        undefined,
        "PATCH",
      );
      if (liveSession.current?.userId !== session.userId) return;
      setPage(
        (previous) =>
          previous && {
            ...previous,
            items: previous.items.map((row) =>
              row.id === item.id
                ? { ...row, read_at: new Date().toISOString() }
                : row,
            ),
          },
      );
      refresh.current();
    } catch {
      setError(true);
    }
  };

  const groups = new Map<string, Notification[]>();
  for (const item of page?.items ?? []) {
    const key = `${item.category}:${item.subject_id}`;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }

  return (
    <div
      className={className}
      onKeyDown={(event) => {
        if (event.key === "Escape") setOpen(false);
      }}
    >
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        className="relative grid size-10 place-items-center rounded-full text-outline hover:bg-surface-container-low"
        onClick={() => setOpen(!open)}
      >
        <span className="material-symbols-outlined text-[22px]">
          notifications
        </span>
        {count > 0 && (
          <span className="absolute right-0 top-0 rounded-full bg-primary px-1.5 text-xs text-white">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>
      {open && (
        <section
          aria-label={label}
          className="absolute right-0 top-full z-50 mt-2 max-h-[70vh] w-[min(22rem,calc(100vw-2rem))] overflow-auto rounded-xl border border-outline-variant bg-surface p-3 shadow-lg"
        >
          <h2 className="mb-2 font-bold">{label}</h2>
          {error && (
            <p role="alert">
              {language
                ? "Không tải được thông báo. Vui lòng thử lại."
                : "Could not load notifications. Please try again."}
            </p>
          )}
          {!session && (
            <Link href="/login">
              {language
                ? "Đăng nhập để xem thông báo"
                : "Sign in to see notifications"}
            </Link>
          )}
          {session && !page && !error && (
            <p role="status">{language ? "Đang tải…" : "Loading…"}</p>
          )}
          {page?.items.length === 0 && (
            <p>{language ? "Chưa có thông báo." : "No notifications yet."}</p>
          )}
          {[...groups].map(([key, items]) => {
            const latest = items[0]!;
            return (
              <details
                key={key}
                className="border-t border-outline-variant/50 py-2"
              >
                <summary
                  className={
                    items.some((item) => !item.read_at)
                      ? "cursor-pointer font-semibold"
                      : "cursor-pointer"
                  }
                >
                  {categories[latest.category]?.[language] ?? label} ·{" "}
                  {events[latest.event]?.[language] ??
                    (language ? "Đã cập nhật" : "Updated")}
                </summary>
                <ul className="mt-2 space-y-2 pl-3 text-sm">
                  {items.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-start justify-between gap-2"
                    >
                      <Link
                        href={destination(item)}
                        prefetch={false}
                        onClick={() => void read(item)}
                        className="text-primary hover:underline"
                      >
                        {events[item.event]?.[language] ??
                          (language ? "Đã cập nhật" : "Updated")}
                        <time
                          className="block text-xs text-on-surface-variant"
                          dateTime={item.created_at}
                        >
                          {new Date(item.created_at).toLocaleString(locale)}
                        </time>
                      </Link>
                      {!item.read_at && (
                        <button
                          type="button"
                          onClick={() => void read(item)}
                          className="text-xs text-primary"
                        >
                          {language ? "Đánh dấu đã đọc" : "Mark as read"}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </details>
            );
          })}
          {page?.next && (
            <button
              type="button"
              className="mt-2 text-sm text-primary"
              disabled={loadingMore}
              onClick={() => void more()}
            >
              {language ? "Xem thêm" : "Load more"}
            </button>
          )}
        </section>
      )}
    </div>
  );
}
