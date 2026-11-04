"use client";

import {
  UiText,
  useUiText,
  useIssueText,
  useApiErrorText,
} from "../i18n/UiText";

import { useAppLanguage } from "../i18n/LanguageProvider";
import React, { useEffect, useState } from "react";
import {
  getAccommodations,
  getJourneyJob,
  getJourneyPlan,
  getPlanRevisions,
  journeyRequest,
} from "../../lib/journey-api";
import { mapUrl } from "@travel/types";
import { BookingLinks } from "../itinerary/BookingLinks";
import type {
  AccommodationBooking,
  Hotel,
  Itinerary,
  PlanRevision,
  Restaurant,
} from "@travel/types";

type Props = {
  tripId: string;
  token: string;
  section: "stays" | "dining" | "revisions";
  canEdit: boolean;
  canApply: boolean;
  onChanged: (plan: Itinerary) => void;
};
const inputClass =
  "mt-1 w-full rounded-lg border border-outline-variant/30 bg-surface-container-low p-3 text-sm";
const formatAmount = (
  n: number | null | undefined,
  currency = "VND",
  locale = "en",
) => (n == null ? "Chưa có giá" : `${n.toLocaleString(locale)} ${currency}`);
const safe = (url?: string | null) =>
  url && /^https?:\/\//i.test(url) ? url : undefined;
export function JourneyWorkspacePanel({
  tripId,
  token,
  section,
  canEdit,
  canApply,
  onChanged,
}: Props) {
  const issueText = useIssueText();
  const apiErrorText = useApiErrorText();
  const { locale } = useAppLanguage();
  const money = (value: number | null | undefined, currency = "VND") =>
    value == null ? t("Chưa có giá") : formatAmount(value, currency, locale);
  const t = useUiText();

  const [plan, setPlan] = useState<Itinerary | null>(null),
    [stays, setStays] = useState<AccommodationBooking[]>([]),
    [revisions, setRevisions] = useState<PlanRevision[]>([]);
  const cityLabel = (slug?: string, fallback?: string) =>
    (slug
      ? (plan?.city_catalog?.[slug]?.name[locale] ??
        plan?.city_catalog?.[slug]?.name.en)
      : undefined) ?? fallback;
  const [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true);
  const [checklist, setChecklist] = useState<
    { id: string; title: string; status: string }[]
  >([]);
  const [jobId, setJobId] = useState<string | null>(null),
    [stage, setStage] = useState("");
  const [editing, setEditing] = useState<Partial<AccommodationBooking> | null>(
    null,
  );
  const [dismissedPreviews, setDismissedPreviews] = useState<string[]>([]);
  const [catalogDining, setCatalogDining] = useState<Restaurant[]>([]);
  const [maxPrice, setMaxPrice] = useState("");
  const [tags, setTags] = useState("");
  const [filter, setFilter] = useState("");
  const [diningKind, setDiningKind] = useState("all");
  const [instruction, setInstruction] = useState("");
  const [scope, setScope] = useState("day"),
    [target, setTarget] = useState("");
  const [dayNumber, setDayNumber] = useState(1),
    [mealTime, setMealTime] = useState("12:00");
  const [skipped, setSkipped] = useState<string[]>([]);
  async function load() {
    const [next, bookings, history] = await Promise.all([
      getJourneyPlan(tripId, token),
      getAccommodations(tripId, token),
      getPlanRevisions(tripId, token),
    ]);
    setPlan(next);
    setStays(bookings);
    setRevisions(history);
    setChecklist(
      await journeyRequest<{ id: string; title: string; status: string }[]>(
        `trips/${tripId}/planning-checklist`,
        token,
      ),
    );
    return next;
  }
  useEffect(() => {
    let active = true;
    setLoading(true);
    void load()
      .catch((e) => {
        if (active) setError(apiErrorText(e, "Không tải được dữ liệu."));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [tripId, token]);
  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const job = await getJourneyJob(jobId, token);
        if (cancelled) return;
        setStage(job.stage);
        if (job.status === "complete") {
          setJobId(null);
          await load();
          setMessage(
            t(
              "Phương án đã sẵn sàng. Xem thay đổi bên dưới trước khi áp dụng.",
            ),
          );
          return;
        }
        if (job.status === "failed") {
          setJobId(null);
          setError(
            job.error_code
              ? issueText({
                  code: job.error_code,
                  params: job.error_params,
                  message: job.error ?? undefined,
                })
              : (job.error ?? "Không tạo được phương án."),
          );
          return;
        }
      } catch (e) {
        if (!cancelled) setError(apiErrorText(e, "Mất kết nối; đang thử lại."));
      }
      if (!cancelled) timer = setTimeout(poll, 3000);
    };
    void poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [jobId, token]);
  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await work();
    } catch (e) {
      setError(apiErrorText(e, "Không thể lưu thay đổi."));
    } finally {
      setBusy(false);
    }
  };
  const changed = async () => {
    const next = await load();
    onChanged(next);
  };
  const hotelForm = (hotel: Hotel) => {
    const start =
      plan?.days.find((d) => d.city === hotel.city)?.date?.slice(0, 10) ||
      plan?.days[0]?.date?.slice(0, 10) ||
      "";
    setEditing({
      name: hotel.name,
      city: hotel.city ?? "",
      rooms: plan?.planning?.stay_preferences.rooms ?? 1,
      guests: plan?.num_travelers ?? 2,
      check_in_date: start,
      check_out_date: "",
      price_per_night: hotel.nightly_estimate ?? null,
      booking_status: "selected",
      currency: plan?.currency ?? "VND",
      locked: false,
    });
  };
  const nights =
    editing?.check_in_date && editing.check_out_date
      ? Math.max(
          0,
          Math.round(
            (Date.parse(editing.check_out_date) -
              Date.parse(editing.check_in_date)) /
              86400000,
          ),
        )
      : 0;
  const total =
    editing?.price_per_night == null
      ? null
      : editing.price_per_night * (editing.rooms ?? 1) * nights;
  const saveStay = () =>
    run(async () => {
      if (!editing?.name?.trim()) throw new Error("Nhập tên chỗ ở.");
      const id = editing.id,
        version = editing.version;
      const fields = {
        name: editing.name,
        city: editing.city,
        rooms: editing.rooms,
        guests: editing.guests,
        check_in_date: editing.check_in_date,
        check_out_date: editing.check_out_date,
        price_per_night: editing.price_per_night,
        currency: editing.currency,
        booking_status: editing.booking_status,
        booking_provider: editing.booking_provider,
        booking_reference: editing.booking_reference,
        room_type: editing.room_type,
        cancellation_policy: editing.cancellation_policy,
        booking_url: editing.booking_url,
        locked: editing.locked,
      };
      const body = {
        ...fields,
        check_in_date: fields.check_in_date || undefined,
        check_out_date: fields.check_out_date || undefined,
        price_per_night: fields.price_per_night ?? undefined,
        room_type: fields.room_type ?? undefined,
        booking_provider: fields.booking_provider ?? undefined,
        booking_reference: fields.booking_reference ?? undefined,
        cancellation_policy: fields.cancellation_policy ?? undefined,
        booking_url: fields.booking_url ?? undefined,
        ...(id ? { version } : {}),
      };
      await journeyRequest(
        `trips/${tripId}/accommodations${id ? `/${id}` : ""}`,
        token,
        body,
        id ? "PATCH" : "POST",
      );
      setEditing(null);
      await changed();
      setMessage(
        t(
          "Đã lưu chỗ ở. Trạng thái do bạn xác nhận, không phải xác nhận từ nhà cung cấp.",
        ),
      );
    });
  const startRevision = (revisionScope: string, targetId: string, extra = "") =>
    run(async () => {
      if (!plan) return;
      const queued = await journeyRequest<{ job_id: string }>(
        `trips/${tripId}/itinerary-revisions`,
        token,
        {
          scope: revisionScope,
          target_id: targetId,
          expected_version: plan.version,
          instruction: extra || instruction,
        },
      );
      setJobId(queued.job_id);
    });
  const addDining = (r: Restaurant) =>
    run(async () => {
      const day = plan?.days.find((d) => d.day_number === dayNumber);
      if (!day) throw new Error("Chọn ngày hợp lệ.");
      if (day.activities.some((a) => a.name === r.name && a.time === mealTime))
        throw new Error("Quán đã có trong khung giờ này. Hãy sửa mục hiện có.");
      await journeyRequest(`trips/${tripId}/activities`, token, {
        title: r.name,
        category: r.kind ?? (/caf[eé]/i.test(r.cuisine) ? "cafe" : "meal"),
        location_name: r.city ?? day.city,
        address: r.address || undefined,
        currency: plan?.currency ?? "VND",
        ...(day.date
          ? { scheduled_at: `${day.date.slice(0, 10)}T${mealTime}:00+07:00` }
          : {}),
      });
      await changed();
      setMessage(`Đã thêm ${r.name} vào lịch ngày ${dayNumber}.`);
    });
  const searchCatalog = () =>
    run(async () => {
      const city =
        plan?.planning?.journey.destinations[dayNumber - 1] ??
        plan?.planning?.journey.destinations[0];
      const query = new URLSearchParams({
        category: diningKind === "cafe" ? "cafe" : "restaurant",
        limit: "20",
        currency: plan?.currency ?? "VND",
      });
      if (city) query.set("citySlug", city);
      if (filter) query.set("q", filter);
      if (maxPrice) query.set("maxPrice", maxPrice);
      if (tags) query.set("tags", tags);
      const places = await journeyRequest<
        {
          id: string;
          name: string;
          category: string;
          address: string | null;
          estimatedPrice: number | null;
          currency: string;
          source: string;
          lastVerifiedAt: string | null;
          matchReasons: string[];
        }[]
      >(`recommendations/places?${query}`, token);
      setCatalogDining(
        places.map((place) => ({
          id: place.id,
          name: place.name,
          cuisine: place.category === "cafe" ? "Café" : "Quán ăn",
          kind: place.category === "cafe" ? "cafe" : "meal",
          estimated_per_person: place.estimatedPrice ?? undefined,
          price_per_person: money(place.estimatedPrice, place.currency),
          price_range: "",
          address: place.address ?? "",
          maps_link: "",
          tiktok_search_link: "",
          ig_search_link: "",
          note: place.matchReasons.join(". "),
          evidence: {
            source: ["ai_generated", "user_submission"].includes(place.source)
              ? "ai_suggestion"
              : "catalog",
            source_id: place.id,
            verified_at: place.lastVerifiedAt ?? undefined,
          },
        })),
      );
      setMessage(
        places.length
          ? "Đã bổ sung lựa chọn từ catalog."
          : "Chưa có quán đủ dữ liệu theo bộ lọc. Thử giảm bộ lọc hoặc dùng gợi ý khu vực.",
      );
    });
  const updateEdit = (key: string, value: unknown) =>
    setEditing((e) => ({ ...e, [key]: value }));
  const field = (
    key: keyof AccommodationBooking,
    label: string,
    type = "text",
  ) => (
    <label className="block text-sm font-semibold">
      <UiText text={label} />
      <input
        className={inputClass}
        type={type}
        value={String(editing?.[key] ?? "")}
        onChange={(e) =>
          updateEdit(
            key,
            type === "number"
              ? e.target.value === ""
                ? null
                : Number(e.target.value)
              : e.target.value,
          )
        }
      />
    </label>
  );
  if (loading)
    return (
      <p role="status">
        {" "}
        <UiText id="tc33f24068b68" fallback="Đang tải hành trình…" />{" "}
      </p>
    );
  return (
    <section className="space-y-5">
      <h2 className="text-2xl font-bold">
        {section === "stays" ? (
          <UiText id="t0d3967bec178" fallback="Lưu trú" />
        ) : section === "dining" ? (
          <UiText id="t160d2f5f674f" fallback="Ăn uống & café địa phương" />
        ) : (
          <UiText id="t2bcd40673450" fallback="Chỉnh hành trình & phiên bản" />
        )}
      </h2>
      {error && (
        <p role="alert" className="rounded-xl bg-error/10 p-4 text-error">
          <UiText text={error} />
          <button
            className="ml-3 underline"
            onClick={() =>
              void run(async () => {
                await load();
              })
            }
          >
            {" "}
            <UiText id="t163712410cdb" fallback="Tải lại" />{" "}
          </button>
        </p>
      )}
      {message && (
        <p role="status" className="rounded-xl bg-primary/10 p-4">
          <UiText text={message} />
        </p>
      )}
      {jobId && (
        <p role="status">
          {" "}
          <UiText id="t8dcff9c22991" fallback="Đang tạo phương án (" />{" "}
          {stage || "chờ xử lý"}{" "}
          <UiText
            id="t124ea33a96e2"
            fallback="). Bạn có thể quay lại mục này sau."
          />{" "}
        </p>
      )}
      {section === "stays" && (
        <>
          <p className="text-sm text-on-surface-variant">
            {" "}
            <UiText
              id="t9661fe8550b8"
              fallback="Chọn chỗ ở phù hợp rồi đặt ở nhà cung cấp. Mở liên kết không đánh dấu đã đặt."
            />{" "}
          </p>
          {canEdit && (
            <button
              className="rounded-full bg-primary px-4 py-2 text-on-primary"
              onClick={() => {
                setEditing({
                  name: "",
                  city: "",
                  rooms: 1,
                  guests: plan?.num_travelers ?? 2,
                  currency: plan?.currency ?? "VND",
                  booking_status: "planned",
                  locked: false,
                });
              }}
            >
              {" "}
              <UiText
                id="t09e4fdc5ef5e"
                fallback="Nhập phòng đã chọn/đặt"
              />{" "}
            </button>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            {(plan?.hotels ?? [])
              .filter(
                (h, i, all) =>
                  all.filter((x) => x.city === h.city).indexOf(h) < 3,
              )
              .map((h, i) => (
                <article
                  key={h.id ?? i}
                  className="space-y-3 rounded-xl border border-outline-variant/30 p-4"
                >
                  <h3 className="font-bold">{h.name}</h3>
                  <p className="text-sm">
                    {cityLabel(h.city_slug, h.city)} ·{" "}
                    {h.price_per_night || h.price_range}
                  </p>
                  <p className="text-sm leading-6">{h.note}</p>
                  <BookingLinks
                    links={h.booking_links}
                    context={`${h.name} · ${cityLabel(h.city_slug, h.city) ?? ""} · ${plan?.days[0]?.date ?? ""} — ${plan?.days.at(-1)?.date ?? ""} · ${plan?.num_travelers ?? ""}`}
                  />
                  {canEdit && (
                    <button
                      disabled={busy}
                      className="mr-4 font-semibold text-primary"
                      onClick={() => hotelForm(h)}
                    >
                      {" "}
                      <UiText id="tbae8295e3449" fallback="Chọn chỗ này" />{" "}
                    </button>
                  )}
                  {safe(h.booking_url) && (
                    <a
                      className="text-sm text-primary underline"
                      href={safe(h.booking_url)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {" "}
                      <UiText id="td4e4cc1221eb" fallback="Xem nơi đặt" />{" "}
                    </a>
                  )}
                </article>
              ))}
          </div>
          {editing && (
            <div className="space-y-4 rounded-2xl border border-primary/30 bg-surface-container-low p-5">
              <h3 className="font-bold">
                {editing.id ? (
                  <UiText id="t04c60a33bf42" fallback="Cập nhật chỗ ở" />
                ) : (
                  <UiText
                    id="t2b1207ca8783"
                    fallback="Xem lựa chọn trước khi lưu"
                  />
                )}
              </h3>
              <fieldset
                disabled={busy || !canEdit}
                className="grid gap-4 sm:grid-cols-2"
              >
                {field("name", "Tên chỗ ở")}
                {field("city", "Thành phố/khu vực")}
                {field("check_in_date", "Nhận phòng", "date")}
                {field("check_out_date", "Trả phòng", "date")}
                {field("rooms", "Số phòng", "number")}
                {field("guests", "Số khách", "number")}
                {field("price_per_night", "Giá/phòng/đêm", "number")}
                {field("room_type", "Loại phòng/giường")}
                {field("booking_provider", "Nhà cung cấp")}
                {field("booking_reference", "Mã đặt phòng")}
                {field("cancellation_policy", "Chính sách hủy")}
                {field("booking_url", "Liên kết đặt phòng")}
                <label className="text-sm font-semibold">
                  {" "}
                  <UiText id="te03c1401e314" fallback="Trạng thái" />{" "}
                  <select
                    className={inputClass}
                    value={editing.booking_status}
                    onChange={(e) =>
                      updateEdit("booking_status", e.target.value)
                    }
                  >
                    <option value="planned">
                      {" "}
                      <UiText id="t2e608f3c8817" fallback="Dự kiến" />{" "}
                    </option>
                    <option value="selected">
                      {" "}
                      <UiText id="t40b56a1698a3" fallback="Đã chọn" />{" "}
                    </option>
                    <option value="booked">
                      {" "}
                      <UiText
                        id="t82eebba9026f"
                        fallback="Tôi xác nhận đã đặt"
                      />{" "}
                    </option>
                    <option value="cancelled">
                      {" "}
                      <UiText id="tfe90dc3bca71" fallback="Đã hủy" />{" "}
                    </option>
                    <option value="completed">
                      {" "}
                      <UiText
                        id="tae639c37b294"
                        fallback="Đã hoàn thành"
                      />{" "}
                    </option>
                  </select>
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={editing.locked ?? false}
                    onChange={(e) => updateEdit("locked", e.target.checked)}
                  />{" "}
                  <UiText
                    id="tdac85e227536"
                    fallback="Khóa chỗ ở khi tạo lại lịch"
                  />{" "}
                </label>
              </fieldset>
              <p className="font-semibold">
                {editing.rooms ?? 1}{" "}
                <UiText id="t398a3a3b8ff6" fallback="phòng ×" /> {nights}{" "}
                <UiText id="t220964500234" fallback="đêm ×" />{" "}
                {money(editing.price_per_night, editing.currency)} ={" "}
                {money(total, editing.currency)}
              </p>
              <p className="text-sm">
                {" "}
                <UiText id="t69d64800e7cb" fallback="Ảnh hưởng chi phí:" />{" "}
                {money(total, editing.currency)}{" "}
                <UiText
                  id="t40ff0b0bc010"
                  fallback="cho lựa chọn này. Thời gian di chuyển từ chỗ ở mới cần kiểm tra trên bản đồ; chưa có dữ liệu đường thực tế."
                />{" "}
              </p>
              <p className="text-xs">
                {" "}
                <UiText
                  id="t1fe7342cbd89"
                  fallback="Trước khi đặt: xác nhận số khách/giường, thuế/phí, chính sách hủy, giờ nhận/trả phòng và thanh toán."
                />{" "}
              </p>
              <div className="flex gap-4">
                <button
                  disabled={busy}
                  onClick={saveStay}
                  className="rounded-full bg-primary px-5 py-2 text-on-primary"
                >
                  {" "}
                  <UiText id="t8868c71475ed" fallback="Áp dụng lựa chọn" />{" "}
                </button>
                <button
                  onClick={() => setEditing(null)}
                  className="text-primary"
                >
                  {" "}
                  <UiText id="td2b73ab2ada1" fallback="Đóng" />{" "}
                </button>
              </div>
            </div>
          )}
          <h3 className="font-bold">
            {" "}
            <UiText id="t1b2160be6703" fallback="Chỗ ở đã lưu" />{" "}
          </h3>
          {!stays.length && (
            <p className="text-sm">
              {" "}
              <UiText
                id="t5f0befe590b6"
                fallback="Chưa chọn phòng. Gợi ý bên trên chưa được đặt."
              />{" "}
            </p>
          )}
          {stays.map((s) => (
            <article
              className="flex flex-wrap justify-between gap-3 rounded-xl border border-outline-variant/30 p-4"
              key={s.id}
            >
              <div>
                <h4 className="font-bold">{s.name}</h4>
                <p className="text-sm">
                  {s.check_in_date} → {s.check_out_date} · {s.rooms}{" "}
                  <UiText id="t762c646d1e2a" fallback="phòng ·" /> {s.nights}{" "}
                  <UiText id="te681e5aefa45" fallback="đêm" />{" "}
                </p>
                <p className="text-sm">
                  {money(s.total_price, s.currency)} ·{" "}
                  <UiText text={s.booking_status} />
                  {s.locked ? (
                    <UiText id="t046746c97abe" fallback=" · Đã khóa" />
                  ) : (
                    ""
                  )}
                </p>
              </div>
              {canEdit && (
                <button
                  className="font-semibold text-primary"
                  onClick={() => {
                    setEditing(s);
                  }}
                >
                  {" "}
                  <UiText
                    id="ta12ea10edfaf"
                    fallback="Sửa / xác nhận đặt"
                  />{" "}
                </button>
              )}
            </article>
          ))}
        </>
      )}
      {section === "dining" && (
        <>
          <p className="text-sm">
            {" "}
            <UiText
              id="t9998cf394fb4"
              fallback="Quán theo ngày và khẩu vị. Với dị ứng, luôn xác nhận trực tiếp với quán."
            />{" "}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              {" "}
              <UiText
                id="tecdd695bb8bb"
                fallback="Tìm món, khu vực, tiêu chí"
              />{" "}
              <input
                className={inputClass}
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
            </label>
            <label className="text-sm">
              {" "}
              <UiText id="t691c99187f36" fallback="Loại địa điểm" />{" "}
              <select
                className={inputClass}
                value={diningKind}
                onChange={(e) => setDiningKind(e.target.value)}
              >
                <option value="all">
                  {" "}
                  <UiText id="tf7a578dcbdca" fallback="Tất cả" />{" "}
                </option>
                <option value="meal">
                  {" "}
                  <UiText id="t7a40f9ef6566" fallback="Nhà hàng/quán ăn" />{" "}
                </option>
                <option value="cafe">
                  {" "}
                  <UiText id="t7d6408613397" fallback="Café" />{" "}
                </option>
              </select>
            </label>
            <label className="text-sm">
              {" "}
              <UiText id="t67a64422514a" fallback="Thêm vào ngày" />{" "}
              <select
                className={inputClass}
                value={dayNumber}
                onChange={(e) => setDayNumber(Number(e.target.value))}
              >
                {plan?.days.map((d) => (
                  <option key={d.id ?? d.day_number} value={d.day_number}>
                    {" "}
                    <UiText id="t368c4575744a" fallback="Ngày" /> {d.day_number}
                    : {cityLabel(d.city_slug, d.city)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              {" "}
              <UiText id="tcef8c2429948" fallback="Giờ ăn/nghỉ" />{" "}
              <input
                className={inputClass}
                type="time"
                value={mealTime}
                onChange={(e) => setMealTime(e.target.value)}
              />
            </label>
          </div>
          <details>
            <summary className="cursor-pointer text-sm font-semibold text-primary">
              {" "}
              <UiText
                id="t6a95124d1d34"
                fallback="Lọc theo ngân sách & tiêu chí có dữ liệu"
              />{" "}
            </summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="text-sm">
                {" "}
                <UiText id="tac746a99bef0" fallback="Tối đa/người (" />{" "}
                {plan?.currency ?? "VND"})
                <input
                  className={inputClass}
                  type="number"
                  min="0"
                  value={maxPrice}
                  onChange={(e) => setMaxPrice(e.target.value)}
                />
              </label>
              <label className="text-sm">
                {" "}
                <UiText
                  id="t252ddab7886f"
                  fallback="Nhãn khẩu vị/nhu cầu (cách nhau dấu phẩy)"
                />{" "}
                <input
                  className={inputClass}
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  placeholder={t("vegetarian, quiet")}
                />
              </label>
            </div>
            <button
              disabled={busy}
              className="mt-3 text-sm font-semibold text-primary"
              onClick={searchCatalog}
            >
              {" "}
              <UiText
                id="t0c68c63122d5"
                fallback="Tìm thêm trong catalog"
              />{" "}
            </button>
            <p className="mt-2 text-xs">
              {" "}
              <UiText
                id="t5ffbfff3358a"
                fallback="Bộ lọc catalog chỉ trả quán có dữ liệu phù hợp; thông tin dị ứng cần xác nhận trực tiếp."
              />{" "}
            </p>
          </details>
          <div className="grid gap-4 sm:grid-cols-2">
            {[...(plan?.restaurants ?? []), ...catalogDining]
              .filter(
                (r) =>
                  (!maxPrice ||
                    (r.estimated_per_person !== undefined &&
                      r.estimated_per_person <= Number(maxPrice))) &&
                  !skipped.includes(r.id ?? r.name) &&
                  (diningKind === "all" ||
                    (r.kind ??
                      (/caf[eé]/i.test(r.cuisine) ? "cafe" : "meal")) ===
                      diningKind) &&
                  `${r.name} ${r.cuisine} ${r.note} ${r.address}`
                    .toLocaleLowerCase()
                    .includes(filter.toLocaleLowerCase()),
              )
              .map((r, i) => (
                <article
                  key={r.id ?? i}
                  className="space-y-3 rounded-xl border border-outline-variant/30 p-4"
                >
                  <h3 className="font-bold">{r.name}</h3>
                  <p className="text-sm">
                    {cityLabel(r.city_slug, r.city)} · {r.cuisine} ·{" "}
                    {r.price_per_person || r.price_range}
                  </p>
                  <p className="text-sm leading-6">{r.note}</p>
                  <p className="text-xs">
                    {r.evidence?.source === "catalog" ? (
                      <UiText id="te01d5bb205d1" fallback="Dữ liệu catalog" />
                    ) : (
                      <UiText
                        id="t9079ffaf1e5e"
                        fallback="Gợi ý cần xác minh"
                      />
                    )}
                  </p>
                  <div className="flex flex-wrap gap-4 text-sm font-semibold text-primary">
                    {canEdit && (
                      <button disabled={busy} onClick={() => addDining(r)}>
                        {" "}
                        <UiText
                          id="ta334737dc15d"
                          fallback="Thêm vào lịch"
                        />{" "}
                      </button>
                    )}
                    <button
                      onClick={() => setSkipped((s) => [...s, r.id ?? r.name])}
                    >
                      {" "}
                      <UiText id="t861dafdead09" fallback="Bỏ qua" />{" "}
                    </button>
                    <a
                      href={mapUrl(r)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {" "}
                      {locale === "vi"
                        ? r.map_precision === "verified"
                          ? "Mở vị trí trên bản đồ"
                          : "Tìm trên bản đồ"
                        : r.map_precision === "verified"
                          ? "Open location on Maps"
                          : "Search on Maps"}{" "}
                    </a>
                  </div>
                </article>
              ))}
          </div>
          {skipped.length > 0 && (
            <button
              className="text-sm text-primary"
              onClick={() => setSkipped([])}
            >
              {" "}
              <UiText
                id="tcfd5385d1e3b"
                fallback="Hiện lại các quán đã bỏ qua"
              />{" "}
            </button>
          )}
          <h3 className="font-bold">
            {" "}
            <UiText
              id="t0561e9f98cbf"
              fallback="Thay quán đã có trong timeline"
            />{" "}
          </h3>
          {plan?.days.flatMap((d) =>
            d.activities
              .filter((a) => a.kind === "meal" || a.kind === "cafe")
              .map((a) => (
                <div
                  className="flex items-center justify-between gap-3 rounded-lg bg-surface-container-low p-3"
                  key={a.id}
                >
                  <span className="text-sm">
                    {" "}
                    <UiText id="t368c4575744a" fallback="Ngày" /> {d.day_number}{" "}
                    · {a.time} · {a.name}
                  </span>
                  {canEdit && (
                    <button
                      disabled={
                        busy ||
                        !!jobId ||
                        (plan.locked_ids ?? []).includes(a.id!)
                      }
                      className="text-sm font-semibold text-primary disabled:opacity-40"
                      onClick={() =>
                        startRevision(
                          "meal",
                          a.id!,
                          "Đề xuất quán khác cùng khung giờ, phù hợp tiêu chí đã lưu.",
                        )
                      }
                    >
                      {" "}
                      <UiText id="t361e9ca46525" fallback="Thay quán" />{" "}
                    </button>
                  )}
                </div>
              )),
          )}
        </>
      )}
      {section === "revisions" && (
        <>
          <p className="text-sm">
            {" "}
            <UiText
              id="tab2b76333686"
              fallback="Khóa mục muốn giữ. Xem thay đổi trước khi áp dụng; các mục đã đặt không tự bị thay thế."
            />{" "}
          </p>
          {canEdit && (
            <fieldset disabled={busy || !!jobId} className="space-y-4">
              <label className="block text-sm">
                {" "}
                <UiText id="tadaecb379aef" fallback="Phần cần tạo lại" />{" "}
                <select
                  className={inputClass}
                  value={scope}
                  onChange={(e) => {
                    setScope(e.target.value);
                    setTarget("");
                  }}
                >
                  <option value="day">
                    {" "}
                    <UiText id="t6c590f734c5f" fallback="Một ngày" />{" "}
                  </option>
                  <option value="meal">
                    {" "}
                    <UiText
                      id="t3c7c86d439bc"
                      fallback="Một bữa ăn/café"
                    />{" "}
                  </option>
                  <option value="stay">
                    {" "}
                    <UiText
                      id="tb665942cab2c"
                      fallback="Một chỗ ở gợi ý"
                    />{" "}
                  </option>
                </select>
              </label>
              <label className="block text-sm">
                {" "}
                <UiText id="tc3695481f9f9" fallback="Chọn mục" />{" "}
                <select
                  className={inputClass}
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                >
                  <option value="">
                    {" "}
                    <UiText id="t8105e4da5ab5" fallback="Chọn mục…" />{" "}
                  </option>
                  {scope === "day"
                    ? plan?.days.map((d) => (
                        <option key={d.id} value={d.id}>
                          {" "}
                          <UiText id="t368c4575744a" fallback="Ngày" />{" "}
                          {d.day_number}: {d.title}
                        </option>
                      ))
                    : scope === "stay"
                      ? plan?.hotels.map((h) => (
                          <option key={h.id} value={h.id}>
                            {h.name}
                          </option>
                        ))
                      : plan?.days.flatMap((d) =>
                          d.activities
                            .filter(
                              (a) => a.kind === "meal" || a.kind === "cafe",
                            )
                            .map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.name}
                              </option>
                            )),
                        )}
                </select>
              </label>
              <label className="block text-sm">
                {" "}
                <UiText
                  id="t5768cff9e187"
                  fallback="Bạn muốn thay đổi điều gì?"
                />{" "}
                <textarea
                  className={inputClass}
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                  maxLength={2000}
                />
              </label>
              <button
                disabled={!target}
                className="rounded-full bg-primary px-5 py-2 text-on-primary disabled:opacity-40"
                onClick={() => startRevision(scope, target)}
              >
                {" "}
                <UiText
                  id="tf7a4f9a373fb"
                  fallback="Tạo phương án xem trước"
                />{" "}
              </button>
            </fieldset>
          )}
          <div className="space-y-3">
            <h3 className="font-bold">
              {" "}
              <UiText
                id="t3765b91e2c3e"
                fallback="Việc cần làm trước chuyến đi"
              />{" "}
            </h3>
            {checklist.length === 0 && (
              <p className="text-sm">
                {" "}
                <UiText
                  id="tc873da066e0d"
                  fallback="Chưa có việc cần xử lý từ lịch trình."
                />{" "}
              </p>
            )}
            {checklist.map((item) => (
              <label key={item.id} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  disabled={!canEdit || busy}
                  checked={item.status === "done"}
                  onChange={(e) =>
                    void run(async () => {
                      setChecklist(
                        await journeyRequest(
                          `trips/${tripId}/planning-checklist/${item.id}`,
                          token,
                          { status: e.target.checked ? "done" : "todo" },
                          "PATCH",
                        ),
                      );
                    })
                  }
                />
                {item.title}
              </label>
            ))}
          </div>
          <details>
            <summary className="cursor-pointer font-bold">
              {" "}
              <UiText
                id="te98989844b5f"
                fallback="Các mục muốn giữ nguyên"
              />{" "}
            </summary>
            <div className="mt-3 space-y-2">
              {plan?.days.flatMap((d) =>
                d.activities.map((a) => (
                  <label key={a.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      disabled={!canEdit || busy}
                      checked={(plan.locked_ids ?? []).includes(a.id!)}
                      onChange={() =>
                        void run(async () => {
                          const ids = new Set(plan.locked_ids ?? []);
                          if (ids.has(a.id!)) ids.delete(a.id!);
                          else ids.add(a.id!);
                          await journeyRequest(
                            `trips/${tripId}/planning`,
                            token,
                            {
                              expected_version: plan.version,
                              locked_ids: [...ids],
                            },
                            "PATCH",
                          );
                          await changed();
                        })
                      }
                    />{" "}
                    <UiText id="t368c4575744a" fallback="Ngày" /> {d.day_number}
                    : {a.name}
                  </label>
                )),
              )}
            </div>
          </details>
        </>
      )}
      {(section === "revisions" || section === "dining") &&
        revisions
          .filter(
            (r) => r.status !== "preview" || !dismissedPreviews.includes(r.id),
          )
          .map((r) => (
            <article
              key={r.id}
              className="space-y-3 rounded-xl border border-primary/30 p-4"
            >
              <h3 className="font-bold">
                {r.status === "applied" ? (
                  <UiText id="td3f0f7bfd8b5" fallback="Phiên bản đã áp dụng" />
                ) : (
                  <UiText id="t093b375f81cc" fallback="Phương án xem trước" />
                )}{" "}
                <UiText id="t2b742296399e" fallback="· từ bản" />{" "}
                {r.base_version}
              </h3>
              <p className="text-sm">
                {" "}
                <UiText id="ta62b58ceb12e" fallback="Chi phí thay đổi:" />{" "}
                {money(r.diff.cost_delta, plan?.currency)}
              </p>
              {r.candidate.issues?.map((issue, index) => (
                <p
                  key={`${issue.code}-${index}`}
                  className="text-sm text-amber-800"
                >
                  {issueText(issue)}
                </p>
              ))}
              <ul className="list-disc pl-5 text-sm">
                {r.diff.added.map((x, i) => (
                  <li key={`a${i}`}>
                    {" "}
                    <UiText id="tca576bcf5d36" fallback="Thêm:" /> {x}
                  </li>
                ))}
                {r.diff.removed.map((x, i) => (
                  <li key={`r${i}`}>
                    {" "}
                    <UiText id="t0bc2df1bcb12" fallback="Bỏ:" /> {x}
                  </li>
                ))}
                {r.diff.changed.map((x, i) => (
                  <li key={`c${i}`}>
                    {" "}
                    <UiText id="t649875cce56c" fallback="Đổi:" /> {x}
                  </li>
                ))}
              </ul>
              <details>
                <summary className="cursor-pointer text-sm font-semibold text-primary">
                  {" "}
                  <UiText
                    id="t8b9d32a9e63d"
                    fallback="Xem giờ và địa điểm trong phương án"
                  />{" "}
                </summary>
                {r.candidate.days.map((d) => (
                  <div key={d.id ?? d.day_number} className="mt-3">
                    <p className="font-bold">
                      {" "}
                      <UiText id="t368c4575744a" fallback="Ngày" />{" "}
                      {d.day_number}
                    </p>
                    {d.activities.map((a) => (
                      <p key={a.id} className="text-sm">
                        {a.time} · {a.name} · {a.duration}
                      </p>
                    ))}
                  </div>
                ))}
              </details>
              {r.status === "preview" && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setDismissedPreviews((ids) => [...ids, r.id])}
                  className="mr-3 rounded-full border border-outline-variant px-4 py-2 text-sm font-semibold"
                >
                  <UiText id="cancel_editing" fallback="Cancel editing" />
                </button>
              )}
              {canApply && r.status === "preview" && (
                <button
                  disabled={busy || r.base_version !== plan?.version}
                  className="rounded-full bg-primary px-4 py-2 text-sm text-on-primary disabled:opacity-40"
                  onClick={() =>
                    void run(async () => {
                      await journeyRequest(
                        `trips/${tripId}/itinerary-revisions/${r.id}/apply`,
                        token,
                        { expected_version: r.base_version },
                      );
                      await changed();
                      setMessage(t("Đã áp dụng phương án."));
                    })
                  }
                >
                  {r.base_version !== plan?.version ? (
                    <UiText
                      id="t4130f49427d7"
                      fallback="Bản gốc đã đổi — hãy tạo lại"
                    />
                  ) : (
                    <UiText
                      id="t50eb0f83854d"
                      fallback="Áp dụng phương án này"
                    />
                  )}
                </button>
              )}
              {canApply && r.status === "applied" && (
                <button
                  disabled={busy || !!jobId}
                  className="text-sm font-semibold text-primary"
                  onClick={() =>
                    void run(async () => {
                      const job = await journeyRequest<{ job_id: string }>(
                        `trips/${tripId}/itinerary-revisions`,
                        token,
                        {
                          scope: "restore",
                          restore_revision_id: r.id,
                          expected_version: plan?.version,
                          instruction: "Khôi phục phiên bản trước",
                        },
                      );
                      setJobId(job.job_id);
                    })
                  }
                >
                  {" "}
                  <UiText
                    id="ta76f878f8d8c"
                    fallback="Xem trước khôi phục bản trước"
                  />{" "}
                </button>
              )}
            </article>
          ))}
    </section>
  );
}
