"use client";

import { useEffect, useState } from "react";
import type * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type {
  CreateBillUploadRequest,
  CreatePlaceSubmissionRequest,
  CreateTripActivityRequest,
  CreateTripExpenseRequest,
  PlaceRecommendationSummary,
  TransportPriceRecommendationSummary,
  TripChecklistItem,
  TripDetail,
} from "@travel/types";
import { SiteHeader } from "../../../../components/layout/SiteHeader";
import {
  createBillUpload,
  createPlaceSubmission,
  createTripActivity,
  createTripExpense,
  getPlaceRecommendations,
  getTransportPriceRecommendations,
  getTripDetail,
  reviewTripChangeRequest,
  updateTripActivityStatus,
  updateTripChecklistStatus,
} from "../../../../lib/api";
import { createClient } from "../../../../lib/supabase/client";

type LoadState = "loading" | "ready" | "error";

const checklistStatusOptions: TripChecklistItem["status"][] = [
  "todo",
  "in_progress",
  "done",
  "blocked",
];

export default function TripDetailPage() {
  const params = useParams<{ id: string }>();
  const tripId = params.id;

  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [trip, setTrip] = useState<TripDetail | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [placeRecommendations, setPlaceRecommendations] = useState<PlaceRecommendationSummary[]>([]);
  const [transportRecommendations, setTransportRecommendations] = useState<TransportPriceRecommendationSummary[]>([]);
  const [activityForm, setActivityForm] = useState<CreateTripActivityRequest>({
    title: "",
    place_name: "",
    address: "",
    price: undefined,
  });
  const [placeForm, setPlaceForm] = useState<CreatePlaceSubmissionRequest>({
    raw_name: "",
    raw_type: "cafe",
    raw_address: "",
    raw_notes: "",
    raw_price: undefined,
  });
  const [expenseForm, setExpenseForm] = useState<CreateTripExpenseRequest>({
    title: "",
    amount: 0,
    currency: "VND",
    expense_type: "food",
    activity_id: null,
    split_user_ids: [],
  });
  const [billForm, setBillForm] = useState<CreateBillUploadRequest>({
    raw_ocr_text: "",
    place_name: "",
    place_address: "",
    place_type: "restaurant",
    currency: "VND",
    create_expense: true,
    split_user_ids: [],
  });

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const supabase = createClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session?.access_token) {
          setError("Please sign in to view this trip.");
          setState("error");
          return;
        }

        setToken(session.access_token);
        const detail = await getTripDetail(tripId, session.access_token);
        if (cancelled) return;
        setTrip(detail);
        void refreshRecommendations(detail);
        setState("ready");
      } catch {
        if (cancelled) return;
        setError("Unable to load trip detail.");
        setState("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [tripId]);

  async function handleChecklistStatus(itemId: string, status: TripChecklistItem["status"]) {
    if (!token || !trip) return;
    const updated = await updateTripChecklistStatus(trip.id, itemId, status, token);
    setTrip({
      ...trip,
      checklist: trip.checklist.map((item) => (item.id === itemId ? updated : item)),
      checklist_done: trip.checklist.filter((item) =>
        item.id === itemId ? updated.status === "done" : item.status === "done"
      ).length,
    });
  }

  async function handleActivityStatus(
    activityId: string,
    status: "planned" | "booked" | "visited" | "skipped"
  ) {
    if (!token || !trip) return;
    const updated = await updateTripActivityStatus(trip.id, activityId, status, token);
    setTrip({
      ...trip,
      activities: trip.activities.map((activity) =>
        activity.id === activityId ? { ...activity, status: updated.status } : activity
      ),
    });
  }

  async function handleCreateActivity(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !trip || !activityForm.title.trim()) return;
    const activity = await createTripActivity(
      trip.id,
      {
        ...activityForm,
        title: activityForm.title.trim(),
        place_name: activityForm.place_name?.trim() || undefined,
        address: activityForm.address?.trim() || undefined,
        price: activityForm.price ? Number(activityForm.price) : undefined,
      },
      token
    );
    setTrip(await getTripDetail(trip.id, token));
    setActivityForm({ title: "", place_name: "", address: "", price: undefined });
    setNotice(activity.approval_status === "pending" ? "Activity added and waiting for host review." : "Activity added.");
  }

  async function handleCreatePlaceSubmission(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !trip || !placeForm.raw_name.trim()) return;
    await createPlaceSubmission(
      trip.id,
      {
        ...placeForm,
        raw_name: placeForm.raw_name.trim(),
        raw_type: placeForm.raw_type?.trim() || undefined,
        raw_address: placeForm.raw_address?.trim() || undefined,
        raw_notes: placeForm.raw_notes?.trim() || undefined,
        raw_price: placeForm.raw_price ? Number(placeForm.raw_price) : undefined,
      },
      token
    );
    setTrip(await getTripDetail(trip.id, token));
    setPlaceForm({ raw_name: "", raw_type: "cafe", raw_address: "", raw_notes: "", raw_price: undefined });
    setNotice("Place submitted as reusable travel data.");
  }

  async function handleCreateExpense(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !trip || !expenseForm.title.trim() || !expenseForm.amount) return;
    const expense = await createTripExpense(
      trip.id,
      {
        ...expenseForm,
        title: expenseForm.title.trim(),
        amount: Number(expenseForm.amount),
        split_user_ids: expenseForm.split_user_ids?.length
          ? expenseForm.split_user_ids
          : trip.members.map((member) => member.user_id),
      },
      token
    );
    setTrip(await getTripDetail(trip.id, token));
    setExpenseForm({
      title: "",
      amount: 0,
      currency: "VND",
      expense_type: "food",
      activity_id: null,
      split_user_ids: [],
    });
    setNotice(expense.approval_status === "pending" ? "Expense added and waiting for host review." : "Expense added with splits.");
  }

  async function handleCreateBill(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !trip || !billForm.raw_ocr_text.trim()) return;

    const bill = await createBillUpload(
      trip.id,
      {
        ...billForm,
        raw_ocr_text: billForm.raw_ocr_text.trim(),
        place_name: billForm.place_name?.trim() || undefined,
        place_address: billForm.place_address?.trim() || undefined,
        city_slug: trip.primary_city_slug ?? undefined,
        split_user_ids: billForm.split_user_ids?.length
          ? billForm.split_user_ids
          : trip.members.map((member) => member.user_id),
      },
      token
    );
    const detail = await getTripDetail(trip.id, token);
    setTrip(detail);
    void refreshRecommendations(detail);
    setBillForm({
      raw_ocr_text: "",
      place_name: "",
      place_address: "",
      place_type: "restaurant",
      currency: "VND",
      create_expense: true,
      split_user_ids: [],
    });
    setNotice(`Bill parsed with ${bill.line_items.length} items${bill.total_amount ? ` · ${bill.total_amount.toLocaleString()} ${bill.currency}` : ""}.`);
  }

  async function handleReviewChangeRequest(
    requestId: string,
    status: "approved" | "rejected"
  ) {
    if (!token || !trip) return;
    await reviewTripChangeRequest(trip.id, requestId, status, token);
    const detail = await getTripDetail(trip.id, token);
    setTrip(detail);
    setNotice(status === "approved" ? "Change request approved." : "Change request rejected.");
  }

  function toggleSplitMember(userId: string) {
    const current = expenseForm.split_user_ids ?? [];
    setExpenseForm({
      ...expenseForm,
      split_user_ids: current.includes(userId)
        ? current.filter((id) => id !== userId)
        : [...current, userId],
    });
  }

  function toggleBillSplitMember(userId: string) {
    const current = billForm.split_user_ids ?? [];
    setBillForm({
      ...billForm,
      split_user_ids: current.includes(userId)
        ? current.filter((id) => id !== userId)
        : [...current, userId],
    });
  }

  async function refreshRecommendations(detail: TripDetail) {
    const [places, transports] = await Promise.all([
      getPlaceRecommendations({ city_slug: detail.primary_city_slug, limit: 4 }),
      getTransportPriceRecommendations({ limit: 3 }),
    ]);
    setPlaceRecommendations(places);
    setTransportRecommendations(transports);
  }

  return (
    <div className="min-h-screen bg-background text-on-surface">
      <SiteHeader />

      <main className="mx-auto max-w-6xl px-4 py-10 space-y-6" data-testid="web-trip-detail-page">
        <Link href="/trips" className="text-sm font-semibold text-primary hover:underline">
          Back to trips
        </Link>

        {state === "loading" && (
          <section className="rounded-2xl border border-outline-variant/30 bg-surface p-6">
            <p className="text-sm text-on-surface-variant">Loading trip workspace...</p>
          </section>
        )}

        {state === "error" && (
          <section className="rounded-2xl border border-error/40 bg-error/10 p-6">
            <p className="text-sm font-semibold text-error">{error}</p>
          </section>
        )}

        {state === "ready" && trip && (
          <>
            <header className="overflow-hidden rounded-3xl bg-linear-to-br from-primary to-tertiary p-8 text-on-primary shadow-lg">
              <p className="text-xs font-bold uppercase tracking-[0.22em] opacity-80">{trip.role}</p>
              <h1 className="mt-3 font-headline text-4xl font-extrabold tracking-tight">{trip.title}</h1>
              <p className="mt-2 max-w-2xl text-sm opacity-85">{trip.description}</p>
              <div className="mt-6 grid gap-3 sm:grid-cols-4">
                <Metric label="Members" value={trip.member_count} />
                <Metric label="Activities" value={trip.activity_count} />
                <Metric label="Checklist" value={`${trip.checklist_done}/${trip.checklist_total}`} />
                <Metric label="Approved spend" value={`${Math.round(trip.expense_total / 1000000)}m ${trip.currency}`} />
              </div>
            </header>

            {notice && (
              <section className="rounded-2xl border border-primary/20 bg-primary-fixed p-4 text-sm font-semibold text-on-primary-fixed-variant">
                {notice}
              </section>
            )}

            <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
              <div className="space-y-6">
                <Panel title="Activities">
                  <form onSubmit={(event) => void handleCreateActivity(event)} className="mb-4 grid gap-3 rounded-2xl border border-outline-variant/40 bg-surface-container-low p-4">
                    <p className="text-sm font-bold">Add activity for this trip</p>
                    <input
                      value={activityForm.title}
                      onChange={(event) => setActivityForm({ ...activityForm, title: event.target.value })}
                      placeholder="Basket boat, coffee crawl, dinner..."
                      className="rounded-xl border border-outline-variant bg-surface px-3 py-2 text-sm"
                      data-testid="activity-title-input"
                    />
                    <div className="grid gap-2 sm:grid-cols-3">
                      <input
                        value={activityForm.place_name ?? ""}
                        onChange={(event) => setActivityForm({ ...activityForm, place_name: event.target.value })}
                        placeholder="Place name"
                        className="rounded-xl border border-outline-variant bg-surface px-3 py-2 text-sm"
                        data-testid="activity-place-input"
                      />
                      <input
                        value={activityForm.address ?? ""}
                        onChange={(event) => setActivityForm({ ...activityForm, address: event.target.value })}
                        placeholder="Address"
                        className="rounded-xl border border-outline-variant bg-surface px-3 py-2 text-sm"
                      />
                      <input
                        value={activityForm.price ?? ""}
                        onChange={(event) => setActivityForm({ ...activityForm, price: Number(event.target.value) || undefined })}
                        placeholder="Expected price"
                        type="number"
                        className="rounded-xl border border-outline-variant bg-surface px-3 py-2 text-sm"
                      />
                    </div>
                    <button type="submit" className="rounded-full bg-primary px-4 py-2 text-sm font-bold text-on-primary" data-testid="add-activity-button">
                      Add activity
                    </button>
                  </form>
                  <div className="space-y-3">
                    {trip.activities.map((activity) => (
                      <div key={activity.id} className="rounded-2xl bg-surface-container-low p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="font-bold">{activity.title}</p>
                            <p className="text-sm text-on-surface-variant">
                              {activity.place_name ?? "Custom activity"} · {activity.approval_status}
                            </p>
                          </div>
                          <select
                            value={activity.status}
                            onChange={(event) =>
                              void handleActivityStatus(
                                activity.id,
                                event.target.value as "planned" | "booked" | "visited" | "skipped"
                              )
                            }
                            className="rounded-full border border-outline-variant bg-surface px-3 py-2 text-sm font-semibold"
                          >
                            {["planned", "booked", "visited", "skipped"].map((status) => (
                              <option key={status} value={status}>
                                {status}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    ))}
                  </div>
                </Panel>

                <Panel title="Transport and stays">
                  <div className="grid gap-3 md:grid-cols-2">
                    {trip.transports.map((transport) => (
                      <div key={transport.id} className="rounded-2xl bg-surface-container-low p-4">
                        <p className="text-xs font-bold uppercase tracking-wide text-primary">
                          {transport.mode.replace(/_/g, " ")}
                        </p>
                        <p className="mt-1 font-bold">
                          {transport.from_label ?? "Origin TBD"} {"->"} {transport.to_label ?? "Destination TBD"}
                        </p>
                        <p className="text-sm text-on-surface-variant">
                          {transport.provider_name ?? "Provider TBD"} · {transport.service_number ?? transport.service_class}
                        </p>
                        <p className="mt-2 text-xs text-outline">{transport.status}</p>
                      </div>
                    ))}
                    {trip.accommodations.map((stay) => (
                      <div key={stay.id} className="rounded-2xl bg-surface-container-low p-4">
                        <p className="text-xs font-bold uppercase tracking-wide text-primary">Stay</p>
                        <p className="mt-1 font-bold">{stay.place_name ?? "Accommodation"}</p>
                        <p className="text-sm text-on-surface-variant">{stay.room_type ?? "Room TBD"}</p>
                        <p className="mt-2 text-xs text-outline">
                          {stay.total_price ? `${stay.total_price.toLocaleString()} ${stay.currency}` : stay.booking_status}
                        </p>
                      </div>
                    ))}
                  </div>
                </Panel>

                <Panel title="Reusable place data">
                  <form onSubmit={(event) => void handleCreatePlaceSubmission(event)} className="grid gap-3">
                    <input
                      value={placeForm.raw_name}
                      onChange={(event) => setPlaceForm({ ...placeForm, raw_name: event.target.value })}
                      placeholder="Cafe, restaurant, homestay name"
                      className="rounded-xl border border-outline-variant bg-surface px-3 py-2 text-sm"
                      data-testid="place-name-input"
                    />
                    <div className="grid gap-2 sm:grid-cols-2">
                      <input
                        value={placeForm.raw_type ?? ""}
                        onChange={(event) => setPlaceForm({ ...placeForm, raw_type: event.target.value })}
                        placeholder="Type: cafe, restaurant, hotel"
                        className="rounded-xl border border-outline-variant bg-surface px-3 py-2 text-sm"
                      />
                      <input
                        value={placeForm.raw_price ?? ""}
                        onChange={(event) => setPlaceForm({ ...placeForm, raw_price: Number(event.target.value) || undefined })}
                        placeholder="Observed price"
                        type="number"
                        className="rounded-xl border border-outline-variant bg-surface px-3 py-2 text-sm"
                      />
                    </div>
                    <input
                      value={placeForm.raw_address ?? ""}
                      onChange={(event) => setPlaceForm({ ...placeForm, raw_address: event.target.value })}
                      placeholder="Address for duplicate/outdated checks"
                      className="rounded-xl border border-outline-variant bg-surface px-3 py-2 text-sm"
                      data-testid="place-address-input"
                    />
                    <textarea
                      value={placeForm.raw_notes ?? ""}
                      onChange={(event) => setPlaceForm({ ...placeForm, raw_notes: event.target.value })}
                      placeholder="Notes: price changed, renamed, moved, bill insight..."
                      className="min-h-20 rounded-xl border border-outline-variant bg-surface px-3 py-2 text-sm"
                    />
                    <button type="submit" className="rounded-full bg-secondary px-4 py-2 text-sm font-bold text-on-secondary" data-testid="add-place-button">
                      Save place signal
                    </button>
                  </form>
                  <div className="mt-4 space-y-2">
                    {trip.place_submissions.slice(0, 4).map((submission) => (
                      <p key={submission.id} className="rounded-xl bg-surface-container-low px-3 py-2 text-xs">
                        {submission.raw_name} · {submission.status}
                      </p>
                    ))}
                  </div>
                </Panel>

                <Panel title="Bill capture and OCR">
                  <form onSubmit={(event) => void handleCreateBill(event)} className="grid gap-3">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <input
                        value={billForm.place_name ?? ""}
                        onChange={(event) => setBillForm({ ...billForm, place_name: event.target.value })}
                        placeholder="Place on bill"
                        className="rounded-xl border border-outline-variant bg-surface px-3 py-2 text-sm"
                        data-testid="bill-place-input"
                      />
                      <input
                        value={billForm.place_address ?? ""}
                        onChange={(event) => setBillForm({ ...billForm, place_address: event.target.value })}
                        placeholder="Address on bill"
                        className="rounded-xl border border-outline-variant bg-surface px-3 py-2 text-sm"
                        data-testid="bill-address-input"
                      />
                    </div>
                    <textarea
                      value={billForm.raw_ocr_text}
                      onChange={(event) => setBillForm({ ...billForm, raw_ocr_text: event.target.value })}
                      placeholder={"Paste OCR text here, e.g.\nCafe Test\nCoffee x2 90000\nTotal 90000"}
                      className="min-h-32 rounded-xl border border-outline-variant bg-surface px-3 py-2 text-sm"
                      data-testid="bill-ocr-input"
                    />
                    <div className="flex flex-wrap gap-2">
                      {trip.members.map((member) => {
                        const checked = billForm.split_user_ids?.includes(member.user_id) ?? false;
                        return (
                          <label key={member.user_id} className="flex items-center gap-2 rounded-full border border-outline-variant px-3 py-1 text-xs font-semibold">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleBillSplitMember(member.user_id)}
                            />
                            {member.display_name ?? member.email}
                          </label>
                        );
                      })}
                    </div>
                    <button type="submit" className="rounded-full bg-primary px-4 py-2 text-sm font-bold text-on-primary" data-testid="upload-bill-button">
                      Parse bill and create expense
                    </button>
                  </form>
                </Panel>
              </div>

              <div className="space-y-6">
                <Panel title="Checklist">
                  <div className="space-y-3">
                    {trip.checklist.map((item) => (
                      <div key={item.id} className="rounded-2xl bg-surface-container-low p-4">
                        <p className="font-semibold">{item.title}</p>
                        <p className="text-xs uppercase tracking-wide text-outline">{item.category}</p>
                        <select
                          value={item.status}
                          onChange={(event) =>
                            void handleChecklistStatus(item.id, event.target.value as TripChecklistItem["status"])
                          }
                          className="mt-3 w-full rounded-full border border-outline-variant bg-surface px-3 py-2 text-sm font-semibold"
                        >
                          {checklistStatusOptions.map((status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </Panel>

                <Panel title="Group and expenses">
                  <div className="space-y-4">
                    <div className="flex flex-wrap gap-2">
                      {trip.members.map((member) => (
                        <span key={member.user_id} className="rounded-full bg-primary-fixed px-3 py-1 text-xs font-bold text-on-primary-fixed-variant">
                          {member.display_name ?? member.email} · {member.role}
                        </span>
                      ))}
                    </div>
                    <form onSubmit={(event) => void handleCreateExpense(event)} className="grid gap-3 rounded-2xl border border-outline-variant/40 bg-surface-container-low p-4">
                      <p className="text-sm font-bold">Add shared expense</p>
                      <input
                        value={expenseForm.title}
                        onChange={(event) => setExpenseForm({ ...expenseForm, title: event.target.value })}
                        placeholder="Dinner bill, tickets, hotel deposit..."
                        className="rounded-xl border border-outline-variant bg-surface px-3 py-2 text-sm"
                        data-testid="expense-title-input"
                      />
                      <div className="grid gap-2 sm:grid-cols-2">
                        <input
                          value={expenseForm.amount || ""}
                          onChange={(event) => setExpenseForm({ ...expenseForm, amount: Number(event.target.value) || 0 })}
                          placeholder="Amount"
                          type="number"
                          className="rounded-xl border border-outline-variant bg-surface px-3 py-2 text-sm"
                          data-testid="expense-amount-input"
                        />
                        <select
                          value={expenseForm.activity_id ?? ""}
                          onChange={(event) => setExpenseForm({ ...expenseForm, activity_id: event.target.value || null })}
                          className="rounded-xl border border-outline-variant bg-surface px-3 py-2 text-sm"
                          data-testid="expense-activity-select"
                        >
                          <option value="">No activity link</option>
                          {trip.activities.map((activity) => (
                            <option key={activity.id} value={activity.id}>
                              {activity.title}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {trip.members.map((member) => {
                          const checked = expenseForm.split_user_ids?.includes(member.user_id) ?? false;
                          return (
                            <label key={member.user_id} className="flex items-center gap-2 rounded-full border border-outline-variant px-3 py-1 text-xs font-semibold">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleSplitMember(member.user_id)}
                              />
                              {member.display_name ?? member.email}
                            </label>
                          );
                        })}
                      </div>
                      <button type="submit" className="rounded-full bg-tertiary px-4 py-2 text-sm font-bold text-on-tertiary" data-testid="add-expense-button">
                        Add expense and split
                      </button>
                    </form>
                    <div className="space-y-3">
                      {trip.expenses.map((expense) => (
                        <div key={expense.id} className="rounded-2xl bg-surface-container-low p-4">
                          <div className="flex justify-between gap-3">
                            <div>
                              <p className="font-semibold">{expense.title}</p>
                              <p className="text-xs text-on-surface-variant">
                                {expense.activity_title ?? expense.place_name ?? expense.expense_type}
                              </p>
                            </div>
                            <p className="font-bold">{expense.amount.toLocaleString()} {expense.currency}</p>
                          </div>
                          <div className="mt-3 space-y-1">
                            {expense.splits.map((split) => (
                              <div key={split.id} className="flex justify-between rounded-xl bg-surface px-3 py-2 text-xs">
                                <span>{split.display_name ?? split.email}</span>
                                <span className="font-bold">{split.share_amount.toLocaleString()} {expense.currency} · {split.status}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </Panel>

                <Panel title="Host review queue">
                  <div className="space-y-2">
                    {trip.change_requests.length === 0 && (
                      <p className="text-sm text-on-surface-variant">No pending review items.</p>
                    )}
                    {trip.change_requests.slice(0, 5).map((request) => (
                      <div key={request.id} className="rounded-2xl bg-surface-container-low p-3 text-sm" data-testid="change-request-card">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold">{request.target_type} · {request.status}</p>
                            <p className="text-xs text-on-surface-variant">{request.reason}</p>
                            <p className="mt-1 text-xs font-semibold text-on-surface">
                              {formatChangeRequestPayload(request.change_payload)}
                            </p>
                            <p className="mt-1 text-xs text-outline">By {request.requested_by_email ?? request.requested_by_user_id}</p>
                            {request.reviewed_at && (
                              <p className="mt-1 text-xs text-outline">
                                Reviewed by {request.reviewed_by_email ?? request.reviewed_by_user_id ?? "host"} · {formatDateTime(request.reviewed_at)}
                              </p>
                            )}
                          </div>
                          {request.status === "pending" && (trip.role === "host" || trip.role === "co_host") && (
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => void handleReviewChangeRequest(request.id, "approved")}
                                className="rounded-full bg-primary px-3 py-1 text-xs font-bold text-on-primary"
                                data-testid="approve-change-request-button"
                              >
                                Approve
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleReviewChangeRequest(request.id, "rejected")}
                                className="rounded-full border border-outline-variant px-3 py-1 text-xs font-bold text-on-surface"
                                data-testid="reject-change-request-button"
                              >
                                Reject
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </Panel>

                <Panel title="Recommendations and data quality">
                  <div className="space-y-3">
                    {placeRecommendations.map((place) => (
                      <div key={place.id} className="rounded-2xl bg-surface-container-low p-3 text-sm" data-testid="place-recommendation-card">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold">{place.current_name}</p>
                            <p className="text-xs text-on-surface-variant">
                              {place.type} · {place.data_quality_label.replace(/_/g, " ")}
                            </p>
                            <p className="mt-1 text-xs text-outline">
                              {place.latest_price ? `${place.latest_price.toLocaleString()} VND · ${place.latest_price_type}` : place.normalized_address ?? "No price signal yet"}
                            </p>
                          </div>
                          <span className="rounded-full bg-surface px-3 py-1 text-xs font-bold text-outline">
                            {Math.round(place.recommendation_score * 100)}
                          </span>
                        </div>
                      </div>
                    ))}
                    {transportRecommendations.map((transport) => (
                      <div key={transport.id} className="rounded-2xl bg-surface-container-low p-3 text-sm" data-testid="transport-recommendation-card">
                        <p className="text-xs font-bold uppercase tracking-wide text-primary">
                          {transport.mode.replace(/_/g, " ")}
                        </p>
                        <p className="font-semibold">
                          {transport.from_label ?? "?"} {"->"} {transport.to_label ?? "?"}
                        </p>
                        <p className="text-xs text-on-surface-variant">
                          {transport.recommendation ?? "Watch this route"} · confidence {Math.round(transport.confidence_score * 100)}%
                        </p>
                        <p className="mt-1 text-xs text-outline">
                          Cheapest seen: {transport.cheapest_observed_price?.toLocaleString() ?? "n/a"} VND
                        </p>
                      </div>
                    ))}
                  </div>
                </Panel>

                <Panel title="Audit trail">
                  <div className="space-y-2">
                    {trip.audit_logs.length === 0 && (
                      <p className="text-sm text-on-surface-variant">No audit events yet.</p>
                    )}
                    {trip.audit_logs.slice(0, 8).map((log) => (
                      <div key={log.id} className="rounded-2xl bg-surface-container-low p-3 text-sm" data-testid="audit-log-card">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold">{formatAuditAction(log.action)} · {log.target_type}</p>
                            <p className="text-xs text-on-surface-variant">
                              {log.actor_display_name ?? log.actor_email ?? "System"} · {formatDateTime(log.created_at)}
                            </p>
                            <p className="mt-1 text-xs font-semibold text-on-surface">
                              {formatAuditSnapshot(log.after_snapshot ?? log.before_snapshot)}
                            </p>
                          </div>
                          <span className="rounded-full bg-surface px-3 py-1 text-xs font-bold text-outline">
                            {log.target_id ? log.target_id.slice(0, 8) : "no target"}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </Panel>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl bg-on-primary/12 p-4">
      <p className="text-2xl font-extrabold">{value}</p>
      <p className="text-xs uppercase tracking-[0.18em] opacity-75">{label}</p>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-outline-variant/30 bg-surface p-5 shadow-sm">
      <h2 className="mb-4 font-headline text-xl font-bold">{title}</h2>
      {children}
    </section>
  );
}

function formatChangeRequestPayload(payload: Record<string, unknown>) {
  const label = payload["title"] ?? payload["raw_name"] ?? payload["amount"] ?? payload["remove_member_email"] ?? "Review submitted data";
  return String(label);
}

function formatAuditAction(action: string) {
  return action.replace(/\./g, " ").replace(/_/g, " ");
}

function formatAuditSnapshot(snapshot: Record<string, unknown> | null) {
  if (!snapshot) return "No snapshot";
  const label = snapshot["title"] ?? snapshot["raw_name"] ?? snapshot["review_status"] ?? snapshot["status"] ?? snapshot["approval_status"];
  if (label) return String(label);
  const entries = Object.entries(snapshot).slice(0, 2);
  return entries.map(([key, value]) => `${key}: ${String(value)}`).join(" · ") || "Snapshot recorded";
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
