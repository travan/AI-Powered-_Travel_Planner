"use client";

import Link from "next/link";
import React, { useEffect, useRef, useState } from "react";
import { useNotifications, type Notification } from "./NotificationProvider";
import { useAppLanguage } from "../i18n/LanguageProvider";

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
  const { store, userId, count, page, error, loadingMore, markingAll } =
    useNotifications();
  const [openFor, setOpenFor] = useState<string | null>(null);
  const open = openFor === (userId ?? "guest");
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const dismissOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target))
        setOpenFor(null);
    };
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpenFor(null);
      trigger.current?.focus();
    };
    document.addEventListener("pointerdown", dismissOutside);
    document.addEventListener("keydown", dismissOnEscape);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside);
      document.removeEventListener("keydown", dismissOnEscape);
    };
  }, [open]);

  useEffect(() => setOpenFor(null), [userId]);

  const groups = new Map<string, Notification[]>();
  for (const item of page?.items ?? []) {
    const key = `${item.category}:${item.category === "checklist" ? (item.trip_id ?? item.subject_id) : item.subject_id}`;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }

  return (
    <div ref={root} className={className}>
      <button
        ref={trigger}
        type="button"
        aria-label={label}
        aria-expanded={open}
        className="relative grid size-10 place-items-center rounded-full text-outline hover:bg-surface-container-low"
        onClick={() => {
          setOpenFor(open ? null : (userId ?? "guest"));
          if (!open) store.open();
        }}
      >
        <span
          aria-hidden="true"
          className="material-symbols-outlined block size-6 overflow-hidden text-[22px] leading-6"
        >
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
          <div className="mb-2 flex items-center justify-between gap-3">
            <h2 className="font-bold">{label}</h2>
            {userId && (
              <button
                type="button"
                className="text-sm font-semibold text-primary disabled:opacity-50"
                disabled={count === 0 || markingAll}
                onClick={() => void store.markAllRead()}
              >
                {language ? "Đọc hết" : "Mark all as read"}
              </button>
            )}
          </div>
          {error && (
            <p role="alert">
              {language
                ? "Không tải được thông báo. Vui lòng thử lại."
                : "Could not load notifications. Please try again."}
            </p>
          )}
          {!userId && (
            <Link href="/login">
              {language
                ? "Đăng nhập để xem thông báo"
                : "Sign in to see notifications"}
            </Link>
          )}
          {userId && !page && !error && (
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
                  {(latest.category === "checklist"
                    ? latest.trip_title
                    : latest.subject_label) && (
                    <>
                      {latest.category === "checklist"
                        ? latest.trip_title
                        : latest.subject_label}{" "}
                      ·{" "}
                    </>
                  )}
                  {latest.category === "checklist"
                    ? language
                      ? `${new Set(items.map((item) => item.subject_id)).size} việc`
                      : `${new Set(items.map((item) => item.subject_id)).size} tasks`
                    : (events[latest.event]?.[language] ??
                      (language ? "Đã cập nhật" : "Updated"))}
                </summary>
                <ul className="mt-2 space-y-2 pl-3 text-sm">
                  {items.map((item) => (
                    <li key={item.id} className="min-w-0">
                      <Link
                        href={destination(item)}
                        prefetch={false}
                        onPointerEnter={(event) => {
                          if (event.pointerType === "mouse")
                            void store.markRead(item.id);
                        }}
                        onClick={() => void store.markRead(item.id)}
                        className="block w-full break-words text-primary hover:underline focus-visible:underline"
                      >
                        {item.category === "checklist" &&
                          item.subject_label && (
                            <span className="block font-medium">
                              {item.subject_label}
                            </span>
                          )}
                        {events[item.event]?.[language] ??
                          (language ? "Đã cập nhật" : "Updated")}
                        <time
                          className="block text-xs text-on-surface-variant"
                          dateTime={item.created_at}
                        >
                          {new Date(item.created_at).toLocaleString(locale)}
                        </time>
                      </Link>
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
              onClick={store.loadMore}
            >
              {language ? "Xem thêm" : "Load more"}
            </button>
          )}
        </section>
      )}
    </div>
  );
}
