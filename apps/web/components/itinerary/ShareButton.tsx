"use client";
import { useRef, useState } from "react";
import { useAppLanguage } from "../i18n/LanguageProvider";
import { createClient } from "../../lib/supabase/client";
import { shareItinerary, revokeItineraryShare } from "../../lib/api";

export function ShareButton({ itineraryId }: { itineraryId: string }) {
  const { locale } = useAppLanguage();
  const vi = locale === "vi";
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const field = useRef<HTMLInputElement>(null);
  async function changeShare(revoke = false) {
    setBusy(true);
    setMessage(undefined);
    try {
      const {
        data: { session },
      } = await createClient().auth.getSession();
      if (!session?.access_token) throw Error("Sign in required");
      if (revoke) {
        await revokeItineraryShare(itineraryId, session.access_token);
        setUrl(undefined);
        setMessage(vi ? "Đã tắt liên kết chia sẻ." : "Sharing is disabled.");
      } else
        setUrl(
          (await shareItinerary(itineraryId, session.access_token)).share_url,
        );
    } catch {
      setMessage(
        vi
          ? "Chưa cập nhật được liên kết. Vui lòng thử lại."
          : "Could not update sharing. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      field.current?.select();
      let copied = false;
      try {
        copied = Boolean(document.execCommand?.("copy"));
      } catch {
        /* The selected URL remains available for manual copying. */
      }
      if (!copied) {
        setMessage(
          vi ? "Hãy sao chép liên kết đã chọn." : "Copy the selected link.",
        );
        return;
      }
    }
    setMessage(vi ? "Đã sao chép liên kết!" : "Link copied!");
  }
  return (
    <div className="relative">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-on-primary hover:bg-primary/90"
      >
        {vi ? "Chia sẻ" : "Share"}
      </button>
      {open && (
        <section
          aria-label={vi ? "Chia sẻ lịch trình" : "Share itinerary"}
          className="absolute right-0 top-full z-40 mt-2 w-[min(26rem,calc(100vw-2rem))] space-y-3 rounded-2xl border border-outline-variant bg-surface p-4 shadow-lg"
        >
          <p className="text-sm">
            {vi
              ? "Người có liên kết có thể xem lịch trình, không thể chỉnh sửa. Thông tin đặt chỗ và yêu cầu riêng tư không được chia sẻ."
              : "Anyone with the link can view this itinerary without editing it. Booking references and private requests are excluded."}
          </p>
          {url ? (
            <>
              <label className="block text-sm font-semibold">
                {vi ? "Liên kết chia sẻ" : "Share link"}
                <input
                  ref={field}
                  readOnly
                  value={url}
                  className="mt-1 w-full rounded-lg border border-outline-variant bg-surface p-2 text-sm"
                />
              </label>
              <div className="flex flex-wrap gap-3 text-sm">
                <button
                  type="button"
                  onClick={() => void copy()}
                  className="font-bold text-primary"
                >
                  {vi ? "Sao chép liên kết" : "Copy link"}
                </button>
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary underline"
                >
                  {vi ? "Xem liên kết" : "Open link"}
                </a>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void changeShare(true)}
                  className="text-error"
                >
                  {vi ? "Tắt chia sẻ" : "Disable sharing"}
                </button>
              </div>
            </>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => void changeShare()}
              className="rounded-full bg-primary px-4 py-2 text-sm font-bold text-on-primary disabled:opacity-50"
            >
              {busy
                ? vi
                  ? "Đang tạo…"
                  : "Creating…"
                : vi
                  ? "Tạo liên kết"
                  : "Create link"}
            </button>
          )}
          {message && (
            <p role="status" className="text-sm">
              {message}
            </p>
          )}
        </section>
      )}
    </div>
  );
}
