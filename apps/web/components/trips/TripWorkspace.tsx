"use client";
import { useAppLanguage } from "../i18n/LanguageProvider";

import { UiText, useUiText } from "../i18n/UiText";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  getTripRolePermissions,
  type TripRolePermissions,
} from "@travel/types";
import { SiteHeader } from "../layout/SiteHeader";
import type { Itinerary } from "@travel/types";
import { createClient } from "../../lib/supabase/client";
import { getMyTrips, getSavedTripItinerary } from "../../lib/api";
import { localDateKey } from "../../lib/schedule-preview";
import { JourneyWorkspacePanel } from "./JourneyWorkspacePanel";
import { SavedAiPlanPanel } from "./SavedAiPlanPanel";
import {
  analyzeBillUpload,
  createBillUpload,
  createExpense,
  createTransportBooking,
  createTripActivity,
  createTripInvite,
  getTripMembership,
  listDataQualitySignals,
  listTransportBookings,
  listExpenses,
  listPlaceRecommendations,
  listReviewQueue,
  listTransportPriceRecommendations,
  listTripActivities,
  listTripAuditLogs,
  listTripMembers,
  reviewSubmission,
  searchActivityCatalog,
  type ActivityCatalogItem,
  type BillUpload,
  type BillNormalizationResult,
  type CreateBillInput,
  type CreateExpenseInput,
  type CreateTransportBookingInput,
  type CreateTripActivityInput,
  type DataQualitySignal,
  type Expense,
  type ExpenseSplit,
  type ExpenseSplitStatus,
  type PlaceRecommendation,
  type ReviewQueueItem,
  type TransportBooking,
  type TransportMode,
  type TransportPriceRecommendation,
  type TripAuditLog,
  type TripActivity,
  type TripActivityParticipant,
  type TripInvite,
  type TripMember,
  type TripMemberRole,
  type TripMemberStatus,
  type TripShareLink,
  updateActivityParticipant,
  updateBillUpload,
  updateExpense,
  updateExpenseSplitStatus,
  updateTransportBooking,
  updateTripActivity,
  updateTripMember,
  updateTripShareLink,
} from "../../lib/workspace-api";

type WorkspaceTab =
  | "overview"
  | "plan"
  | "members"
  | "schedule"
  | "stays"
  | "dining"
  | "revisions"
  | "transport"
  | "bills"
  | "review"
  | "insights"
  | "audit";
type LoadState = "loading" | "ready" | "unauthenticated" | "error";
type WorkspaceSession = {
  accessToken: string;
  userId: string;
  email: string | null;
};
type ActivityFormState = {
  title: string;
  category: string;
  scheduledAt: string;
  locationName: string;
  address: string;
  estimatedCost: string;
};
type ActivityDraftState = ActivityFormState;
type TransportFormState = {
  activityId: string;
  mode: TransportMode;
  providerName: string;
  bookingReference: string;
  originName: string;
  destinationName: string;
  departureAt: string;
  arrivalAt: string;
  price: string;
  bookingStatus: string;
  notes: string;
  participantUserIds: string[];
};
type BillFormState = {
  activityId: string;
  merchantName: string;
  totalAmount: string;
  rawText: string;
  storageUrl: string;
  billIssuedAt: string;
};
type BillDraftState = {
  activityId: string;
  merchantName: string;
  totalAmount: string;
  currency: string;
  rawText: string;
};
type ExpenseFormState = {
  title: string;
  description: string;
  amount: string;
  paidByUserId: string;
  activityId: string;
  billUploadId: string;
  splitStrategy: "equal" | "custom";
  participantUserIds: string[];
};

const ROLE_OPTIONS: TripMemberRole[] = [
  "host",
  "co_host",
  "contributor",
  "viewer",
];
const STATUS_OPTIONS: TripMemberStatus[] = ["invited", "active", "removed"];
const ACTIVITY_STATUS_OPTIONS = [
  "approved",
  "pending_review",
  "scheduled",
  "done",
  "cancelled",
  "rejected",
];
const TRANSPORT_MODES: TransportMode[] = [
  "flight",
  "train",
  "bus",
  "ferry",
  "car",
  "motorbike",
  "bicycle",
  "walking",
  "other",
];
const TRANSPORT_STATUS_OPTIONS = [
  "planned",
  "reserved",
  "ticketed",
  "completed",
  "cancelled",
];
const BILL_STATUS_OPTIONS = [
  "draft",
  "uploaded",
  "ocr_pending",
  "ocr_processed",
  "approved",
  "rejected",
];
const EXPENSE_STATUS_OPTIONS = [
  "pending_review",
  "approved",
  "rejected",
  "void",
];
const AUDIT_ENTITY_FILTERS = [
  "all",
  "trip",
  "trip_member",
  "trip_invite",
  "trip_share_link",
  "trip_activity",
  "transport_booking",
  "bill_upload",
  "expense",
  "expense_split",
];

const TABS: Array<{ id: WorkspaceTab; label: string; ready: boolean }> = [
  { id: "overview", label: "Overview", ready: true },
  { id: "plan", label: "Itinerary preview", ready: true },
  { id: "members", label: "Members & share", ready: true },
  { id: "schedule", label: "Schedule", ready: true },
  { id: "transport", label: "Di chuyển", ready: true },
  { id: "stays", label: "Lưu trú", ready: true },
  { id: "dining", label: "Ăn uống", ready: true },
  { id: "revisions", label: "Chỉnh hành trình", ready: true },
  { id: "bills", label: "Bills & split", ready: true },
  { id: "review", label: "Host review", ready: true },
  { id: "insights", label: "Insights", ready: true },
  { id: "audit", label: "Audit", ready: true },
];

function canAccessWorkspaceTab(
  tab: WorkspaceTab,
  permissions: TripRolePermissions | null,
): boolean {
  if (!permissions) return tab === "overview";
  if (tab === "members") return permissions.viewMembers;
  if (tab === "bills") return permissions.viewFinance;
  if (tab === "review") return permissions.reviewSubmissions;
  if (tab === "audit") return permissions.viewAudit;
  return true;
}

export function TripWorkspace({ tripId }: { tripId: string }) {
  const { locale: formattingLocale } = useAppLanguage();

  const t = useUiText();

  const [activeTab, setActiveTab] = useState<WorkspaceTab>("overview");
  const [state, setState] = useState<LoadState>("loading");
  const [session, setSession] = useState<WorkspaceSession | null>(null);
  const [members, setMembers] = useState<TripMember[]>([]);
  const [tripCitySlug, setTripCitySlug] = useState<string | null>(null);
  const [savedPlan, setSavedPlan] = useState<Itinerary | null>(null);
  const [savedPlanLoading, setSavedPlanLoading] = useState(true);
  const [auditLogs, setAuditLogs] = useState<TripAuditLog[]>([]);
  const [activities, setActivities] = useState<TripActivity[]>([]);
  const [activityCatalog, setActivityCatalog] = useState<ActivityCatalogItem[]>(
    [],
  );
  const [transportBookings, setTransportBookings] = useState<
    TransportBooking[]
  >([]);
  const [billUploads, setBillUploads] = useState<BillUpload[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [reviewQueue, setReviewQueue] = useState<ReviewQueueItem[]>([]);
  const [billNormalization, setBillNormalization] =
    useState<BillNormalizationResult | null>(null);
  const [placeRecommendations, setPlaceRecommendations] = useState<
    PlaceRecommendation[]
  >([]);
  const [transportPriceRecommendations, setTransportPriceRecommendations] =
    useState<TransportPriceRecommendation[]>([]);
  const [dataQualitySignals, setDataQualitySignals] = useState<
    DataQualitySignal[]
  >([]);
  const [invite, setInvite] = useState<TripInvite | null>(null);
  const [shareLink, setShareLink] = useState<TripShareLink | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<TripMemberRole>("viewer");
  const [shareRole, setShareRole] = useState<TripMemberRole>("viewer");
  const [catalogQuery, setCatalogQuery] = useState("");
  const [activityForm, setActivityForm] = useState({
    title: "",
    category: "activity",
    scheduledAt: "",
    locationName: "",
    address: "",
    estimatedCost: "",
  });
  const [activityDrafts, setActivityDrafts] = useState<
    Record<string, ActivityDraftState>
  >({});
  const [transportForm, setTransportForm] = useState<TransportFormState>({
    activityId: "",
    mode: "train",
    providerName: "",
    bookingReference: "",
    originName: "",
    destinationName: "",
    departureAt: "",
    arrivalAt: "",
    price: "",
    bookingStatus: "planned",
    notes: "",
    participantUserIds: [],
  });
  const [billForm, setBillForm] = useState<BillFormState>({
    activityId: "",
    merchantName: "",
    totalAmount: "",
    rawText: "",
    storageUrl: "",
    billIssuedAt: "",
  });
  const [expenseForm, setExpenseForm] = useState<ExpenseFormState>({
    title: "",
    description: "",
    amount: "",
    paidByUserId: "",
    activityId: "",
    billUploadId: "",
    splitStrategy: "equal",
    participantUserIds: [],
  });
  const [customSplits, setCustomSplits] = useState<Record<string, string>>({});
  const [transportPriceDrafts, setTransportPriceDrafts] = useState<
    Record<string, string>
  >({});
  const [billDrafts, setBillDrafts] = useState<Record<string, BillDraftState>>(
    {},
  );
  const [memberDrafts, setMemberDrafts] = useState<
    Record<string, Pick<TripMember, "role" | "status">>
  >({});
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const activeMember = session
    ? members.find((member) => member.userId === session.userId)
    : null;
  const permissions = activeMember
    ? getTripRolePermissions(activeMember.role)
    : null;
  const canManage = permissions?.manageMembers ?? false;
  const canContribute = permissions?.contribute ?? false;
  const visibleTabs = TABS.filter((tab) =>
    canAccessWorkspaceTab(tab.id, permissions),
  );
  const visibleAuditLogs = auditLogs.slice(0, activeTab === "audit" ? 10 : 4);

  useEffect(() => {
    if (permissions && !canAccessWorkspaceTab(activeTab, permissions)) {
      setActiveTab("overview");
    }
  }, [activeTab, permissions]);

  useEffect(() => {
    let cancelled = false;

    async function loadWorkspace() {
      setState("loading");
      setMessage(null);

      try {
        setSavedPlanLoading(true);
        const supabase = createClient();
        const {
          data: { session: auth },
        } = await supabase.auth.getSession();

        if (!auth?.access_token || !auth.user?.id) {
          setSession(null);
          setSavedPlan(null);
          setSavedPlanLoading(false);
          setState("unauthenticated");
          return;
        }

        const authSession = {
          accessToken: auth.access_token,
          userId: auth.user.id,
          email: auth.user.email ?? null,
        } satisfies WorkspaceSession;
        setSession(authSession);

        const currentMember = await getTripMembership(
          tripId,
          authSession.accessToken,
        );
        if (!currentMember || currentMember.status !== "active") {
          throw new Error("You are not an active member of this trip.");
        }
        const currentPermissions = getTripRolePermissions(currentMember.role);
        const nextMembers = currentPermissions.viewMembers
          ? await listTripMembers(tripId, authSession.accessToken)
          : [currentMember];
        const nextTrips = await getMyTrips(authSession.accessToken).catch(
          () => [],
        );
        const nextTripCitySlug =
          nextTrips.find((trip) => trip.id === tripId)?.primary_city_slug ??
          null;

        const [
          nextAuditLogs,
          nextActivities,
          nextCatalog,
          nextTransportBookings,
          nextExpenses,
          nextReviewQueue,
          nextPlaceRecommendations,
          nextTransportPriceRecommendations,
          nextDataQualitySignals,
          nextSavedPlan,
        ] = await Promise.all([
          currentPermissions.viewAudit
            ? listTripAuditLogs(tripId, authSession.accessToken, 10).catch(
                () => [],
              )
            : Promise.resolve([] as TripAuditLog[]),
          listTripActivities(tripId, authSession.accessToken).catch(() => []),
          searchActivityCatalog({
            citySlug: nextTripCitySlug ?? undefined,
            limit: 8,
          }).catch(() => []),
          listTransportBookings(tripId, authSession.accessToken).catch(
            () => [],
          ),
          currentPermissions.viewFinance
            ? listExpenses(tripId, authSession.accessToken)
            : Promise.resolve([] as Expense[]),
          currentPermissions.reviewSubmissions
            ? listReviewQueue(tripId, authSession.accessToken).catch(() => [])
            : Promise.resolve([] as ReviewQueueItem[]),
          listPlaceRecommendations({
            citySlug: nextTripCitySlug ?? undefined,
            limit: 6,
          }).catch(() => []),
          listTransportPriceRecommendations({ limit: 6 }).catch(() => []),
          listDataQualitySignals(tripId, authSession.accessToken).catch(
            () => [],
          ),
          getSavedTripItinerary(tripId, authSession.accessToken).catch(
            () => null,
          ),
        ]);

        if (cancelled) return;
        setMembers(nextMembers);
        setTripCitySlug(nextTripCitySlug);
        setAuditLogs(nextAuditLogs);
        setActivities(nextActivities);
        setActivityDrafts(buildActivityDrafts(nextActivities));
        setActivityCatalog(nextCatalog);
        setTransportBookings(nextTransportBookings);
        setTransportPriceDrafts(
          buildTransportPriceDrafts(nextTransportBookings),
        );
        setExpenses(nextExpenses);
        setReviewQueue(nextReviewQueue);
        setPlaceRecommendations(nextPlaceRecommendations);
        setTransportPriceRecommendations(nextTransportPriceRecommendations);
        setDataQualitySignals(nextDataQualitySignals);
        setSavedPlan(nextSavedPlan);
        setSavedPlanLoading(false);
        setExpenseForm((current) => ({
          ...current,
          paidByUserId: current.paidByUserId || authSession.userId,
          participantUserIds:
            current.participantUserIds.length > 0
              ? current.participantUserIds
              : nextMembers
                  .filter((member) => member.status === "active")
                  .map((member) => member.userId),
        }));
        setMemberDrafts(
          Object.fromEntries(
            nextMembers.map((member) => [
              member.userId,
              { role: member.role, status: member.status },
            ]),
          ),
        );
        setState("ready");
      } catch (error) {
        if (cancelled) return;
        setSavedPlanLoading(false);
        setMessage(
          error instanceof Error ? error.message : "Unable to load workspace.",
        );
        setState("error");
      }
    }

    void loadWorkspace();

    return () => {
      cancelled = true;
    };
  }, [tripId]);

  async function refreshAuditLogs(authToken = session?.accessToken) {
    if (!authToken) return;
    const nextAuditLogs = await listTripAuditLogs(tripId, authToken, 10).catch(
      () => [],
    );
    setAuditLogs(nextAuditLogs);
  }

  async function refreshActivities(authToken = session?.accessToken) {
    if (!authToken) return;
    const nextActivities = await listTripActivities(tripId, authToken);
    setActivities(nextActivities);
    setActivityDrafts(buildActivityDrafts(nextActivities));
  }

  async function refreshTransportBookings(authToken = session?.accessToken) {
    if (!authToken) return;
    const nextBookings = await listTransportBookings(tripId, authToken);
    setTransportBookings(nextBookings);
    setTransportPriceDrafts(buildTransportPriceDrafts(nextBookings));
  }

  async function refreshExpenses(authToken = session?.accessToken) {
    if (!authToken) return;
    setExpenses(await listExpenses(tripId, authToken));
  }

  async function refreshReviewQueue(authToken = session?.accessToken) {
    if (!authToken) return;
    setReviewQueue(await listReviewQueue(tripId, authToken).catch(() => []));
  }

  async function refreshInsights(authToken = session?.accessToken) {
    if (!authToken) return;
    const [nextPlaces, nextTransportPrices, nextSignals] = await Promise.all([
      listPlaceRecommendations({
        citySlug: tripCitySlug ?? undefined,
        limit: 6,
      }).catch(() => []),
      listTransportPriceRecommendations({ limit: 6 }).catch(() => []),
      listDataQualitySignals(tripId, authToken).catch(() => []),
    ]);
    setPlaceRecommendations(nextPlaces);
    setTransportPriceRecommendations(nextTransportPrices);
    setDataQualitySignals(nextSignals);
  }

  async function refreshActivityCatalog(query = catalogQuery) {
    setActivityCatalog(
      await searchActivityCatalog({
        citySlug: tripCitySlug ?? undefined,
        q: query.trim() || undefined,
        limit: 8,
      }).catch(() => []),
    );
  }

  async function handleCreateInvite() {
    if (!session) return;
    setBusyAction("invite");
    setMessage(null);

    try {
      const created = await createTripInvite(tripId, session.accessToken, {
        email: inviteEmail.trim() || undefined,
        role: inviteRole,
        expiresInDays: 14,
      });
      setInvite(created);
      setInviteEmail("");
      setMessage(
        t("Invite created. Send this token or link to your travel mate."),
      );
      await refreshAuditLogs(session.accessToken);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to create invite.",
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function handleEnableShareLink() {
    if (!session) return;
    setBusyAction("share");
    setMessage(null);

    try {
      const nextShareLink = await updateTripShareLink(
        tripId,
        session.accessToken,
        {
          enabled: true,
          role: shareRole,
        },
      );
      setShareLink(nextShareLink);
      setMessage(t("Share link enabled for this trip."));
      await refreshAuditLogs(session.accessToken);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to enable share link.",
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function handleUpdateMember(member: TripMember) {
    if (!session) return;
    const draft = memberDrafts[member.userId];
    if (!draft) return;

    setBusyAction(`member:${member.userId}`);
    setMessage(null);

    try {
      const updated = await updateTripMember(
        tripId,
        member.userId,
        session.accessToken,
        draft,
      );
      const nextMembers = members.map((entry) =>
        entry.userId === updated.userId ? updated : entry,
      );
      setMembers(nextMembers);
      setMemberDrafts(
        Object.fromEntries(
          nextMembers.map((entry) => [
            entry.userId,
            { role: entry.role, status: entry.status },
          ]),
        ),
      );
      setMessage(`${memberDisplayName(updated)} updated.`);
      await refreshAuditLogs(session.accessToken);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to update member.",
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function handleAddCatalogActivity(item: ActivityCatalogItem) {
    await createActivity({
      activity_catalog_id: item.id,
      title: item.canonicalName,
      category: item.category,
      location_name: item.canonicalName,
      address: item.address ?? undefined,
    });
  }

  async function handleCreateCustomActivity() {
    await createActivity({
      title: activityForm.title,
      category: activityForm.category || "activity",
      scheduled_at: activityForm.scheduledAt
        ? new Date(activityForm.scheduledAt).toISOString()
        : undefined,
      location_name: activityForm.locationName || undefined,
      address: activityForm.address || undefined,
      estimated_cost: activityForm.estimatedCost
        ? Number(activityForm.estimatedCost)
        : undefined,
      currency: "VND",
    });
  }

  async function createActivity(input: CreateTripActivityInput) {
    if (!session || !input.title.trim()) return;
    setBusyAction("activity:create");
    setMessage(null);

    try {
      const created = await createTripActivity(
        tripId,
        session.accessToken,
        input,
      );
      setActivities((current) => [created, ...current]);
      setActivityDrafts((current) => ({
        [created.id]: buildActivityDraft(created),
        ...current,
      }));
      setActivityForm({
        title: "",
        category: "activity",
        scheduledAt: "",
        locationName: "",
        address: "",
        estimatedCost: "",
      });
      setMessage(`Activity "${created.title}" added to this trip.`);
      await refreshAuditLogs(session.accessToken);
      await refreshReviewQueue(session.accessToken);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to add activity.",
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function handleImportSavedPlan() {
    if (!session || !savedPlan || activities.length > 0) return;

    setBusyAction("activity:import-plan");
    setMessage(null);

    try {
      const imported: TripActivity[] = [];
      for (const day of savedPlan.days) {
        for (const activity of day.activities) {
          const created = await createTripActivity(
            tripId,
            session.accessToken,
            {
              title: activity.name,
              source_plan_item_id: activity.id,
              category: activity.category,
              scheduled_at: toPlanScheduledAt(day.date, activity.time),
              location_name: day.city,
              estimated_cost: activity.cost ?? undefined,
              currency: savedPlan.currency,
            },
          );
          imported.push(created);
        }
      }

      setActivities(imported);
      setActivityDrafts(buildActivityDrafts(imported));
      setMessage(
        `${imported.length} AI activities added to the shared schedule.`,
      );
      await refreshAuditLogs(session.accessToken);
      await refreshReviewQueue(session.accessToken);
      setActiveTab("schedule");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to add the saved plan to Schedule.",
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function handleUpdateActivityStatus(
    activity: TripActivity,
    status: string,
  ) {
    if (!session) return;
    setBusyAction(`activity:${activity.id}`);
    setMessage(null);

    try {
      const updated = await updateTripActivity(
        tripId,
        activity.id,
        session.accessToken,
        { status },
      );
      setActivities((current) =>
        current.map((entry) => (entry.id === updated.id ? updated : entry)),
      );
      setMessage(`Activity "${updated.title}" moved to ${updated.status}.`);
      await refreshAuditLogs(session.accessToken);
      await refreshReviewQueue(session.accessToken);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to update activity.",
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function handleUpdateActivityDetails(activity: TripActivity) {
    if (!session) return;
    const draft = activityDrafts[activity.id];
    if (!draft?.title.trim()) return;
    setBusyAction(`activity-details:${activity.id}`);
    setMessage(null);

    try {
      const updated = await updateTripActivity(
        tripId,
        activity.id,
        session.accessToken,
        {
          title: draft.title,
          category: draft.category || "activity",
          scheduled_at: draft.scheduledAt
            ? new Date(draft.scheduledAt).toISOString()
            : undefined,
          location_name: draft.locationName || undefined,
          address: draft.address || undefined,
          estimated_cost: draft.estimatedCost
            ? Number(draft.estimatedCost)
            : undefined,
        },
      );
      setActivities((current) =>
        current.map((entry) => (entry.id === updated.id ? updated : entry)),
      );
      setActivityDrafts((current) => ({
        ...current,
        [updated.id]: buildActivityDraft(updated),
      }));
      setMessage(`Activity "${updated.title}" details updated.`);
      await refreshAuditLogs(session.accessToken);
      await refreshReviewQueue(session.accessToken);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to update activity details.",
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function handleUpdateParticipation(
    activity: TripActivity,
    status: TripActivityParticipant["status"],
  ) {
    if (!session) return;
    setBusyAction(`participant:${activity.id}`);
    setMessage(null);

    try {
      const participant = await updateActivityParticipant(
        tripId,
        activity.id,
        session.userId,
        session.accessToken,
        status,
      );
      setActivities((current) =>
        current.map((entry) => {
          if (entry.id !== activity.id) return entry;
          return {
            ...entry,
            participants: [
              ...entry.participants.filter(
                (item) => item.userId !== participant.userId,
              ),
              participant,
            ],
          };
        }),
      );
      setMessage(`Your RSVP is now ${participant.status}.`);
      await refreshAuditLogs(session.accessToken);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to update RSVP.",
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function handleCreateTransportBooking() {
    if (
      !session ||
      !transportForm.originName.trim() ||
      !transportForm.destinationName.trim()
    )
      return;
    setBusyAction("transport:create");
    setMessage(null);

    const input: CreateTransportBookingInput = {
      activity_id: transportForm.activityId || undefined,
      mode: transportForm.mode,
      provider_name: transportForm.providerName || undefined,
      booking_reference: transportForm.bookingReference || undefined,
      origin_name: transportForm.originName,
      destination_name: transportForm.destinationName,
      departure_at: transportForm.departureAt
        ? new Date(transportForm.departureAt).toISOString()
        : undefined,
      arrival_at: transportForm.arrivalAt
        ? new Date(transportForm.arrivalAt).toISOString()
        : undefined,
      price: transportForm.price ? Number(transportForm.price) : undefined,
      currency: "VND",
      booking_status: transportForm.bookingStatus,
      notes: transportForm.notes || undefined,
      participant_user_ids:
        transportForm.participantUserIds.length > 0
          ? transportForm.participantUserIds
          : undefined,
    };

    try {
      const created = await createTransportBooking(
        tripId,
        session.accessToken,
        input,
      );
      setTransportBookings((current) => [created, ...current]);
      setTransportPriceDrafts((current) => ({
        [created.id]: created.price === null ? "" : String(created.price),
        ...current,
      }));
      setTransportForm({
        activityId: "",
        mode: "train",
        providerName: "",
        bookingReference: "",
        originName: "",
        destinationName: "",
        departureAt: "",
        arrivalAt: "",
        price: "",
        bookingStatus: "planned",
        notes: "",
        participantUserIds: [],
      });
      setMessage(
        `${created.mode} booking from ${created.originName} to ${created.destinationName} added.`,
      );
      await refreshAuditLogs(session.accessToken);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to add transport booking.",
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function handleUpdateTransportStatus(
    booking: TransportBooking,
    bookingStatus: string,
  ) {
    if (!session) return;
    setBusyAction(`transport:${booking.id}`);
    setMessage(null);

    try {
      const updated = await updateTransportBooking(
        tripId,
        booking.id,
        session.accessToken,
        { booking_status: bookingStatus },
      );
      setTransportBookings((current) =>
        current.map((entry) => (entry.id === updated.id ? updated : entry)),
      );
      setMessage(`Transport booking moved to ${updated.bookingStatus}.`);
      await refreshAuditLogs(session.accessToken);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to update transport booking.",
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function handleUpdateTransportPrice(booking: TransportBooking) {
    if (!session) return;
    const price = transportPriceDrafts[booking.id];
    if (!price?.trim()) return;
    setBusyAction(`transport-price:${booking.id}`);
    setMessage(null);

    try {
      const updated = await updateTransportBooking(
        tripId,
        booking.id,
        session.accessToken,
        { price: Number(price) },
      );
      setTransportBookings((current) =>
        current.map((entry) => (entry.id === updated.id ? updated : entry)),
      );
      setTransportPriceDrafts((current) => ({
        ...current,
        [updated.id]: updated.price === null ? "" : String(updated.price),
      }));
      setMessage(
        `Transport price updated to ${formatMoney(updated.price, updated.currency, formattingLocale)}.`,
      );
      await refreshAuditLogs(session.accessToken);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to update transport price.",
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function handleCreateBillUpload() {
    if (
      !session ||
      (!billForm.rawText.trim() &&
        !billForm.storageUrl.trim() &&
        !billForm.totalAmount.trim())
    )
      return;
    setBusyAction("bill:create");
    setMessage(null);

    const input: CreateBillInput = {
      activity_id: billForm.activityId || undefined,
      storage_url: billForm.storageUrl || undefined,
      raw_text: billForm.rawText || undefined,
      total_amount: billForm.totalAmount
        ? Number(billForm.totalAmount)
        : undefined,
      currency: "VND",
      merchant_name: billForm.merchantName || undefined,
      bill_issued_at: billForm.billIssuedAt
        ? new Date(billForm.billIssuedAt).toISOString()
        : undefined,
    };

    try {
      const created = await createBillUpload(
        tripId,
        session.accessToken,
        input,
      );
      setBillUploads((current) => [created, ...current]);
      setBillDrafts((current) => ({
        ...current,
        [created.id]: buildBillDraft(created),
      }));
      setBillForm({
        activityId: "",
        merchantName: "",
        totalAmount: "",
        rawText: "",
        storageUrl: "",
        billIssuedAt: "",
      });
      setExpenseForm((current) => ({
        ...current,
        billUploadId: created.id,
        activityId: created.activityId ?? current.activityId,
        amount: created.totalAmount
          ? String(created.totalAmount)
          : current.amount,
        title: current.title || `${created.merchantName ?? "Trip"} payment`,
      }));
      setMessage(t("Bill captured. You can now create an expense from it."));
      await refreshAuditLogs(session.accessToken);
      await refreshReviewQueue(session.accessToken);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to create bill.",
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function handleUpdateBillStatus(bill: BillUpload, status: string) {
    if (!session) return;
    setBusyAction(`bill:${bill.id}`);
    setMessage(null);

    try {
      const updated = await updateBillUpload(bill.id, session.accessToken, {
        status,
      });
      setBillUploads((current) =>
        current.map((entry) => (entry.id === updated.id ? updated : entry)),
      );
      setBillDrafts((current) => ({
        ...current,
        [updated.id]: buildBillDraft(updated),
      }));
      setMessage(`Bill status moved to ${updated.status}.`);
      await refreshAuditLogs(session.accessToken);
      await refreshReviewQueue(session.accessToken);
      await refreshInsights(session.accessToken);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to update bill.",
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function handleUpdateBillDetails(bill: BillUpload) {
    if (!session) return;
    const draft = billDrafts[bill.id];
    if (!draft) return;
    setBusyAction(`bill-details:${bill.id}`);
    setMessage(null);

    try {
      const updated = await updateBillUpload(bill.id, session.accessToken, {
        activity_id: draft.activityId || undefined,
        merchant_name: draft.merchantName || undefined,
        total_amount: draft.totalAmount ? Number(draft.totalAmount) : undefined,
        currency: draft.currency || "VND",
        raw_text: draft.rawText || undefined,
      });
      setBillUploads((current) =>
        current.map((entry) => (entry.id === updated.id ? updated : entry)),
      );
      setBillDrafts((current) => ({
        ...current,
        [updated.id]: buildBillDraft(updated),
      }));
      setMessage(`Bill "${updated.merchantName ?? updated.id}" updated.`);
      await refreshAuditLogs(session.accessToken);
      await refreshReviewQueue(session.accessToken);
      await refreshInsights(session.accessToken);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to update bill details.",
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function handleCreateExpense() {
    if (!session || !expenseForm.title.trim() || !expenseForm.amount.trim())
      return;
    if (expenseForm.participantUserIds.length === 0) {
      setMessage(t("Select at least one participant for this expense."));
      return;
    }
    setBusyAction("expense:create");
    setMessage(null);

    const amount = Number(expenseForm.amount);
    const input: CreateExpenseInput = {
      title: expenseForm.title,
      description: expenseForm.description || undefined,
      amount,
      currency: "VND",
      paid_by_user_id: expenseForm.paidByUserId || session.userId,
      activity_id: expenseForm.activityId || undefined,
      bill_upload_id: expenseForm.billUploadId || undefined,
      split_strategy: expenseForm.splitStrategy,
      participant_user_ids: expenseForm.participantUserIds,
      splits:
        expenseForm.splitStrategy === "custom"
          ? members
              .filter(
                (member) =>
                  member.status === "active" &&
                  expenseForm.participantUserIds.includes(member.userId),
              )
              .map((member) => ({
                user_id: member.userId,
                amount: Number(customSplits[member.userId] || 0),
              }))
              .filter((split) => split.amount > 0)
          : undefined,
    };

    try {
      const created = await createExpense(tripId, session.accessToken, input);
      setExpenses((current) => [created, ...current]);
      setExpenseForm({
        title: "",
        description: "",
        amount: "",
        paidByUserId: session.userId,
        activityId: "",
        billUploadId: "",
        splitStrategy: "equal",
        participantUserIds: members
          .filter((member) => member.status === "active")
          .map((member) => member.userId),
      });
      setCustomSplits({});
      setMessage(
        `Expense "${created.title}" created with ${created.splits.length} splits.`,
      );
      await refreshAuditLogs(session.accessToken);
      await refreshReviewQueue(session.accessToken);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to create expense.",
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function handleUpdateExpenseStatus(expense: Expense, status: string) {
    if (!session) return;
    setBusyAction(`expense:${expense.id}`);
    setMessage(null);

    try {
      const updated = await updateExpense(
        tripId,
        expense.id,
        session.accessToken,
        { status },
      );
      setExpenses((current) =>
        current.map((entry) => (entry.id === updated.id ? updated : entry)),
      );
      setMessage(`Expense moved to ${updated.status}.`);
      await refreshAuditLogs(session.accessToken);
      await refreshReviewQueue(session.accessToken);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to update expense.",
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function handleUpdateSplitStatus(
    expense: Expense,
    split: ExpenseSplit,
    status: ExpenseSplitStatus,
  ) {
    if (!session) return;
    setBusyAction(`split:${split.id}`);
    setMessage(null);

    try {
      const updated = await updateExpenseSplitStatus(
        tripId,
        expense.id,
        split.id,
        session.accessToken,
        status,
      );
      setExpenses((current) =>
        current.map((entry) => {
          if (entry.id !== expense.id) return entry;
          return {
            ...entry,
            splits: entry.splits.map((item) =>
              item.id === updated.id ? updated : item,
            ),
          };
        }),
      );
      setMessage(
        `${memberNameByUserId(members, updated.userId)} split is now ${updated.status}.`,
      );
      await refreshAuditLogs(session.accessToken);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to update split.",
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function handleAnalyzeBillUpload(bill: BillUpload) {
    if (!session) return;
    setBusyAction(`bill-analyze:${bill.id}`);
    setMessage(null);

    try {
      const result = await analyzeBillUpload(bill.id, session.accessToken);
      setBillNormalization(result);
      setBillUploads((current) =>
        current.map((entry) =>
          entry.id === result.bill.id ? result.bill : entry,
        ),
      );
      setBillDrafts((current) => ({
        ...current,
        [result.bill.id]: buildBillDraft(result.bill),
      }));
      setExpenseForm((current) => ({
        ...current,
        billUploadId: result.bill.id,
        activityId: result.suggestedExpense.activityId ?? current.activityId,
        amount: result.suggestedExpense.amount
          ? String(result.suggestedExpense.amount)
          : current.amount,
        title: result.suggestedExpense.title,
        splitStrategy: result.suggestedExpense.splitStrategy,
      }));
      setMessage(
        t("OCR worker normalized this bill and prepared a suggested expense."),
      );
      await refreshAuditLogs(session.accessToken);
      await refreshReviewQueue(session.accessToken);
      await refreshInsights(session.accessToken);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to analyze bill.",
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function handleReviewSubmission(
    item: ReviewQueueItem,
    decision: "approved" | "rejected",
  ) {
    if (!session) return;
    setBusyAction(`review:${item.id}:${decision}`);
    setMessage(null);

    try {
      const nextQueue = await reviewSubmission(tripId, session.accessToken, {
        entity_type: item.entityType,
        entity_id: item.entityId,
        decision,
      });
      setReviewQueue(nextQueue);
      await Promise.all([
        refreshActivities(session.accessToken),
        refreshExpenses(session.accessToken),
        refreshAuditLogs(session.accessToken),
        refreshInsights(session.accessToken),
      ]);
      setMessage(`${item.title} ${decision}.`);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to review submission.",
      );
    } finally {
      setBusyAction(null);
    }
  }

  function setMemberDraft(
    userId: string,
    patch: Partial<Pick<TripMember, "role" | "status">>,
  ) {
    setMemberDrafts((current) => ({
      ...current,
      [userId]: {
        role: patch.role ?? current[userId]?.role ?? "viewer",
        status: patch.status ?? current[userId]?.status ?? "active",
      },
    }));
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#d8f1ff_0,#f8f9fa_32%,#fff7ed_100%)] pb-24 text-on-surface">
      <SiteHeader />

      <main
        className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8"
        data-testid="web-trip-workspace"
      >
        <section className="overflow-hidden rounded-[2rem] border border-white/70 bg-surface-container-lowest/85 shadow-[0_24px_80px_rgba(0,93,144,0.12)] backdrop-blur">
          <div className="grid gap-6 p-6 md:grid-cols-[1.5fr_0.8fr] md:p-8">
            <div className="space-y-4">
              <Link
                href="/trips"
                className="text-sm font-bold text-primary hover:underline"
              >
                {" "}
                <UiText id="t88dfddaafa97" fallback="Back to trips" />{" "}
              </Link>
              <div>
                <p className="text-xs font-extrabold uppercase tracking-[0.28em] text-secondary">
                  {" "}
                  <UiText id="t1e4f09113337" fallback="Trip workspace" />{" "}
                </p>
                <h1 className="mt-2 text-3xl font-black tracking-tight text-on-surface md:text-5xl">
                  {" "}
                  <UiText
                    id="tf5c129acfdd8"
                    fallback="Plan together without losing the source of truth."
                  />{" "}
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-on-surface-variant md:text-base">
                  {" "}
                  <UiText
                    id="tf77cb46a3540"
                    fallback="Invite friends, plan activities, track transport, capture bills, settle splits, and keep every important change traceable."
                  />{" "}
                </p>
              </div>
            </div>

            <div className="rounded-3xl bg-primary p-5 text-on-primary shadow-xl">
              <p className="text-xs font-bold uppercase tracking-widest opacity-80">
                {" "}
                <UiText id="ta53069f82d0d" fallback="Current trip" />{" "}
              </p>
              <p
                className="mt-3 break-all font-mono text-sm"
                data-testid="web-workspace-trip-id"
              >
                {tripId}
              </p>
              <span
                className="mt-4 inline-flex rounded-full bg-primary-fixed px-3 py-1 text-xs font-black text-on-primary-fixed-variant"
                data-testid="web-workspace-ownership"
              >
                {activeMember?.role === "host" ? (
                  <UiText
                    id="t11996a9e4d8a"
                    fallback="Personal trip · You own it"
                  />
                ) : (
                  `Shared trip · ${activeMember?.role ?? "guest"}`
                )}
              </span>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <StatCard
                  label={t("Members")}
                  value={members.length.toString()}
                />
                <StatCard
                  label={t("Your role")}
                  value={activeMember?.role ?? "guest"}
                />
              </div>
            </div>
          </div>
        </section>

        {state === "unauthenticated" && (
          <section className="rounded-3xl border border-outline-variant/40 bg-surface p-6 shadow-sm">
            <h2 className="font-headline text-2xl font-black">
              {" "}
              <UiText
                id="tbc5de1ef5d9f"
                fallback="Sign in to manage this trip"
              />{" "}
            </h2>
            <p className="mt-2 text-sm text-on-surface-variant">
              {" "}
              <UiText
                id="ta03094a8ae4d"
                fallback="Workspace actions need an account so every invite, edit, and split can be traced clearly."
              />{" "}
            </p>
            <Link
              href={`/login?redirectTo=/trips/${tripId}/workspace`}
              className="mt-5 inline-flex rounded-full bg-primary px-5 py-3 text-sm font-bold text-on-primary"
              data-testid="web-workspace-signin"
            >
              {" "}
              <UiText id="tada2e9e96fa9" fallback="Sign in" />{" "}
            </Link>
          </section>
        )}

        {state === "loading" && (
          <section className="rounded-3xl border border-outline-variant/40 bg-surface p-6 shadow-sm">
            <p className="text-sm font-bold text-on-surface">
              {" "}
              <UiText
                id="tafcf7623c517"
                fallback="Loading trip workspace..."
              />{" "}
            </p>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-surface-container-high">
              <div className="h-full w-1/2 animate-pulse rounded-full bg-primary" />
            </div>
          </section>
        )}

        {state === "error" && (
          <section className="rounded-3xl border border-error/30 bg-error-container p-6 text-on-error-container">
            <h2 className="font-headline text-xl font-black">
              {" "}
              <UiText
                id="te9220d232cd1"
                fallback="Workspace unavailable"
              />{" "}
            </h2>
            <p className="mt-2 text-sm">
              {message ?? <UiText text="Unable to load this trip." />}
            </p>
          </section>
        )}

        {state === "ready" && (
          <section className="grid grid-cols-1 gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
            <nav className="flex gap-2 overflow-x-auto rounded-3xl border border-outline-variant/30 bg-surface/90 p-2 shadow-sm lg:flex-col">
              {visibleTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`rounded-2xl px-4 py-3 text-left text-sm font-extrabold transition ${
                    activeTab === tab.id
                      ? "bg-primary text-on-primary shadow-md"
                      : "text-on-surface-variant hover:bg-surface-container-high"
                  }`}
                  data-testid={`web-workspace-tab-${tab.id}`}
                >
                  <UiText text={tab.label} />
                  {!tab.ready && (
                    <span className="ml-2 text-[10px] uppercase opacity-70">
                      {" "}
                      <UiText id="t3f934e4f1268" fallback="soon" />{" "}
                    </span>
                  )}
                </button>
              ))}
            </nav>

            <div className="min-w-0">
              {message && (
                <p
                  className="mb-4 rounded-2xl border border-outline-variant/30 bg-surface-container-lowest px-4 py-3 text-sm font-semibold text-on-surface-variant"
                  data-testid="web-workspace-message"
                >
                  <UiText text={message} />
                </p>
              )}

              {activeTab === "overview" && (
                <OverviewPanel
                  members={members}
                  role={activeMember?.role ?? "viewer"}
                  onOpenMembers={() => setActiveTab("members")}
                />
              )}

              {session &&
                (activeTab === "stays" ||
                  activeTab === "dining" ||
                  activeTab === "revisions") && (
                  <JourneyWorkspacePanel
                    key={activeTab}
                    tripId={tripId}
                    token={session.accessToken}
                    section={activeTab}
                    canEdit={Boolean(permissions?.contribute)}
                    canApply={Boolean(permissions?.reviewSubmissions)}
                    onChanged={(plan) => {
                      setSavedPlan(plan);
                      void refreshActivities();
                    }}
                  />
                )}
              {activeTab === "plan" && (
                <SavedAiPlanPanel
                  tripId={tripId}
                  token={session?.accessToken}
                  plan={savedPlan}
                  scheduleActivities={activities}
                  loading={savedPlanLoading}
                  canEdit={canContribute}
                  hasScheduleActivities={activities.length > 0}
                  importing={busyAction === "activity:import-plan"}
                  onImportToSchedule={() => void handleImportSavedPlan()}
                  onOpenSchedule={() => setActiveTab("schedule")}
                />
              )}

              {activeTab === "members" && permissions?.viewMembers && (
                <MembersPanel
                  canManage={canManage}
                  currentUserId={session?.userId ?? null}
                  members={members}
                  memberDrafts={memberDrafts}
                  invite={invite}
                  inviteEmail={inviteEmail}
                  inviteRole={inviteRole}
                  shareLink={shareLink}
                  shareRole={shareRole}
                  busyAction={busyAction}
                  tripId={tripId}
                  onCreateInvite={handleCreateInvite}
                  onEnableShareLink={handleEnableShareLink}
                  onInviteEmailChange={setInviteEmail}
                  onInviteRoleChange={setInviteRole}
                  onShareRoleChange={setShareRole}
                  onMemberDraftChange={setMemberDraft}
                  onUpdateMember={handleUpdateMember}
                />
              )}

              {activeTab === "audit" && permissions?.viewAudit && (
                <AuditPanel
                  logs={visibleAuditLogs}
                  members={members}
                  canManage={canManage}
                />
              )}

              {activeTab === "schedule" && session && (
                <ActivityPlannerPanel
                  activities={activities}
                  hasSavedPlan={Boolean(savedPlan)}
                  catalog={activityCatalog}
                  catalogQuery={catalogQuery}
                  form={activityForm}
                  drafts={activityDrafts}
                  busyAction={busyAction}
                  currentUserId={session.userId}
                  canManage={canManage}
                  canContribute={canContribute}
                  onCatalogQueryChange={setCatalogQuery}
                  onSearchCatalog={() => void refreshActivityCatalog()}
                  onAddCatalogActivity={(item) =>
                    void handleAddCatalogActivity(item)
                  }
                  onFormChange={(patch) =>
                    setActivityForm((current) => ({ ...current, ...patch }))
                  }
                  onDraftChange={(activityId, patch) =>
                    setActivityDrafts((current) => ({
                      ...current,
                      [activityId]: {
                        ...(current[activityId] ?? emptyActivityDraft()),
                        ...patch,
                      },
                    }))
                  }
                  onCreateCustomActivity={() =>
                    void handleCreateCustomActivity()
                  }
                  onUpdateDetails={(activity) =>
                    void handleUpdateActivityDetails(activity)
                  }
                  onUpdateStatus={(activity, status) =>
                    void handleUpdateActivityStatus(activity, status)
                  }
                  onUpdateParticipation={(activity, status) =>
                    void handleUpdateParticipation(activity, status)
                  }
                  onRefresh={() => void refreshActivities()}
                  onReviewItinerary={() => setActiveTab("plan")}
                  onCancelEditing={() => {
                    setActivityDrafts({});
                    setActivityForm({
                      category: "activity",
                      title: "",
                      scheduledAt: "",
                      locationName: "",
                      estimatedCost: "",
                      address: "",
                    });
                    setActiveTab(savedPlan ? "plan" : "overview");
                  }}
                />
              )}

              {activeTab === "transport" && session && (
                <TransportPanel
                  bookings={transportBookings}
                  form={transportForm}
                  members={members}
                  activities={activities}
                  priceDrafts={transportPriceDrafts}
                  busyAction={busyAction}
                  canManage={canManage}
                  canContribute={canContribute}
                  currentUserId={session.userId}
                  onFormChange={(patch) =>
                    setTransportForm((current) => ({ ...current, ...patch }))
                  }
                  onPriceDraftChange={(bookingId, value) =>
                    setTransportPriceDrafts((current) => ({
                      ...current,
                      [bookingId]: value,
                    }))
                  }
                  onCreateBooking={() => void handleCreateTransportBooking()}
                  onUpdateStatus={(booking, status) =>
                    void handleUpdateTransportStatus(booking, status)
                  }
                  onUpdatePrice={(booking) =>
                    void handleUpdateTransportPrice(booking)
                  }
                  onRefresh={() => void refreshTransportBookings()}
                />
              )}

              {activeTab === "bills" && session && permissions?.viewFinance && (
                <BillsPanel
                  activities={activities}
                  billUploads={billUploads}
                  billDrafts={billDrafts}
                  billForm={billForm}
                  expenses={expenses}
                  expenseForm={expenseForm}
                  customSplits={customSplits}
                  members={members}
                  busyAction={busyAction}
                  canManage={canManage}
                  currentUserId={session.userId}
                  onBillFormChange={(patch) =>
                    setBillForm((current) => ({ ...current, ...patch }))
                  }
                  onBillDraftChange={(billId, patch) =>
                    setBillDrafts((current) => ({
                      ...current,
                      [billId]: {
                        ...(current[billId] ?? emptyBillDraft()),
                        ...patch,
                      },
                    }))
                  }
                  onExpenseFormChange={(patch) =>
                    setExpenseForm((current) => ({ ...current, ...patch }))
                  }
                  onCustomSplitChange={(userId, value) =>
                    setCustomSplits((current) => ({
                      ...current,
                      [userId]: value,
                    }))
                  }
                  onCreateBill={() => void handleCreateBillUpload()}
                  onAnalyzeBill={(bill) => void handleAnalyzeBillUpload(bill)}
                  onUpdateBillDetails={(bill) =>
                    void handleUpdateBillDetails(bill)
                  }
                  onUpdateBillStatus={(bill, status) =>
                    void handleUpdateBillStatus(bill, status)
                  }
                  onCreateExpense={() => void handleCreateExpense()}
                  onUpdateExpenseStatus={(expense, status) =>
                    void handleUpdateExpenseStatus(expense, status)
                  }
                  onUpdateSplitStatus={(expense, split, status) =>
                    void handleUpdateSplitStatus(expense, split, status)
                  }
                  onRefreshExpenses={() => void refreshExpenses()}
                />
              )}

              {activeTab === "review" && permissions?.reviewSubmissions && (
                <ReviewPanel
                  items={reviewQueue}
                  canManage={canManage}
                  busyAction={busyAction}
                  onRefresh={() => void refreshReviewQueue()}
                  onReview={(item, decision) =>
                    void handleReviewSubmission(item, decision)
                  }
                />
              )}

              {activeTab === "insights" && (
                <InsightsPanel
                  places={placeRecommendations}
                  transportPrices={transportPriceRecommendations}
                  dataQualitySignals={dataQualitySignals}
                  billNormalization={billNormalization}
                  onRefresh={() => void refreshInsights()}
                />
              )}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function ActivityPlannerPanel(props: {
  activities: TripActivity[];
  hasSavedPlan: boolean;
  catalog: ActivityCatalogItem[];
  catalogQuery: string;
  form: ActivityFormState;
  drafts: Record<string, ActivityDraftState>;
  busyAction: string | null;
  currentUserId: string;
  canManage: boolean;
  canContribute: boolean;
  onCatalogQueryChange: (value: string) => void;
  onSearchCatalog: () => void;
  onAddCatalogActivity: (item: ActivityCatalogItem) => void;
  onFormChange: (patch: Partial<ActivityFormState>) => void;
  onDraftChange: (
    activityId: string,
    patch: Partial<ActivityDraftState>,
  ) => void;
  onCreateCustomActivity: () => void;
  onUpdateDetails: (activity: TripActivity) => void;
  onUpdateStatus: (activity: TripActivity, status: string) => void;
  onUpdateParticipation: (
    activity: TripActivity,
    status: TripActivityParticipant["status"],
  ) => void;
  onRefresh: () => void;
  onReviewItinerary: () => void;
  onCancelEditing: () => void;
}) {
  const { locale: formattingLocale } = useAppLanguage();

  const t = useUiText();

  const groupedActivities = groupActivitiesByDay(
    props.activities,
    formattingLocale,
  );
  const trackableActivities = props.activities.filter(
    (activity) => activity.status !== "cancelled",
  );
  const completedActivities = trackableActivities.filter(
    (activity) => activity.status === "done",
  ).length;
  const progressTotal = trackableActivities.length;
  const progressPercent = progressTotal
    ? Math.round((completedActivities / progressTotal) * 100)
    : 0;
  const nextActivity = [...props.activities]
    .filter((activity) => !["done", "cancelled"].includes(activity.status))
    .sort((left, right) => {
      if (!left.scheduledAt) return 1;
      if (!right.scheduledAt) return -1;
      return left.scheduledAt.localeCompare(right.scheduledAt);
    })[0];

  return (
    <section className="space-y-5" data-testid="web-activity-planner">
      <section
        className="rounded-3xl border border-primary/20 bg-primary-container/25 p-5 shadow-sm"
        data-testid="web-schedule-progress"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-widest text-primary">
              {" "}
              <UiText
                id="td6a758f2bdbb"
                fallback="Follow your edited itinerary"
              />{" "}
            </p>
            <h2 className="mt-2 font-headline text-xl font-black text-on-surface">
              {" "}
              <UiText
                id="tefb91f4683eb"
                fallback="Keep the trip on track"
              />{" "}
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-on-surface-variant">
              {" "}
              <UiText
                id="t7de85296137b"
                fallback="Edit the schedule below, then check off each activity as you complete it. Progress is saved for the shared trip."
              />{" "}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {props.canContribute && (
              <button
                type="button"
                onClick={props.onCancelEditing}
                disabled={Boolean(props.busyAction)}
                className="rounded-full border border-outline-variant bg-surface px-4 py-3 text-sm font-bold disabled:opacity-50"
                data-testid="web-cancel-itinerary-edit"
              >
                <UiText id="cancel_editing" fallback="Cancel editing" />
              </button>
            )}

            {props.hasSavedPlan && props.activities.length > 0 && (
              <button
                type="button"
                onClick={props.onReviewItinerary}
                className="rounded-full border border-primary/40 bg-surface-container-lowest px-4 py-3 text-sm font-bold text-primary transition-colors hover:bg-primary-fixed"
                data-testid="web-review-edited-itinerary"
              >
                {" "}
                <UiText
                  id="t51705fd53a77"
                  fallback="Review updated itinerary"
                />{" "}
              </button>
            )}
            <div className="rounded-2xl bg-surface-container-lowest px-4 py-3 text-right">
              <p
                className="text-2xl font-black text-primary"
                data-testid="web-schedule-progress-count"
              >
                {completedActivities}/{progressTotal}
              </p>
              <p className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">
                {" "}
                <UiText id="t231e564db4cd" fallback="completed" />{" "}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-5 h-3 overflow-hidden rounded-full bg-primary-fixed/70">
          <div
            className="h-full rounded-full bg-primary transition-[width]"
            style={{ width: `${progressPercent}%` }}
            data-testid="web-schedule-progress-bar"
          />
        </div>

        <p className="mt-3 text-sm font-bold text-on-primary-fixed-variant">
          {nextActivity ? (
            `Next up: ${nextActivity.title}${nextActivity.scheduledAt ? ` · ${formatDateTime(nextActivity.scheduledAt, formattingLocale)}` : ""}`
          ) : progressTotal === 0 && props.activities.length > 0 ? (
            <UiText
              id="t5e5303c05cbe"
              fallback="All activities are cancelled. Add or reschedule one to keep tracking the trip."
            />
          ) : props.activities.length > 0 ? (
            <UiText
              id="t2b2ab485705c"
              fallback="Everything on this schedule is complete."
            />
          ) : (
            <UiText
              id="te85c669fd809"
              fallback="Add the saved AI plan to Schedule to start tracking it."
            />
          )}
        </p>
      </section>

      {props.canContribute ? (
        <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
          <div className="rounded-3xl border border-outline-variant/30 bg-surface p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-headline text-xl font-black">
                  {" "}
                  <UiText id="t23efe463d3ea" fallback="Activity catalog" />{" "}
                </h2>
                <p className="mt-1 text-sm text-on-surface-variant">
                  {" "}
                  <UiText
                    id="te90c5114a78c"
                    fallback="Reuse verified places and activities so recommendations get smarter over time."
                  />{" "}
                </p>
              </div>
              <button
                type="button"
                onClick={props.onRefresh}
                className="rounded-full border border-outline-variant px-3 py-2 text-xs font-bold text-on-surface-variant"
              >
                {" "}
                <UiText id="t56e3badc4e6c" fallback="Refresh" />{" "}
              </button>
            </div>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <input
                value={props.catalogQuery}
                onChange={(event) =>
                  props.onCatalogQueryChange(event.target.value)
                }
                placeholder={t("Search cafe, food, workshop...")}
                className="min-w-0 flex-1 rounded-2xl border border-outline-variant/40 bg-surface-container-lowest px-4 py-3 text-sm outline-none focus:border-primary"
                data-testid="web-activity-catalog-search"
              />
              <button
                type="button"
                onClick={props.onSearchCatalog}
                className="rounded-full bg-primary px-5 py-3 text-sm font-bold text-on-primary"
                data-testid="web-activity-catalog-submit"
              >
                {" "}
                <UiText id="tbce06414177f" fallback="Search" />{" "}
              </button>
            </div>

            <div
              className="mt-5 space-y-3"
              data-testid="web-activity-catalog-list"
            >
              {props.catalog.length === 0 && (
                <p className="text-sm text-on-surface-variant">
                  {" "}
                  <UiText
                    id="te9bb64aaee66"
                    fallback="No catalog matches yet."
                  />{" "}
                </p>
              )}
              {props.catalog.map((item) => (
                <article
                  key={item.id}
                  className="rounded-2xl bg-surface-container-low p-4"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-bold text-on-surface">
                        {item.canonicalName}
                      </p>
                      <p className="mt-1 text-xs text-on-surface-variant">
                        <UiText text={item.category} /> ·{" "}
                        {item.citySlug ?? "unknown city"}{" "}
                        <UiText id="t57bf1ade8cfb" fallback="· quality" />{" "}
                        {item.qualityScore}
                      </p>
                      {item.address && (
                        <p className="mt-1 text-xs text-on-surface-variant">
                          {item.address}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => props.onAddCatalogActivity(item)}
                      disabled={props.busyAction === "activity:create"}
                      className="rounded-full bg-secondary px-4 py-2 text-xs font-bold text-on-secondary disabled:opacity-50"
                      data-testid={`web-add-catalog-activity-${item.id}`}
                    >
                      {" "}
                      <UiText id="t61cc55aa0453" fallback="Add" />{" "}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-outline-variant/30 bg-surface p-5 shadow-sm">
            <h2 className="font-headline text-xl font-black">
              {" "}
              <UiText id="tf84b20bfebcb" fallback="Add custom activity" />{" "}
            </h2>
            <p className="mt-1 text-sm text-on-surface-variant">
              {" "}
              <UiText
                id="t13b8229b6c99"
                fallback="User-entered activities can later be normalized back into the shared catalog."
              />{" "}
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <input
                value={props.form.title}
                onChange={(event) =>
                  props.onFormChange({ title: event.target.value })
                }
                placeholder={t("Activity title")}
                className="rounded-2xl border border-outline-variant/40 bg-surface-container-lowest px-4 py-3 text-sm outline-none focus:border-primary sm:col-span-2"
                data-testid="web-custom-activity-title"
              />
              <input
                value={props.form.category}
                onChange={(event) =>
                  props.onFormChange({ category: event.target.value })
                }
                placeholder={t("Category")}
                className="rounded-2xl border border-outline-variant/40 bg-surface-container-lowest px-4 py-3 text-sm outline-none focus:border-primary"
                data-testid="web-custom-activity-category"
              />
              <input
                value={props.form.scheduledAt}
                onChange={(event) =>
                  props.onFormChange({ scheduledAt: event.target.value })
                }
                type="datetime-local"
                className="rounded-2xl border border-outline-variant/40 bg-surface-container-lowest px-4 py-3 text-sm outline-none focus:border-primary"
                data-testid="web-custom-activity-time"
              />
              <input
                value={props.form.locationName}
                onChange={(event) =>
                  props.onFormChange({ locationName: event.target.value })
                }
                placeholder={t("Location name")}
                className="rounded-2xl border border-outline-variant/40 bg-surface-container-lowest px-4 py-3 text-sm outline-none focus:border-primary"
                data-testid="web-custom-activity-location"
              />
              <input
                value={props.form.estimatedCost}
                onChange={(event) =>
                  props.onFormChange({ estimatedCost: event.target.value })
                }
                inputMode="numeric"
                placeholder={t("Estimated cost")}
                className="rounded-2xl border border-outline-variant/40 bg-surface-container-lowest px-4 py-3 text-sm outline-none focus:border-primary"
                data-testid="web-custom-activity-cost"
              />
              <input
                value={props.form.address}
                onChange={(event) =>
                  props.onFormChange({ address: event.target.value })
                }
                placeholder={t("Address")}
                className="rounded-2xl border border-outline-variant/40 bg-surface-container-lowest px-4 py-3 text-sm outline-none focus:border-primary sm:col-span-2"
                data-testid="web-custom-activity-address"
              />
            </div>
            <button
              type="button"
              onClick={props.onCreateCustomActivity}
              disabled={
                !props.form.title.trim() ||
                props.busyAction === "activity:create"
              }
              className="mt-4 rounded-full bg-primary px-5 py-3 text-sm font-bold text-on-primary disabled:cursor-not-allowed disabled:opacity-50"
              data-testid="web-create-custom-activity"
            >
              {" "}
              <UiText id="tf84b20bfebcb" fallback="Add custom activity" />{" "}
            </button>
          </div>
        </div>
      ) : (
        <ReadOnlyNotice>
          {" "}
          <UiText
            id="ta425b5695afc"
            fallback="Viewers can read the schedule and respond to their own RSVP, but cannot add or edit activities."
          />{" "}
        </ReadOnlyNotice>
      )}

      <div className="rounded-3xl border border-outline-variant/30 bg-surface p-5 shadow-sm">
        <h2 className="font-headline text-xl font-black">
          {" "}
          <UiText id="taa824f46a1d8" fallback="Trip schedule" />{" "}
        </h2>
        <p className="mt-1 text-sm text-on-surface-variant">
          {" "}
          <UiText
            id="t9f81b08a310e"
            fallback="Track suggestions, host review status, timing, and participant RSVP."
          />{" "}
        </p>
        <div className="mt-5 space-y-4" data-testid="web-trip-activities-list">
          {props.activities.length === 0 && (
            <p className="rounded-2xl bg-surface-container-low p-4 text-sm text-on-surface-variant">
              {" "}
              <UiText
                id="tf60074dae37e"
                fallback="No activities yet. Add one from the catalog or create a custom entry."
              />{" "}
            </p>
          )}
          {groupedActivities.map((group) => (
            <div
              key={group.key}
              className="space-y-3"
              data-testid={`web-activity-day-${group.key}`}
            >
              <div className="flex items-center gap-3">
                <span className="h-px flex-1 bg-outline-variant/50" />
                <p className="rounded-full bg-primary-container px-3 py-1 text-xs font-black uppercase tracking-widest text-on-primary-container">
                  <UiText text={group.label} />
                </p>
                <span className="h-px flex-1 bg-outline-variant/50" />
              </div>
              {group.activities.map((activity) => {
                const myParticipation = activity.participants.find(
                  (item) => item.userId === props.currentUserId,
                );
                const draft =
                  props.drafts[activity.id] ?? buildActivityDraft(activity);
                const canEdit =
                  props.canContribute &&
                  (props.canManage ||
                    activity.createdByUserId === props.currentUserId);
                const canCheckProgress =
                  props.canContribute &&
                  (props.canManage ||
                    activity.createdByUserId === props.currentUserId);
                const isSavingDetails =
                  props.busyAction === `activity-details:${activity.id}`;
                const isUpdatingStatus =
                  props.busyAction === `activity:${activity.id}`;

                return (
                  <article
                    key={activity.id}
                    className={`rounded-2xl p-4 ${
                      activity.status === "done"
                        ? "border border-primary/30 bg-primary-container/20"
                        : "bg-surface-container-low"
                    }`}
                  >
                    <div className="grid gap-4 lg:grid-cols-[1fr_180px_240px] lg:items-center">
                      <div>
                        <p
                          className={`font-bold ${
                            activity.status === "done"
                              ? "text-on-surface-variant line-through"
                              : "text-on-surface"
                          }`}
                        >
                          {activity.title}
                        </p>
                        <p className="mt-1 text-xs text-on-surface-variant">
                          <UiText text={activity.category} /> ·{" "}
                          <UiText text={activity.status} /> ·{" "}
                          {formatMoney(
                            activity.estimatedCost,
                            activity.currency,
                            formattingLocale,
                          )}
                        </p>
                        <p className="mt-1 text-xs text-on-surface-variant">
                          {activity.locationName ?? (
                            <UiText text="No location" />
                          )}{" "}
                          {activity.address ? `· ${activity.address}` : ""}
                        </p>
                        {activity.scheduledAt && (
                          <p className="mt-1 text-xs font-bold text-primary">
                            {formatDateTime(
                              activity.scheduledAt,
                              formattingLocale,
                            )}
                          </p>
                        )}
                        <p
                          className="mt-2 text-xs font-bold text-secondary"
                          data-testid={`web-activity-participation-${activity.id}`}
                        >
                          {" "}
                          <UiText
                            id="t0dfee7ffe030"
                            fallback="Your RSVP:"
                          />{" "}
                          {myParticipation?.status ?? "not set"}
                        </p>
                      </div>

                      <label
                        className={`flex items-center gap-3 rounded-2xl border px-3 py-2 text-sm font-bold ${
                          activity.status === "done"
                            ? "border-primary/30 bg-primary text-on-primary"
                            : "border-outline-variant/40 bg-surface-container-lowest text-on-surface-variant"
                        } ${!canCheckProgress ? "opacity-60" : ""}`}
                        data-testid={`web-activity-check-label-${activity.id}`}
                      >
                        <input
                          type="checkbox"
                          checked={activity.status === "done"}
                          disabled={!canCheckProgress || isUpdatingStatus}
                          onChange={() =>
                            props.onUpdateStatus(
                              activity,
                              activity.status === "done" ? "scheduled" : "done",
                            )
                          }
                          className="h-4 w-4 accent-primary"
                          data-testid={`web-activity-check-${activity.id}`}
                        />
                        {activity.status === "done" ? (
                          <UiText id="t1798b3ba42ee" fallback="Completed" />
                        ) : (
                          <UiText id="t0911cce79bf0" fallback="Mark done" />
                        )}
                      </label>

                      <select
                        value={activity.status}
                        disabled={
                          !props.canManage ||
                          props.busyAction === `activity:${activity.id}`
                        }
                        onChange={(event) =>
                          props.onUpdateStatus(activity, event.target.value)
                        }
                        className="rounded-2xl border border-outline-variant/40 bg-surface-container-lowest px-3 py-2 text-sm font-bold outline-none focus:border-primary disabled:opacity-60"
                        data-testid={`web-activity-status-${activity.id}`}
                      >
                        {ACTIVITY_STATUS_OPTIONS.map((status) => (
                          <option key={status} value={status}>
                            <UiText text={status} />
                          </option>
                        ))}
                      </select>

                      <div className="flex flex-wrap gap-2">
                        {(["joined", "maybe", "declined"] as const).map(
                          (status) => (
                            <button
                              key={status}
                              type="button"
                              onClick={() =>
                                props.onUpdateParticipation(activity, status)
                              }
                              disabled={
                                props.busyAction ===
                                `participant:${activity.id}`
                              }
                              className={`rounded-full px-3 py-2 text-xs font-bold ${
                                myParticipation?.status === status
                                  ? "bg-primary text-on-primary"
                                  : "border border-outline-variant text-on-surface-variant"
                              }`}
                              data-testid={`web-activity-rsvp-${activity.id}-${status}`}
                            >
                              <UiText text={status} />
                            </button>
                          ),
                        )}
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 rounded-2xl bg-surface-container-lowest p-4 md:grid-cols-2">
                      <input
                        value={draft.title}
                        onChange={(event) =>
                          props.onDraftChange(activity.id, {
                            title: event.target.value,
                          })
                        }
                        disabled={!canEdit}
                        className="rounded-2xl border border-outline-variant/40 bg-surface px-4 py-3 text-sm outline-none focus:border-primary disabled:opacity-60 md:col-span-2"
                        data-testid={`web-activity-edit-title-${activity.id}`}
                      />
                      <input
                        value={draft.scheduledAt}
                        onChange={(event) =>
                          props.onDraftChange(activity.id, {
                            scheduledAt: event.target.value,
                          })
                        }
                        disabled={!canEdit}
                        type="datetime-local"
                        className="rounded-2xl border border-outline-variant/40 bg-surface px-4 py-3 text-sm outline-none focus:border-primary disabled:opacity-60"
                        data-testid={`web-activity-edit-time-${activity.id}`}
                      />
                      <input
                        value={draft.estimatedCost}
                        onChange={(event) =>
                          props.onDraftChange(activity.id, {
                            estimatedCost: event.target.value,
                          })
                        }
                        disabled={!canEdit}
                        inputMode="numeric"
                        placeholder={t("Estimated cost")}
                        className="rounded-2xl border border-outline-variant/40 bg-surface px-4 py-3 text-sm outline-none focus:border-primary disabled:opacity-60"
                        data-testid={`web-activity-edit-cost-${activity.id}`}
                      />
                      <input
                        value={draft.locationName}
                        onChange={(event) =>
                          props.onDraftChange(activity.id, {
                            locationName: event.target.value,
                          })
                        }
                        disabled={!canEdit}
                        placeholder={t("Location")}
                        className="rounded-2xl border border-outline-variant/40 bg-surface px-4 py-3 text-sm outline-none focus:border-primary disabled:opacity-60"
                        data-testid={`web-activity-edit-location-${activity.id}`}
                      />
                      <input
                        value={draft.address}
                        onChange={(event) =>
                          props.onDraftChange(activity.id, {
                            address: event.target.value,
                          })
                        }
                        disabled={!canEdit}
                        placeholder={t("Address")}
                        className="rounded-2xl border border-outline-variant/40 bg-surface px-4 py-3 text-sm outline-none focus:border-primary disabled:opacity-60"
                        data-testid={`web-activity-edit-address-${activity.id}`}
                      />
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() =>
                            props.onDraftChange(
                              activity.id,
                              buildActivityDraft(activity),
                            )
                          }
                          disabled={isSavingDetails}
                          className="rounded-full border border-outline-variant px-4 py-2 text-sm font-bold"
                          data-testid={`web-activity-cancel-details-${activity.id}`}
                        >
                          <UiText
                            id="discard_unsaved_changes"
                            fallback="Discard unsaved changes"
                          />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => props.onUpdateDetails(activity)}
                        disabled={
                          !canEdit || isSavingDetails || !draft.title.trim()
                        }
                        className="rounded-full bg-secondary px-4 py-2 text-xs font-bold text-on-secondary disabled:cursor-not-allowed disabled:opacity-50 md:col-span-2"
                        data-testid={`web-activity-save-details-${activity.id}`}
                      >
                        {isSavingDetails ? (
                          <UiText
                            id="t0cd1d2a3251c"
                            fallback="Saving details..."
                          />
                        ) : canEdit ? (
                          <UiText
                            id="tffbd93f3317d"
                            fallback="Save activity details"
                          />
                        ) : (
                          <UiText
                            id="tfd4da6a8a3b3"
                            fallback="Only host or creator can edit"
                          />
                        )}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function TransportPanel(props: {
  bookings: TransportBooking[];
  form: TransportFormState;
  members: TripMember[];
  activities: TripActivity[];
  priceDrafts: Record<string, string>;
  busyAction: string | null;
  canManage: boolean;
  canContribute: boolean;
  currentUserId: string;
  onFormChange: (patch: Partial<TransportFormState>) => void;
  onPriceDraftChange: (bookingId: string, value: string) => void;
  onCreateBooking: () => void;
  onUpdateStatus: (booking: TransportBooking, status: string) => void;
  onUpdatePrice: (booking: TransportBooking) => void;
  onRefresh: () => void;
}) {
  const { locale: formattingLocale } = useAppLanguage();

  const t = useUiText();

  const activeMembers = props.members.filter(
    (member) => member.status === "active",
  );

  function toggleParticipant(userId: string) {
    const selected = props.form.participantUserIds.includes(userId);
    props.onFormChange({
      participantUserIds: selected
        ? props.form.participantUserIds.filter((entry) => entry !== userId)
        : [...props.form.participantUserIds, userId],
    });
  }

  return (
    <section className="space-y-5" data-testid="web-transport-panel">
      {props.canContribute ? (
        <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
          <div className="rounded-3xl border border-outline-variant/30 bg-surface p-5 shadow-sm">
            <h2 className="font-headline text-xl font-black">
              {" "}
              <UiText id="t1f063e4df760" fallback="Add transport" />{" "}
            </h2>
            <p className="mt-1 text-sm text-on-surface-variant">
              {" "}
              <UiText
                id="ta6503584cca2"
                fallback="Track every movement, from flights and trains to ferry, car, motorbike, bicycle, or walking segments."
              />{" "}
            </p>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <select
                value={props.form.activityId}
                onChange={(event) =>
                  props.onFormChange({ activityId: event.target.value })
                }
                className="rounded-2xl border border-outline-variant/40 bg-surface-container-lowest px-4 py-3 text-sm font-bold outline-none focus:border-primary sm:col-span-2"
                data-testid="web-transport-activity"
              >
                <option value="">
                  {" "}
                  <UiText
                    id="t7cdda9de08c1"
                    fallback="Whole trip transport"
                  />{" "}
                </option>
                {props.activities.map((activity) => (
                  <option key={activity.id} value={activity.id}>
                    {activity.title}
                  </option>
                ))}
              </select>
              <select
                value={props.form.mode}
                onChange={(event) =>
                  props.onFormChange({
                    mode: event.target.value as TransportMode,
                  })
                }
                className="rounded-2xl border border-outline-variant/40 bg-surface-container-lowest px-4 py-3 text-sm font-bold outline-none focus:border-primary"
                data-testid="web-transport-mode"
              >
                {TRANSPORT_MODES.map((mode) => (
                  <option key={mode} value={mode}>
                    <UiText text={transportModeLabel(mode)} />
                  </option>
                ))}
              </select>
              <select
                value={props.form.bookingStatus}
                onChange={(event) =>
                  props.onFormChange({ bookingStatus: event.target.value })
                }
                className="rounded-2xl border border-outline-variant/40 bg-surface-container-lowest px-4 py-3 text-sm font-bold outline-none focus:border-primary"
                data-testid="web-transport-status"
              >
                {TRANSPORT_STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    <UiText text={status} />
                  </option>
                ))}
              </select>
              <input
                value={props.form.providerName}
                onChange={(event) =>
                  props.onFormChange({ providerName: event.target.value })
                }
                placeholder={t("Provider: Vietnam Airlines, VNR, Grab...")}
                className="rounded-2xl border border-outline-variant/40 bg-surface-container-lowest px-4 py-3 text-sm outline-none focus:border-primary"
                data-testid="web-transport-provider"
              />
              <input
                value={props.form.bookingReference}
                onChange={(event) =>
                  props.onFormChange({ bookingReference: event.target.value })
                }
                placeholder={t("Booking/ticket ref")}
                className="rounded-2xl border border-outline-variant/40 bg-surface-container-lowest px-4 py-3 text-sm outline-none focus:border-primary"
                data-testid="web-transport-reference"
              />
              <input
                value={props.form.originName}
                onChange={(event) =>
                  props.onFormChange({ originName: event.target.value })
                }
                placeholder={t("From")}
                className="rounded-2xl border border-outline-variant/40 bg-surface-container-lowest px-4 py-3 text-sm outline-none focus:border-primary"
                data-testid="web-transport-origin"
              />
              <input
                value={props.form.destinationName}
                onChange={(event) =>
                  props.onFormChange({ destinationName: event.target.value })
                }
                placeholder={t("To")}
                className="rounded-2xl border border-outline-variant/40 bg-surface-container-lowest px-4 py-3 text-sm outline-none focus:border-primary"
                data-testid="web-transport-destination"
              />
              <input
                value={props.form.departureAt}
                onChange={(event) =>
                  props.onFormChange({ departureAt: event.target.value })
                }
                type="datetime-local"
                className="rounded-2xl border border-outline-variant/40 bg-surface-container-lowest px-4 py-3 text-sm outline-none focus:border-primary"
                data-testid="web-transport-departure"
              />
              <input
                value={props.form.arrivalAt}
                onChange={(event) =>
                  props.onFormChange({ arrivalAt: event.target.value })
                }
                type="datetime-local"
                className="rounded-2xl border border-outline-variant/40 bg-surface-container-lowest px-4 py-3 text-sm outline-none focus:border-primary"
                data-testid="web-transport-arrival"
              />
              <input
                value={props.form.price}
                onChange={(event) =>
                  props.onFormChange({ price: event.target.value })
                }
                inputMode="numeric"
                placeholder={t("Price in VND")}
                className="rounded-2xl border border-outline-variant/40 bg-surface-container-lowest px-4 py-3 text-sm outline-none focus:border-primary"
                data-testid="web-transport-price"
              />
              <input
                value={props.form.notes}
                onChange={(event) =>
                  props.onFormChange({ notes: event.target.value })
                }
                placeholder={t("Notes: platform, seat, cabin, pickup point...")}
                className="rounded-2xl border border-outline-variant/40 bg-surface-container-lowest px-4 py-3 text-sm outline-none focus:border-primary"
                data-testid="web-transport-notes"
              />
            </div>

            <div
              className="mt-4 rounded-2xl bg-surface-container-low p-4"
              data-testid="web-transport-participant-picker"
            >
              <p className="text-xs font-extrabold uppercase tracking-widest text-primary">
                {" "}
                <UiText id="tcd56e0839d06" fallback="Participants" />{" "}
              </p>
              <p className="mt-1 text-xs text-on-surface-variant">
                {" "}
                <UiText
                  id="t7ae775c99468"
                  fallback="Leave everyone unchecked to include all active members automatically."
                />{" "}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {activeMembers.map((member) => {
                  const checked = props.form.participantUserIds.includes(
                    member.userId,
                  );
                  return (
                    <label
                      key={member.userId}
                      className={`cursor-pointer rounded-full px-3 py-2 text-xs font-bold ${
                        checked
                          ? "bg-primary text-on-primary"
                          : "border border-outline-variant text-on-surface-variant"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleParticipant(member.userId)}
                        className="sr-only"
                        data-testid={`web-transport-participant-${member.userId}`}
                      />
                      {memberDisplayName(member)}
                    </label>
                  );
                })}
              </div>
            </div>

            <button
              type="button"
              onClick={props.onCreateBooking}
              disabled={
                props.busyAction === "transport:create" ||
                !props.form.originName.trim() ||
                !props.form.destinationName.trim()
              }
              className="mt-4 rounded-full bg-primary px-5 py-3 text-sm font-bold text-on-primary disabled:cursor-not-allowed disabled:opacity-50"
              data-testid="web-create-transport"
            >
              {props.busyAction === "transport:create" ? (
                <UiText id="t268c06a28a1b" fallback="Adding..." />
              ) : (
                <UiText id="t1f063e4df760" fallback="Add transport" />
              )}
            </button>
          </div>

          <div className="rounded-3xl border border-outline-variant/30 bg-surface p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-headline text-xl font-black">
                  {" "}
                  <UiText
                    id="tb6c8b6dc3ab3"
                    fallback="Participant scope"
                  />{" "}
                </h2>
                <p className="mt-1 text-sm text-on-surface-variant">
                  {" "}
                  <UiText
                    id="te683b2b98196"
                    fallback="Leave the picker empty for an all-member booking, or choose only the people included in this segment."
                  />{" "}
                </p>
              </div>
              <button
                type="button"
                onClick={props.onRefresh}
                className="rounded-full border border-outline-variant px-3 py-2 text-xs font-bold text-on-surface-variant"
              >
                {" "}
                <UiText id="t56e3badc4e6c" fallback="Refresh" />{" "}
              </button>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              {activeMembers.map((member) => (
                <span
                  key={member.userId}
                  className="rounded-full bg-surface-container-high px-3 py-2 text-xs font-bold"
                >
                  {memberDisplayName(member)} ·{" "}
                  <UiText text={roleLabel(member.role)} />
                </span>
              ))}
            </div>
            <div className="mt-6 rounded-2xl bg-surface-container-low p-4">
              <p className="text-xs font-extrabold uppercase tracking-widest text-secondary">
                {" "}
                <UiText id="t76ff2a4c8e80" fallback="Why this matters" />{" "}
              </p>
              <p className="mt-2 text-sm leading-6 text-on-surface-variant">
                {" "}
                <UiText
                  id="t0cb2ed6e90e9"
                  fallback="Keeping mode, route, provider, price, and ticket status normalized lets the app later compare transport experience and recommend cheaper timing for similar routes."
                />{" "}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <ReadOnlyNotice>
          {" "}
          <UiText
            id="t3dbc7c801a42"
            fallback="Viewers can read routes, booking status, participants, and prices, but cannot add or edit transport."
          />{" "}
        </ReadOnlyNotice>
      )}

      <div className="rounded-3xl border border-outline-variant/30 bg-surface p-5 shadow-sm">
        <h2 className="font-headline text-xl font-black">
          {" "}
          <UiText id="tb279bffeadf5" fallback="Transport bookings" />{" "}
        </h2>
        <p className="mt-1 text-sm text-on-surface-variant">
          {" "}
          <UiText
            id="t119e2758ecc4"
            fallback="Follow each segment from planning to reserved, ticketed, completed, or cancelled."
          />{" "}
        </p>
        <div className="mt-5 space-y-3" data-testid="web-transport-list">
          {props.bookings.length === 0 && (
            <p className="rounded-2xl bg-surface-container-low p-4 text-sm text-on-surface-variant">
              {" "}
              <UiText
                id="t1ec26f146bf0"
                fallback="No transport bookings yet."
              />{" "}
            </p>
          )}
          {props.bookings.map((booking) => {
            const canEdit =
              props.canContribute &&
              (props.canManage ||
                booking.createdByUserId === props.currentUserId);

            return (
              <article
                key={booking.id}
                className="rounded-2xl bg-surface-container-low p-4"
              >
                <div className="grid gap-4 lg:grid-cols-[1fr_180px] lg:items-center">
                  <div>
                    {booking.activityId && (
                      <p className="mb-2 text-xs font-extrabold uppercase tracking-widest text-primary">
                        {" "}
                        <UiText
                          id="td6f2853026b2"
                          fallback="Linked activity:"
                        />{" "}
                        {props.activities.find(
                          (activity) => activity.id === booking.activityId,
                        )?.title ?? booking.activityId}
                      </p>
                    )}
                    <p className="font-bold text-on-surface">
                      <UiText text={transportModeLabel(booking.mode)} /> ·{" "}
                      {booking.originName}{" "}
                      <UiText id="t4374aaee247f" fallback="to" />{" "}
                      {booking.destinationName}
                    </p>
                    <p className="mt-1 text-xs text-on-surface-variant">
                      {booking.providerName ?? <UiText text="No provider" />} ·{" "}
                      {booking.bookingReference ?? (
                        <UiText text="No reference" />
                      )}{" "}
                      ·{" "}
                      {formatMoney(
                        booking.price,
                        booking.currency,
                        formattingLocale,
                      )}
                    </p>
                    <p className="mt-1 text-xs text-on-surface-variant">
                      {booking.departureAt ? (
                        formatDateTime(booking.departureAt, formattingLocale)
                      ) : (
                        <UiText id="t40ecfccddf52" fallback="Departure TBD" />
                      )}
                      {booking.arrivalAt
                        ? ` -> ${formatDateTime(booking.arrivalAt, formattingLocale)}`
                        : ""}
                    </p>
                    <p
                      className="mt-2 text-xs font-bold text-secondary"
                      data-testid={`web-transport-participants-${booking.id}`}
                    >
                      {" "}
                      <UiText
                        id="t317d98447ed3"
                        fallback="Participants:"
                      />{" "}
                      {booking.participantUserIds.length}
                    </p>
                    {booking.notes && (
                      <p className="mt-1 text-xs text-on-surface-variant">
                        {booking.notes}
                      </p>
                    )}
                  </div>
                  <select
                    value={booking.bookingStatus}
                    disabled={
                      !canEdit || props.busyAction === `transport:${booking.id}`
                    }
                    onChange={(event) =>
                      props.onUpdateStatus(booking, event.target.value)
                    }
                    className="rounded-2xl border border-outline-variant/40 bg-surface-container-lowest px-3 py-2 text-sm font-bold outline-none focus:border-primary disabled:opacity-60"
                    data-testid={`web-transport-booking-status-${booking.id}`}
                  >
                    {TRANSPORT_STATUS_OPTIONS.map((status) => (
                      <option key={status} value={status}>
                        <UiText text={status} />
                      </option>
                    ))}
                  </select>
                </div>
                <div className="mt-4 grid gap-2 rounded-2xl bg-surface-container-lowest p-3 sm:grid-cols-[1fr_140px]">
                  <input
                    value={props.priceDrafts[booking.id] ?? ""}
                    onChange={(event) =>
                      props.onPriceDraftChange(booking.id, event.target.value)
                    }
                    disabled={
                      !canEdit ||
                      props.busyAction === `transport-price:${booking.id}`
                    }
                    inputMode="numeric"
                    placeholder={t("Updated price")}
                    className="rounded-2xl border border-outline-variant/40 bg-surface px-4 py-3 text-sm outline-none focus:border-primary disabled:opacity-60"
                    data-testid={`web-transport-price-draft-${booking.id}`}
                  />
                  <button
                    type="button"
                    onClick={() => props.onUpdatePrice(booking)}
                    disabled={
                      !canEdit ||
                      props.busyAction === `transport-price:${booking.id}`
                    }
                    className="rounded-full bg-secondary px-4 py-2 text-xs font-bold text-on-secondary disabled:cursor-not-allowed disabled:opacity-50"
                    data-testid={`web-transport-save-price-${booking.id}`}
                  >
                    {" "}
                    <UiText id="t6a897ddb18fb" fallback="Save price" />{" "}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function BillsPanel(props: {
  activities: TripActivity[];
  billUploads: BillUpload[];
  billDrafts: Record<string, BillDraftState>;
  billForm: BillFormState;
  expenses: Expense[];
  expenseForm: ExpenseFormState;
  customSplits: Record<string, string>;
  members: TripMember[];
  busyAction: string | null;
  canManage: boolean;
  currentUserId: string;
  onBillFormChange: (patch: Partial<BillFormState>) => void;
  onBillDraftChange: (billId: string, patch: Partial<BillDraftState>) => void;
  onExpenseFormChange: (patch: Partial<ExpenseFormState>) => void;
  onCustomSplitChange: (userId: string, value: string) => void;
  onCreateBill: () => void;
  onAnalyzeBill: (bill: BillUpload) => void;
  onUpdateBillDetails: (bill: BillUpload) => void;
  onUpdateBillStatus: (bill: BillUpload, status: string) => void;
  onCreateExpense: () => void;
  onUpdateExpenseStatus: (expense: Expense, status: string) => void;
  onUpdateSplitStatus: (
    expense: Expense,
    split: ExpenseSplit,
    status: ExpenseSplitStatus,
  ) => void;
  onRefreshExpenses: () => void;
}) {
  const { locale: formattingLocale } = useAppLanguage();

  const t = useUiText();

  const activeMembers = props.members.filter(
    (member) => member.status === "active",
  );
  const selectedParticipants = activeMembers.filter((member) =>
    props.expenseForm.participantUserIds.includes(member.userId),
  );
  const customSplitTotal = selectedParticipants.reduce(
    (sum, member) => sum + Number(props.customSplits[member.userId] || 0),
    0,
  );
  const expenseAmount = Number(props.expenseForm.amount || 0);
  const customSplitDelta =
    Math.round((expenseAmount - customSplitTotal) * 100) / 100;
  const equalShare =
    selectedParticipants.length > 0
      ? expenseAmount / selectedParticipants.length
      : 0;

  function toggleExpenseParticipant(userId: string) {
    const isSelected = props.expenseForm.participantUserIds.includes(userId);
    props.onExpenseFormChange({
      participantUserIds: isSelected
        ? props.expenseForm.participantUserIds.filter(
            (entry) => entry !== userId,
          )
        : [...props.expenseForm.participantUserIds, userId],
    });
  }

  return (
    <section className="space-y-5" data-testid="web-bills-panel">
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-3xl border border-outline-variant/30 bg-surface p-5 shadow-sm">
          <h2 className="font-headline text-xl font-black">
            {" "}
            <UiText id="t9daa088e0fe8" fallback="Capture bill" />{" "}
          </h2>
          <p className="mt-1 text-sm text-on-surface-variant">
            {" "}
            <UiText
              id="t2b5a4acf97df"
              fallback="Paste OCR text, bill URL, or manual amount now; photo upload can later feed the same bill contract."
            />{" "}
          </p>

          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <select
              value={props.billForm.activityId}
              onChange={(event) =>
                props.onBillFormChange({ activityId: event.target.value })
              }
              className="rounded-2xl border border-outline-variant/40 bg-surface-container-lowest px-4 py-3 text-sm font-bold outline-none focus:border-primary sm:col-span-2"
              data-testid="web-bill-activity"
            >
              <option value="">
                {" "}
                <UiText id="t44a2ce8f6935" fallback="No linked activity" />{" "}
              </option>
              {props.activities.map((activity) => (
                <option key={activity.id} value={activity.id}>
                  {activity.title}
                </option>
              ))}
            </select>
            <input
              value={props.billForm.merchantName}
              onChange={(event) =>
                props.onBillFormChange({ merchantName: event.target.value })
              }
              placeholder={t("Merchant: cafe, hotel, restaurant...")}
              className="rounded-2xl border border-outline-variant/40 bg-surface-container-lowest px-4 py-3 text-sm outline-none focus:border-primary"
              data-testid="web-bill-merchant"
            />
            <input
              value={props.billForm.totalAmount}
              onChange={(event) =>
                props.onBillFormChange({ totalAmount: event.target.value })
              }
              inputMode="numeric"
              placeholder={t("Total amount")}
              className="rounded-2xl border border-outline-variant/40 bg-surface-container-lowest px-4 py-3 text-sm outline-none focus:border-primary"
              data-testid="web-bill-total"
            />
            <input
              value={props.billForm.billIssuedAt}
              onChange={(event) =>
                props.onBillFormChange({ billIssuedAt: event.target.value })
              }
              type="datetime-local"
              className="rounded-2xl border border-outline-variant/40 bg-surface-container-lowest px-4 py-3 text-sm outline-none focus:border-primary"
              data-testid="web-bill-issued-at"
            />
            <input
              value={props.billForm.storageUrl}
              onChange={(event) =>
                props.onBillFormChange({ storageUrl: event.target.value })
              }
              placeholder={t("Bill image/storage URL")}
              className="rounded-2xl border border-outline-variant/40 bg-surface-container-lowest px-4 py-3 text-sm outline-none focus:border-primary"
              data-testid="web-bill-storage-url"
            />
            <textarea
              value={props.billForm.rawText}
              onChange={(event) =>
                props.onBillFormChange({ rawText: event.target.value })
              }
              placeholder={t("Raw OCR or copied bill text")}
              className="min-h-28 rounded-2xl border border-outline-variant/40 bg-surface-container-lowest px-4 py-3 text-sm outline-none focus:border-primary sm:col-span-2"
              data-testid="web-bill-raw-text"
            />
          </div>

          <button
            type="button"
            onClick={props.onCreateBill}
            disabled={
              props.busyAction === "bill:create" ||
              (!props.billForm.rawText.trim() &&
                !props.billForm.storageUrl.trim() &&
                !props.billForm.totalAmount.trim())
            }
            className="mt-4 rounded-full bg-primary px-5 py-3 text-sm font-bold text-on-primary disabled:cursor-not-allowed disabled:opacity-50"
            data-testid="web-create-bill"
          >
            {props.busyAction === "bill:create" ? (
              <UiText id="t59cbbe8e43bf" fallback="Capturing..." />
            ) : (
              <UiText id="t9daa088e0fe8" fallback="Capture bill" />
            )}
          </button>
        </div>

        <div className="rounded-3xl border border-outline-variant/30 bg-surface p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-headline text-xl font-black">
                {" "}
                <UiText id="ta1c472e8af3f" fallback="Create expense" />{" "}
              </h2>
              <p className="mt-1 text-sm text-on-surface-variant">
                {" "}
                <UiText
                  id="t026ae0bc74c0"
                  fallback="Create a payable record from a bill or manual entry, then track who owes what."
                />{" "}
              </p>
            </div>
            <button
              type="button"
              onClick={props.onRefreshExpenses}
              className="rounded-full border border-outline-variant px-3 py-2 text-xs font-bold text-on-surface-variant"
            >
              {" "}
              <UiText id="t56e3badc4e6c" fallback="Refresh" />{" "}
            </button>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input
              value={props.expenseForm.title}
              onChange={(event) =>
                props.onExpenseFormChange({ title: event.target.value })
              }
              placeholder={t("Expense title")}
              className="rounded-2xl border border-outline-variant/40 bg-surface-container-lowest px-4 py-3 text-sm outline-none focus:border-primary sm:col-span-2"
              data-testid="web-expense-title"
            />
            <input
              value={props.expenseForm.amount}
              onChange={(event) =>
                props.onExpenseFormChange({ amount: event.target.value })
              }
              inputMode="numeric"
              placeholder={t("Amount")}
              className="rounded-2xl border border-outline-variant/40 bg-surface-container-lowest px-4 py-3 text-sm outline-none focus:border-primary"
              data-testid="web-expense-amount"
            />
            <select
              value={props.expenseForm.paidByUserId}
              onChange={(event) =>
                props.onExpenseFormChange({ paidByUserId: event.target.value })
              }
              className="rounded-2xl border border-outline-variant/40 bg-surface-container-lowest px-4 py-3 text-sm font-bold outline-none focus:border-primary"
              data-testid="web-expense-paid-by"
            >
              <option value={props.currentUserId}>
                {" "}
                <UiText id="td12efcd33fc2" fallback="Paid by me" />{" "}
              </option>
              {activeMembers
                .filter((member) => member.userId !== props.currentUserId)
                .map((member) => (
                  <option key={member.userId} value={member.userId}>
                    {memberDisplayName(member)}
                  </option>
                ))}
            </select>
            <select
              value={props.expenseForm.activityId}
              onChange={(event) =>
                props.onExpenseFormChange({ activityId: event.target.value })
              }
              className="rounded-2xl border border-outline-variant/40 bg-surface-container-lowest px-4 py-3 text-sm font-bold outline-none focus:border-primary"
              data-testid="web-expense-activity"
            >
              <option value="">
                {" "}
                <UiText id="t2a3c72a395db" fallback="No activity" />{" "}
              </option>
              {props.activities.map((activity) => (
                <option key={activity.id} value={activity.id}>
                  {activity.title}
                </option>
              ))}
            </select>
            <select
              value={props.expenseForm.billUploadId}
              onChange={(event) =>
                props.onExpenseFormChange({ billUploadId: event.target.value })
              }
              className="rounded-2xl border border-outline-variant/40 bg-surface-container-lowest px-4 py-3 text-sm font-bold outline-none focus:border-primary"
              data-testid="web-expense-bill"
            >
              <option value="">
                {" "}
                <UiText id="t64549bc3ac91" fallback="No bill" />{" "}
              </option>
              {props.billUploads.map((bill) => (
                <option key={bill.id} value={bill.id}>
                  {bill.merchantName ?? bill.id} ·{" "}
                  {formatMoney(
                    bill.totalAmount,
                    bill.currency,
                    formattingLocale,
                  )}
                </option>
              ))}
            </select>
            <select
              value={props.expenseForm.splitStrategy}
              onChange={(event) =>
                props.onExpenseFormChange({
                  splitStrategy: event.target
                    .value as ExpenseFormState["splitStrategy"],
                })
              }
              className="rounded-2xl border border-outline-variant/40 bg-surface-container-lowest px-4 py-3 text-sm font-bold outline-none focus:border-primary"
              data-testid="web-expense-split-strategy"
            >
              <option value="equal">
                {" "}
                <UiText id="t3abc69bbdede" fallback="Equal split" />{" "}
              </option>
              <option value="custom">
                {" "}
                <UiText id="t71d63d56226c" fallback="Custom split" />{" "}
              </option>
            </select>
            <input
              value={props.expenseForm.description}
              onChange={(event) =>
                props.onExpenseFormChange({ description: event.target.value })
              }
              placeholder={t("Description")}
              className="rounded-2xl border border-outline-variant/40 bg-surface-container-lowest px-4 py-3 text-sm outline-none focus:border-primary sm:col-span-2"
              data-testid="web-expense-description"
            />
          </div>

          <div
            className="mt-4 rounded-2xl border border-outline-variant/30 bg-surface-container-low p-4"
            data-testid="web-expense-participants"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-extrabold uppercase tracking-widest text-primary">
                  {" "}
                  <UiText
                    id="tff534be80310"
                    fallback="Expense participants"
                  />{" "}
                </p>
                <p
                  className="mt-1 text-sm font-bold text-on-surface"
                  data-testid="web-expense-participant-count"
                >
                  {selectedParticipants.length}{" "}
                  <UiText id="tde04fa0e29f9" fallback="of" />{" "}
                  {activeMembers.length}{" "}
                  <UiText id="t835f3b50e337" fallback="selected" />{" "}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() =>
                    props.onExpenseFormChange({
                      participantUserIds: activeMembers.map(
                        (member) => member.userId,
                      ),
                    })
                  }
                  className="rounded-full border border-primary px-3 py-1.5 text-xs font-bold text-primary"
                  data-testid="web-expense-participants-all"
                >
                  {" "}
                  <UiText id="t913afff1faf7" fallback="Select all" />{" "}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    props.onExpenseFormChange({ participantUserIds: [] })
                  }
                  className="rounded-full border border-outline-variant px-3 py-1.5 text-xs font-bold text-on-surface-variant"
                  data-testid="web-expense-participants-clear"
                >
                  {" "}
                  <UiText id="t719ea396ad92" fallback="Clear" />{" "}
                </button>
              </div>
            </div>

            <p className="mt-2 text-xs leading-5 text-on-surface-variant">
              {" "}
              <UiText
                id="tb04c21a4c551"
                fallback="Only selected travelers will receive a split for this bill."
              />{" "}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {activeMembers.map((member) => {
                const checked = props.expenseForm.participantUserIds.includes(
                  member.userId,
                );
                return (
                  <label
                    key={member.userId}
                    className={`cursor-pointer rounded-full px-3 py-2 text-xs font-bold transition ${
                      checked
                        ? "bg-primary text-on-primary"
                        : "border border-outline-variant bg-surface-container-lowest text-on-surface-variant"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleExpenseParticipant(member.userId)}
                      className="sr-only"
                      data-testid={`web-expense-participant-${member.userId}`}
                    />
                    {memberDisplayName(member)}
                  </label>
                );
              })}
            </div>

            {selectedParticipants.length === 0 ? (
              <p className="mt-3 text-xs font-bold text-error">
                {" "}
                <UiText
                  id="tbf6a03969de9"
                  fallback="Select at least one traveler before creating the expense."
                />{" "}
              </p>
            ) : (
              props.expenseForm.splitStrategy === "equal" && (
                <p
                  className="mt-3 text-xs font-bold text-secondary"
                  data-testid="web-equal-split-preview"
                >
                  {" "}
                  <UiText
                    id="t5dfd25af26bc"
                    fallback="Equal split preview:"
                  />{" "}
                  {formatMoney(equalShare, "VND", formattingLocale)}{" "}
                  <UiText id="t33e40a9f6b26" fallback="per traveler" />{" "}
                </p>
              )
            )}
          </div>

          {props.expenseForm.splitStrategy === "custom" && (
            <div
              className="mt-4 rounded-2xl bg-surface-container-low p-4"
              data-testid="web-custom-splits"
            >
              <p className="text-xs font-extrabold uppercase tracking-widest text-primary">
                {" "}
                <UiText
                  id="te73e2bb11002"
                  fallback="Custom split amounts"
                />{" "}
              </p>
              <p
                className="mt-2 text-xs font-bold text-on-surface-variant"
                data-testid="web-custom-split-summary"
              >
                {" "}
                <UiText id="tb9a0927821d6" fallback="Split total" />{" "}
                {formatMoney(customSplitTotal, "VND", formattingLocale)}{" "}
                <UiText id="t69cbba8ec6a9" fallback="· expense" />{" "}
                {formatMoney(expenseAmount, "VND", formattingLocale)}{" "}
                <UiText id="t66573b3fab05" fallback="· remaining" />{" "}
                {formatMoney(customSplitDelta, "VND", formattingLocale)}
              </p>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {selectedParticipants.map((member) => (
                  <label key={member.userId} className="block">
                    <span className="text-xs font-bold text-on-surface-variant">
                      {memberDisplayName(member)}
                    </span>
                    <input
                      value={props.customSplits[member.userId] ?? ""}
                      onChange={(event) =>
                        props.onCustomSplitChange(
                          member.userId,
                          event.target.value,
                        )
                      }
                      inputMode="numeric"
                      placeholder={t("0")}
                      className="mt-1 w-full rounded-2xl border border-outline-variant/40 bg-surface-container-lowest px-4 py-3 text-sm outline-none focus:border-primary"
                      data-testid={`web-custom-split-${member.userId}`}
                    />
                  </label>
                ))}
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={props.onCreateExpense}
            disabled={
              !props.expenseForm.title.trim() ||
              !props.expenseForm.amount.trim() ||
              props.expenseForm.participantUserIds.length === 0 ||
              props.busyAction === "expense:create"
            }
            className="mt-4 rounded-full bg-secondary px-5 py-3 text-sm font-bold text-on-secondary disabled:cursor-not-allowed disabled:opacity-50"
            data-testid="web-create-expense"
          >
            {props.busyAction === "expense:create" ? (
              <UiText id="t28ea7667d026" fallback="Creating..." />
            ) : (
              <UiText id="ta1c472e8af3f" fallback="Create expense" />
            )}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[0.8fr_1.2fr]">
        <div className="rounded-3xl border border-outline-variant/30 bg-surface p-5 shadow-sm">
          <h2 className="font-headline text-xl font-black">
            {" "}
            <UiText id="t6cf460ec540c" fallback="Captured bills" />{" "}
          </h2>
          <div className="mt-5 space-y-3" data-testid="web-bill-list">
            {props.billUploads.length === 0 && (
              <p className="rounded-2xl bg-surface-container-low p-4 text-sm text-on-surface-variant">
                {" "}
                <UiText
                  id="t3e0f213152c9"
                  fallback="No bills captured in this workspace session yet."
                />{" "}
              </p>
            )}
            {props.billUploads.map((bill) => (
              <article
                key={bill.id}
                className="rounded-2xl bg-surface-container-low p-4"
              >
                <p className="font-bold text-on-surface">
                  {bill.merchantName ?? <UiText text="Unnamed bill" />}
                </p>
                <p className="mt-1 text-xs text-on-surface-variant">
                  {formatMoney(
                    bill.totalAmount,
                    bill.currency,
                    formattingLocale,
                  )}{" "}
                  <UiText id="t451ae22df204" fallback="· Activity:" />{" "}
                  {activityTitle(props.activities, bill.activityId)}
                </p>
                <BillParticipantSummary
                  billId={bill.id}
                  expenses={props.expenses}
                  members={props.members}
                />
                {bill.rawText && (
                  <p className="mt-2 line-clamp-2 text-xs text-on-surface-variant">
                    {bill.rawText}
                  </p>
                )}
                <div className="mt-3 grid gap-2 rounded-2xl bg-surface-container-lowest p-3">
                  <select
                    value={props.billDrafts[bill.id]?.activityId ?? ""}
                    onChange={(event) =>
                      props.onBillDraftChange(bill.id, {
                        activityId: event.target.value,
                      })
                    }
                    className="rounded-2xl border border-outline-variant/40 bg-surface px-3 py-2 text-sm font-bold outline-none focus:border-primary"
                    data-testid={`web-bill-edit-activity-${bill.id}`}
                  >
                    <option value="">
                      {" "}
                      <UiText
                        id="t44a2ce8f6935"
                        fallback="No linked activity"
                      />{" "}
                    </option>
                    {props.activities.map((activity) => (
                      <option key={activity.id} value={activity.id}>
                        {activity.title}
                      </option>
                    ))}
                  </select>
                  <input
                    value={props.billDrafts[bill.id]?.merchantName ?? ""}
                    onChange={(event) =>
                      props.onBillDraftChange(bill.id, {
                        merchantName: event.target.value,
                      })
                    }
                    placeholder={t("Merchant")}
                    className="rounded-2xl border border-outline-variant/40 bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
                    data-testid={`web-bill-edit-merchant-${bill.id}`}
                  />
                  <div className="grid gap-2 sm:grid-cols-[1fr_90px]">
                    <input
                      value={props.billDrafts[bill.id]?.totalAmount ?? ""}
                      onChange={(event) =>
                        props.onBillDraftChange(bill.id, {
                          totalAmount: event.target.value,
                        })
                      }
                      inputMode="numeric"
                      placeholder={t("Total")}
                      className="rounded-2xl border border-outline-variant/40 bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
                      data-testid={`web-bill-edit-total-${bill.id}`}
                    />
                    <input
                      value={props.billDrafts[bill.id]?.currency ?? "VND"}
                      onChange={(event) =>
                        props.onBillDraftChange(bill.id, {
                          currency: event.target.value.toUpperCase(),
                        })
                      }
                      className="rounded-2xl border border-outline-variant/40 bg-surface px-3 py-2 text-sm font-bold outline-none focus:border-primary"
                      data-testid={`web-bill-edit-currency-${bill.id}`}
                    />
                  </div>
                  <textarea
                    value={props.billDrafts[bill.id]?.rawText ?? ""}
                    onChange={(event) =>
                      props.onBillDraftChange(bill.id, {
                        rawText: event.target.value,
                      })
                    }
                    placeholder={t("Raw OCR text")}
                    className="min-h-20 rounded-2xl border border-outline-variant/40 bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
                    data-testid={`web-bill-edit-raw-${bill.id}`}
                  />
                  <button
                    type="button"
                    onClick={() => props.onUpdateBillDetails(bill)}
                    disabled={props.busyAction === `bill-details:${bill.id}`}
                    className="rounded-full bg-secondary px-4 py-2 text-xs font-bold text-on-secondary disabled:cursor-not-allowed disabled:opacity-50"
                    data-testid={`web-bill-save-details-${bill.id}`}
                  >
                    {props.busyAction === `bill-details:${bill.id}` ? (
                      <UiText id="tae7e887517b0" fallback="Saving..." />
                    ) : (
                      <UiText id="t15d35dd4b23d" fallback="Save bill details" />
                    )}
                  </button>
                </div>
                <select
                  value={bill.status}
                  onChange={(event) =>
                    props.onUpdateBillStatus(bill, event.target.value)
                  }
                  disabled={props.busyAction === `bill:${bill.id}`}
                  className="mt-3 w-full rounded-2xl border border-outline-variant/40 bg-surface-container-lowest px-3 py-2 text-sm font-bold outline-none focus:border-primary disabled:opacity-60"
                  data-testid={`web-bill-status-${bill.id}`}
                >
                  {BILL_STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>
                      <UiText text={status} />
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => props.onAnalyzeBill(bill)}
                  disabled={props.busyAction === `bill-analyze:${bill.id}`}
                  className="mt-3 w-full rounded-full bg-primary px-4 py-2 text-xs font-bold text-on-primary disabled:cursor-not-allowed disabled:opacity-50"
                  data-testid={`web-bill-analyze-${bill.id}`}
                >
                  {props.busyAction === `bill-analyze:${bill.id}` ? (
                    <UiText id="t7fb4834e16a4" fallback="Analyzing..." />
                  ) : (
                    <UiText id="t6fbf379d1a36" fallback="Run OCR worker" />
                  )}
                </button>
              </article>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-outline-variant/30 bg-surface p-5 shadow-sm">
          <h2 className="font-headline text-xl font-black">
            {" "}
            <UiText id="td9ff6781c5fb" fallback="Expenses & splits" />{" "}
          </h2>
          <p className="mt-1 text-sm text-on-surface-variant">
            {" "}
            <UiText
              id="t3d57049d7079"
              fallback="Hosts can approve expense records; each participant can settle their split transparently."
            />{" "}
          </p>
          <div className="mt-5 space-y-3" data-testid="web-expense-list">
            {props.expenses.length === 0 && (
              <p className="rounded-2xl bg-surface-container-low p-4 text-sm text-on-surface-variant">
                {" "}
                <UiText id="t149c06e3f613" fallback="No expenses yet." />{" "}
              </p>
            )}
            {props.expenses.map((expense) => (
              <article
                key={expense.id}
                className="rounded-2xl bg-surface-container-low p-4"
              >
                <div className="grid gap-3 lg:grid-cols-[1fr_160px] lg:items-center">
                  <div>
                    <p className="font-bold text-on-surface">{expense.title}</p>
                    <p className="mt-1 text-xs text-on-surface-variant">
                      {formatMoney(
                        expense.amount,
                        expense.currency,
                        formattingLocale,
                      )}{" "}
                      <UiText id="tdf6aa3520ea1" fallback="· paid by" />{" "}
                      {memberNameByUserId(props.members, expense.paidByUserId)}{" "}
                      · {expense.splits.length}{" "}
                      {expense.splits.length === 1 ? (
                        <UiText id="t7a2110450a94" fallback="participant" />
                      ) : (
                        <UiText id="ta94a46cccee0" fallback="participants" />
                      )}{" "}
                      · <UiText text={expense.status} />
                    </p>
                    <p
                      className="mt-1 text-xs font-bold text-primary"
                      data-testid={`web-expense-activity-${expense.id}`}
                    >
                      {" "}
                      <UiText id="tb89297a41c70" fallback="Activity:" />{" "}
                      {activityTitle(props.activities, expense.activityId)}
                    </p>
                  </div>
                  <select
                    value={expense.status}
                    onChange={(event) =>
                      props.onUpdateExpenseStatus(expense, event.target.value)
                    }
                    disabled={
                      !props.canManage ||
                      props.busyAction === `expense:${expense.id}`
                    }
                    className="rounded-2xl border border-outline-variant/40 bg-surface-container-lowest px-3 py-2 text-sm font-bold outline-none focus:border-primary disabled:opacity-60"
                    data-testid={`web-expense-status-${expense.id}`}
                  >
                    {EXPENSE_STATUS_OPTIONS.map((status) => (
                      <option key={status} value={status}>
                        <UiText text={status} />
                      </option>
                    ))}
                  </select>
                </div>

                <div
                  className="mt-4 grid gap-2"
                  data-testid={`web-expense-splits-${expense.id}`}
                >
                  {expense.splits.map((split) => (
                    <div
                      key={split.id}
                      className="grid gap-2 rounded-2xl bg-surface-container-lowest p-3 sm:grid-cols-[1fr_130px_130px] sm:items-center"
                    >
                      <p className="text-sm font-bold text-on-surface">
                        {memberNameByUserId(props.members, split.userId)}
                      </p>
                      <p className="text-sm text-on-surface-variant">
                        {formatMoney(
                          split.amount,
                          expense.currency,
                          formattingLocale,
                        )}
                      </p>
                      <select
                        value={split.status}
                        onChange={(event) =>
                          props.onUpdateSplitStatus(
                            expense,
                            split,
                            event.target.value as ExpenseSplitStatus,
                          )
                        }
                        disabled={
                          props.busyAction === `split:${split.id}` ||
                          (!props.canManage &&
                            split.userId !== props.currentUserId)
                        }
                        className="rounded-2xl border border-outline-variant/40 bg-surface-container-lowest px-3 py-2 text-sm font-bold outline-none focus:border-primary disabled:opacity-60"
                        data-testid={`web-expense-split-status-${split.id}`}
                      >
                        {(
                          ["owed", "settled", "waived"] as ExpenseSplitStatus[]
                        ).map((status) => (
                          <option key={status} value={status}>
                            <UiText text={status} />
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function BillParticipantSummary({
  billId,
  expenses,
  members,
}: {
  billId: string;
  expenses: Expense[];
  members: TripMember[];
}) {
  const participantIds = [
    ...new Set(
      expenses
        .filter((expense) => expense.billUploadId === billId)
        .flatMap((expense) => expense.splits.map((split) => split.userId)),
    ),
  ];

  return (
    <p
      className="mt-2 text-xs font-bold text-primary"
      data-testid={`web-bill-participants-${billId}`}
    >
      {participantIds.length === 0 ? (
        <UiText
          id="t7b0438fea8cb"
          fallback="No expense participants assigned yet."
        />
      ) : (
        `${participantIds.length} ${
          participantIds.length === 1 ? "participant" : "participants"
        }: ${participantIds
          .map((userId) => memberNameByUserId(members, userId))
          .join(", ")}`
      )}
    </p>
  );
}

function ReviewPanel(props: {
  items: ReviewQueueItem[];
  canManage: boolean;
  busyAction: string | null;
  onRefresh: () => void;
  onReview: (item: ReviewQueueItem, decision: "approved" | "rejected") => void;
}) {
  const { locale: formattingLocale } = useAppLanguage();

  return (
    <section className="space-y-5" data-testid="web-review-panel">
      <div className="rounded-3xl border border-outline-variant/30 bg-surface p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="font-headline text-xl font-black">
              {" "}
              <UiText id="t384b7f6eb734" fallback="Host review queue" />{" "}
            </h2>
            <p className="mt-1 text-sm text-on-surface-variant">
              {" "}
              <UiText
                id="t9a7c14e6bebb"
                fallback="Host/co-host reviews activity, bill, expense, and place signals before they become trusted trip data."
              />{" "}
            </p>
          </div>
          <button
            type="button"
            onClick={props.onRefresh}
            className="rounded-full border border-outline-variant px-3 py-2 text-xs font-bold text-on-surface-variant"
            data-testid="web-review-refresh"
          >
            {" "}
            <UiText id="t56e3badc4e6c" fallback="Refresh" />{" "}
          </button>
        </div>

        <div className="mt-5 space-y-3" data-testid="web-review-list">
          {props.items.length === 0 && (
            <p className="rounded-2xl bg-surface-container-low p-4 text-sm text-on-surface-variant">
              {" "}
              <UiText
                id="t0ff94cb6158f"
                fallback="Review queue is clear."
              />{" "}
            </p>
          )}
          {props.items.map((item) => (
            <article
              key={item.id}
              className="rounded-2xl bg-surface-container-low p-4"
            >
              <div className="grid gap-4 lg:grid-cols-[1fr_220px] lg:items-center">
                <div>
                  <p className="text-xs font-extrabold uppercase tracking-widest text-primary">
                    {item.entityType.replace("_", " ")} ·{" "}
                    <UiText text={item.status} />
                  </p>
                  <p className="mt-2 font-bold text-on-surface">{item.title}</p>
                  <p className="mt-1 text-xs text-on-surface-variant">
                    {" "}
                    <UiText id="t046485aa309a" fallback="Submitted by" />{" "}
                    {item.submittedByUserId ?? <UiText text="system" />} ·{" "}
                    {formatMoney(
                      item.amount,
                      item.currency ?? "VND",
                      formattingLocale,
                    )}
                  </p>
                  {item.subtitle && (
                    <p className="mt-1 text-xs text-on-surface-variant">
                      {item.subtitle}
                    </p>
                  )}
                  {item.linkedActivityId && (
                    <p className="mt-1 break-all text-xs font-bold text-secondary">
                      {" "}
                      <UiText id="tb89297a41c70" fallback="Activity:" />{" "}
                      {item.linkedActivityId}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 lg:justify-end">
                  <button
                    type="button"
                    onClick={() => props.onReview(item, "approved")}
                    disabled={
                      !props.canManage ||
                      props.busyAction === `review:${item.id}:approved`
                    }
                    className="rounded-full bg-primary px-4 py-2 text-xs font-bold text-on-primary disabled:cursor-not-allowed disabled:opacity-50"
                    data-testid={`web-review-approve-${item.entityType}-${item.entityId}`}
                  >
                    {" "}
                    <UiText id="t7b2c7f146aba" fallback="Approve" />{" "}
                  </button>
                  <button
                    type="button"
                    onClick={() => props.onReview(item, "rejected")}
                    disabled={
                      !props.canManage ||
                      props.busyAction === `review:${item.id}:rejected`
                    }
                    className="rounded-full border border-error px-4 py-2 text-xs font-bold text-error disabled:cursor-not-allowed disabled:opacity-50"
                    data-testid={`web-review-reject-${item.entityType}-${item.entityId}`}
                  >
                    {" "}
                    <UiText id="t2b03b59293b6" fallback="Reject" />{" "}
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function InsightsPanel(props: {
  places: PlaceRecommendation[];
  transportPrices: TransportPriceRecommendation[];
  dataQualitySignals: DataQualitySignal[];
  billNormalization: BillNormalizationResult | null;
  onRefresh: () => void;
}) {
  const { locale: formattingLocale } = useAppLanguage();

  return (
    <section className="space-y-5" data-testid="web-insights-panel">
      <div className="rounded-3xl border border-outline-variant/30 bg-surface p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="font-headline text-xl font-black">
              {" "}
              <UiText
                id="te9836e9d5cad"
                fallback="Recommendation & data quality"
              />{" "}
            </h2>
            <p className="mt-1 text-sm text-on-surface-variant">
              {" "}
              <UiText
                id="t6f37d9c4e93a"
                fallback="OCR evidence and user submissions become reusable signals only after quality checks catch price changes, renamed places, moved venues, and outdated records."
              />{" "}
            </p>
          </div>
          <button
            type="button"
            onClick={props.onRefresh}
            className="rounded-full border border-outline-variant px-3 py-2 text-xs font-bold text-on-surface-variant"
            data-testid="web-insights-refresh"
          >
            {" "}
            <UiText id="t56e3badc4e6c" fallback="Refresh" />{" "}
          </button>
        </div>
      </div>

      {props.billNormalization && (
        <div className="rounded-3xl border border-primary/20 bg-primary-container p-5 text-on-primary-container shadow-sm">
          <p className="text-xs font-extrabold uppercase tracking-widest">
            {" "}
            <UiText id="t2e5ea442e142" fallback="Last OCR normalization" />{" "}
          </p>
          <h3
            className="mt-2 font-headline text-xl font-black"
            data-testid="web-ocr-merchant"
          >
            {props.billNormalization.extracted.merchantName ?? (
              <UiText text="Unknown merchant" />
            )}
          </h3>
          <p className="mt-1 text-sm">
            {" "}
            <UiText id="t6e7d0b1cad53" fallback="Suggested expense:" />{" "}
            {props.billNormalization.suggestedExpense.title} ·{" "}
            {formatMoney(
              props.billNormalization.suggestedExpense.amount,
              props.billNormalization.suggestedExpense.currency,
              formattingLocale,
            )}
          </p>
          <div className="mt-4 grid gap-2" data-testid="web-ocr-line-items">
            {props.billNormalization.extracted.lineItems.map((item) => (
              <p
                key={`${item.name}-${item.amount}`}
                className="rounded-2xl bg-white/35 px-3 py-2 text-sm font-bold"
              >
                {item.name} ·{" "}
                {formatMoney(
                  item.amount,
                  props.billNormalization?.extracted.currency ?? "VND",
                  formattingLocale,
                )}{" "}
                · {item.category ?? "uncategorized"}
              </p>
            ))}
          </div>
          <p className="mt-4 text-sm" data-testid="web-ocr-place-signal">
            {" "}
            <UiText id="tedd5320c5e11" fallback="Place signal:" />{" "}
            {props.billNormalization.placeSignal.action} ·{" "}
            {props.billNormalization.placeSignal.reason}
          </p>
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-2">
        <div className="rounded-3xl border border-outline-variant/30 bg-surface p-5 shadow-sm">
          <h3 className="font-headline text-xl font-black">
            {" "}
            <UiText id="tb1f68cfdbbc6" fallback="Trusted places" />{" "}
          </h3>
          <div
            className="mt-5 space-y-3"
            data-testid="web-place-recommendations"
          >
            {props.places.map((place) => (
              <article
                key={place.id}
                className="rounded-2xl bg-surface-container-low p-4"
              >
                <p className="font-bold text-on-surface">{place.name}</p>
                <p className="mt-1 text-xs text-on-surface-variant">
                  <UiText text={place.category} /> ·{" "}
                  {place.citySlug ?? <UiText text="unknown" />} ·{" "}
                  {place.priceLevel ?? "price unknown"}
                </p>
                <p className="mt-1 text-xs font-bold text-secondary">
                  {" "}
                  <UiText id="ta60f2c73604f" fallback="Quality" />{" "}
                  {place.qualityScore}
                </p>
                {place.address && (
                  <p className="mt-1 text-xs text-on-surface-variant">
                    {place.address}
                  </p>
                )}
              </article>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-outline-variant/30 bg-surface p-5 shadow-sm">
          <h3 className="font-headline text-xl font-black">
            {" "}
            <UiText id="taefa6cce7f9a" fallback="Transport price timing" />{" "}
          </h3>
          <div
            className="mt-5 space-y-3"
            data-testid="web-transport-price-insights"
          >
            {props.transportPrices.map((price) => (
              <article
                key={price.id}
                className="rounded-2xl bg-surface-container-low p-4"
              >
                <p className="font-bold text-on-surface">
                  <UiText text={transportModeLabel(price.mode)} /> ·{" "}
                  {price.originCity ?? "origin"}{" "}
                  <UiText id="t4374aaee247f" fallback="to" />{" "}
                  {price.destinationCity ?? "destination"}
                </p>
                <p className="mt-1 text-xs text-on-surface-variant">
                  {price.providerName ?? <UiText text="Any provider" />}{" "}
                  <UiText id="tafd02528b35d" fallback="· low" />{" "}
                  {formatMoney(
                    price.minPrice,
                    price.currency,
                    formattingLocale,
                  )}{" "}
                  <UiText id="t567f06cb8107" fallback="· median" />{" "}
                  {formatMoney(
                    price.medianPrice,
                    price.currency,
                    formattingLocale,
                  )}
                </p>
                <p className="mt-1 text-xs font-bold text-secondary">
                  {" "}
                  <UiText id="tdd5862c7ec64" fallback="Best observed" />{" "}
                  {price.bestObservedAt ? (
                    formatDate(price.bestObservedAt, formattingLocale)
                  ) : (
                    <UiText id="t50d8b4a941c2" fallback="unknown" />
                  )}
                </p>
              </article>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-outline-variant/30 bg-surface p-5 shadow-sm">
        <h3 className="font-headline text-xl font-black">
          {" "}
          <UiText id="t987388e789af" fallback="Data quality signals" />{" "}
        </h3>
        <div className="mt-5 space-y-3" data-testid="web-data-quality-signals">
          {props.dataQualitySignals.length === 0 && (
            <p className="rounded-2xl bg-surface-container-low p-4 text-sm text-on-surface-variant">
              {" "}
              <UiText
                id="t6c96ec88561e"
                fallback="No open quality signals yet."
              />{" "}
            </p>
          )}
          {props.dataQualitySignals.map((signal) => (
            <article
              key={signal.id}
              className="rounded-2xl bg-surface-container-low p-4"
            >
              <p className="text-xs font-extrabold uppercase tracking-widest text-primary">
                {signal.signalType.split("_").join(" ")} · {signal.severity}
              </p>
              <p className="mt-2 font-bold text-on-surface">{signal.title}</p>
              <p className="mt-1 text-sm text-on-surface-variant">
                {signal.detail}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/15 p-4">
      <p className="text-[11px] font-bold uppercase tracking-widest opacity-75">
        <UiText text={label} />
      </p>
      <p className="mt-2 text-lg font-black capitalize">{value}</p>
    </div>
  );
}

const ROLE_GUIDE: Array<{
  role: TripMemberRole;
  label: string;
  summary: string;
  abilities: string[];
}> = [
  {
    role: "host",
    label: "Host",
    summary: "Trip owner with protected ownership and full workspace control.",
    abilities: [
      "Manage members and invites",
      "Edit and approve all trip data",
      "View finance, review queue, and audit",
    ],
  },
  {
    role: "co_host",
    label: "Co-host",
    summary:
      "Operational manager with full collaboration control, except over the host.",
    abilities: [
      "Manage non-host members and invites",
      "Edit and approve all trip data",
      "View finance, review queue, and audit",
    ],
  },
  {
    role: "contributor",
    label: "Contributor",
    summary:
      "Active planner who can add trip content without management access.",
    abilities: [
      "View members and trip finances",
      "Add and edit own schedule, transport, bills, and expenses",
      "No invites, approvals, or audit access",
    ],
  },
  {
    role: "viewer",
    label: "Viewer",
    summary: "Read-only traveler with access only to the trip essentials.",
    abilities: [
      "View overview, schedule, transport, and insights",
      "Respond to their own activity RSVP",
      "No member list, finance, editing, review, or audit",
    ],
  },
];

function OverviewPanel({
  members,
  role,
  onOpenMembers,
}: {
  members: TripMember[];
  role: TripMemberRole;
  onOpenMembers: () => void;
}) {
  const t = useUiText();

  const activeMembers = members.filter((member) => member.status === "active");
  const rolePermissions = getTripRolePermissions(role);
  const permissionLabel = rolePermissions.manageMembers
    ? "Manage"
    : rolePermissions.contribute
      ? "Contribute"
      : "View only";
  const permissionDescription = rolePermissions.manageMembers
    ? "You can invite, assign roles, review submissions, and see audit history."
    : rolePermissions.contribute
      ? "You can add and edit your own planning and expense data."
      : "You can read trip essentials and respond to your own RSVP.";

  return (
    <section className="grid gap-4 md:grid-cols-3">
      <InfoCard
        title={t("People")}
        value={`${activeMembers.length} active`}
        description="Host, co-hosts, contributors, and viewers are tracked per trip."
      />
      <InfoCard
        title={t("Permissions")}
        value={t(permissionLabel)}
        description={t(permissionDescription)}
      />
      <InfoCard
        title={t("Your role")}
        value={t(roleLabel(role))}
        description="Navigation and actions are filtered by this trip membership role."
      />
      <div className="rounded-3xl border border-outline-variant/30 bg-surface p-6 md:col-span-3">
        <h2 className="font-headline text-2xl font-black">
          {" "}
          <UiText id="t679a25426e82" fallback="What each role can do" />{" "}
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-on-surface-variant">
          {" "}
          <UiText
            id="t3569874cb3b5"
            fallback="Permissions are enforced by the API and reflected here in the tabs and actions each traveler can access."
          />{" "}
        </p>
        <div
          className="mt-5 grid gap-3 lg:grid-cols-2"
          data-testid="web-role-guide"
        >
          {ROLE_GUIDE.map((item) => {
            const isCurrent = item.role === role;
            return (
              <article
                key={item.role}
                className={`rounded-2xl border p-4 ${
                  isCurrent
                    ? "border-primary bg-primary-container/35"
                    : "border-outline-variant/30 bg-surface-container-low"
                }`}
                data-testid={`web-role-guide-${item.role}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-headline text-lg font-black">
                    <UiText text={item.label} />
                  </h3>
                  {isCurrent && (
                    <span className="rounded-full bg-primary px-3 py-1 text-[11px] font-black uppercase tracking-wider text-on-primary">
                      {" "}
                      <UiText id="t936b000c1476" fallback="Your role" />{" "}
                    </span>
                  )}
                </div>
                <p className="mt-2 text-sm leading-6 text-on-surface-variant">
                  <UiText text={item.summary} />
                </p>
                <ul className="mt-3 space-y-2 text-sm text-on-surface-variant">
                  {item.abilities.map((ability) => (
                    <li key={ability} className="flex gap-2">
                      <span
                        aria-hidden="true"
                        className="font-black text-primary"
                      >
                        ✓
                      </span>
                      <span>
                        <UiText text={ability} />
                      </span>
                    </li>
                  ))}
                </ul>
              </article>
            );
          })}
        </div>
        {rolePermissions.viewMembers && (
          <button
            type="button"
            onClick={onOpenMembers}
            className="mt-5 rounded-full bg-primary px-5 py-3 text-sm font-bold text-on-primary"
            data-testid="web-open-members"
          >
            {rolePermissions.manageMembers ? (
              <UiText id="t0331250c29d5" fallback="Manage members" />
            ) : (
              <UiText id="t4d665681d182" fallback="View members" />
            )}
          </button>
        )}
      </div>
    </section>
  );
}

function InfoCard({
  title,
  value,
  description,
}: {
  title: string;
  value: string;
  description: string;
}) {
  return (
    <article className="rounded-3xl border border-outline-variant/30 bg-surface p-5 shadow-sm">
      <p className="text-xs font-extrabold uppercase tracking-widest text-primary">
        {title}
      </p>
      <p className="mt-3 text-2xl font-black">{value}</p>
      <p className="mt-2 text-sm leading-6 text-on-surface-variant">
        <UiText text={description} />
      </p>
    </article>
  );
}

function ReadOnlyNotice({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-3xl border border-outline-variant/30 bg-surface-container-low p-5 text-sm leading-6 text-on-surface-variant"
      data-testid="web-read-only-notice"
    >
      <p className="text-xs font-extrabold uppercase tracking-widest text-primary">
        {" "}
        <UiText id="tffdcd8d75b35" fallback="Read-only access" />{" "}
      </p>
      <p className="mt-2">{children}</p>
    </div>
  );
}

function roleLabel(role: TripMemberRole): string {
  if (role === "co_host") return "Co-host";
  return role.charAt(0).toUpperCase() + role.slice(1);
}

function memberDisplayName(member: TripMember): string {
  return (
    member.displayName?.trim() ||
    member.email?.split("@")[0] ||
    `Traveler ${member.userId.slice(0, 8)}`
  );
}

function memberNameByUserId(
  members: TripMember[],
  userId: string | null,
): string {
  if (!userId) return "Unknown traveler";
  const member = members.find((entry) => entry.userId === userId);
  return member ? memberDisplayName(member) : `Traveler ${userId.slice(0, 8)}`;
}

function MembersPanel(props: {
  canManage: boolean;
  currentUserId: string | null;
  members: TripMember[];
  memberDrafts: Record<string, Pick<TripMember, "role" | "status">>;
  invite: TripInvite | null;
  inviteEmail: string;
  inviteRole: TripMemberRole;
  shareLink: TripShareLink | null;
  shareRole: TripMemberRole;
  busyAction: string | null;
  tripId: string;
  onCreateInvite: () => void;
  onEnableShareLink: () => void;
  onInviteEmailChange: (value: string) => void;
  onInviteRoleChange: (value: TripMemberRole) => void;
  onShareRoleChange: (value: TripMemberRole) => void;
  onMemberDraftChange: (
    userId: string,
    patch: Partial<Pick<TripMember, "role" | "status">>,
  ) => void;
  onUpdateMember: (member: TripMember) => void;
}) {
  const { locale: formattingLocale } = useAppLanguage();

  const t = useUiText();

  const [copiedValue, setCopiedValue] = useState<string | null>(null);
  const inviteJoinUrl = props.invite
    ? `${getBrowserOrigin()}/trips/join?token=${props.invite.token}&type=invite`
    : "";
  const shareJoinUrl = props.shareLink?.shareToken
    ? `${getBrowserOrigin()}/trips/join?token=${props.shareLink.shareToken}`
    : "";

  async function copyJoinLink(value: string, label: string) {
    await copyText(value);
    setCopiedValue(label);
    window.setTimeout(() => setCopiedValue(null), 1600);
  }

  return (
    <section className="space-y-5">
      {props.canManage ? (
        <div className="grid gap-5 xl:grid-cols-2">
          <div className="rounded-3xl border border-outline-variant/30 bg-surface p-5 shadow-sm">
            <h2 className="font-headline text-xl font-black">
              {" "}
              <UiText id="te705c7bf70b0" fallback="Invite by email" />{" "}
            </h2>
            <p className="mt-1 text-sm text-on-surface-variant">
              {" "}
              <UiText
                id="t952527cd4b7c"
                fallback="Host/co-host can create an auditable invite token."
              />{" "}
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_150px]">
              <input
                value={props.inviteEmail}
                onChange={(event) =>
                  props.onInviteEmailChange(event.target.value)
                }
                disabled={!props.canManage}
                placeholder={t("friend@example.com")}
                className="rounded-2xl border border-outline-variant/40 bg-surface-container-lowest px-4 py-3 text-sm outline-none focus:border-primary"
                data-testid="web-invite-email"
              />
              <select
                value={props.inviteRole}
                onChange={(event) =>
                  props.onInviteRoleChange(event.target.value as TripMemberRole)
                }
                disabled={!props.canManage}
                className="rounded-2xl border border-outline-variant/40 bg-surface-container-lowest px-4 py-3 text-sm font-bold outline-none focus:border-primary"
                data-testid="web-invite-role"
              >
                {ROLE_OPTIONS.filter((role) => role !== "host").map((role) => (
                  <option key={role} value={role}>
                    <UiText text={role} />
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={props.onCreateInvite}
              disabled={!props.canManage || props.busyAction === "invite"}
              className="mt-4 rounded-full bg-primary px-5 py-3 text-sm font-bold text-on-primary disabled:cursor-not-allowed disabled:opacity-50"
              data-testid="web-create-invite"
            >
              {props.busyAction === "invite" ? (
                <UiText id="t28ea7667d026" fallback="Creating..." />
              ) : (
                <UiText id="ta84046224e81" fallback="Create invite" />
              )}
            </button>
            {props.invite && (
              <div className="mt-4 rounded-2xl bg-surface-container-low p-4 text-sm">
                <p className="font-bold text-on-surface">
                  {" "}
                  <UiText id="t12fe31a0fdd6" fallback="Invite token" />{" "}
                </p>
                <p
                  className="mt-1 break-all font-mono text-primary"
                  data-testid="web-invite-token"
                >
                  {props.invite.token}
                </p>
                <p
                  className="mt-2 break-all text-xs text-on-surface-variant"
                  data-testid="web-invite-link"
                >
                  {inviteJoinUrl}
                </p>
                <button
                  type="button"
                  onClick={() => void copyJoinLink(inviteJoinUrl, "invite")}
                  className="mt-3 rounded-full border border-primary px-4 py-2 text-xs font-bold text-primary"
                  data-testid="web-copy-invite-link"
                >
                  {copiedValue === "invite" ? (
                    <UiText id="t762220a92407" fallback="Copied invite link" />
                  ) : (
                    <UiText id="t1cad13c5c44c" fallback="Copy invite link" />
                  )}
                </button>
              </div>
            )}
          </div>

          <div className="rounded-3xl border border-outline-variant/30 bg-surface p-5 shadow-sm">
            <h2 className="font-headline text-xl font-black">
              {" "}
              <UiText id="t3c1362260633" fallback="Share link" />{" "}
            </h2>
            <p className="mt-1 text-sm text-on-surface-variant">
              {" "}
              <UiText
                id="t8b62acbe9cc4"
                fallback="Use this when friends can self-join the group."
              />{" "}
            </p>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <select
                value={props.shareRole}
                onChange={(event) =>
                  props.onShareRoleChange(event.target.value as TripMemberRole)
                }
                disabled={!props.canManage}
                className="rounded-2xl border border-outline-variant/40 bg-surface-container-lowest px-4 py-3 text-sm font-bold outline-none focus:border-primary"
                data-testid="web-share-role"
              >
                {ROLE_OPTIONS.filter(
                  (role) => role === "contributor" || role === "viewer",
                ).map((role) => (
                  <option key={role} value={role}>
                    <UiText text={role} />
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={props.onEnableShareLink}
                disabled={!props.canManage || props.busyAction === "share"}
                className="rounded-full bg-secondary px-5 py-3 text-sm font-bold text-on-secondary disabled:cursor-not-allowed disabled:opacity-50"
                data-testid="web-enable-share"
              >
                {props.busyAction === "share" ? (
                  <UiText id="t2b8e03e688ce" fallback="Enabling..." />
                ) : (
                  <UiText id="t200793a1d577" fallback="Enable share" />
                )}
              </button>
            </div>
            {props.shareLink?.shareToken && (
              <div className="mt-4 rounded-2xl bg-surface-container-low p-4 text-sm">
                <p className="font-bold text-on-surface">
                  {" "}
                  <UiText id="td4afb3fc92b0" fallback="Share token" />{" "}
                </p>
                <p
                  className="mt-1 break-all font-mono text-secondary"
                  data-testid="web-share-token"
                >
                  {props.shareLink.shareToken}
                </p>
                <p
                  className="mt-2 break-all text-xs text-on-surface-variant"
                  data-testid="web-share-link"
                >
                  {shareJoinUrl}
                </p>
                <button
                  type="button"
                  onClick={() => void copyJoinLink(shareJoinUrl, "share")}
                  className="mt-3 rounded-full border border-secondary px-4 py-2 text-xs font-bold text-secondary"
                  data-testid="web-copy-share-link"
                >
                  {copiedValue === "share" ? (
                    <UiText id="t2c9d572ab6ff" fallback="Copied share link" />
                  ) : (
                    <UiText id="tdd71c73b93df" fallback="Copy share link" />
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <ReadOnlyNotice>
          {" "}
          <UiText
            id="t0fc617ce4ce2"
            fallback="Contributors can see who is traveling, but only the host or a co-host can invite people, create share links, or change member roles."
          />{" "}
        </ReadOnlyNotice>
      )}

      <div className="rounded-3xl border border-outline-variant/30 bg-surface p-5 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="font-headline text-xl font-black">
              {" "}
              <UiText id="t3c17c845a553" fallback="Trip members" />{" "}
            </h2>
            <p className="mt-1 text-sm text-on-surface-variant">
              {" "}
              <UiText
                id="teee119f53837"
                fallback="Roles decide who can approve, edit, or only view collaboration data."
              />{" "}
            </p>
          </div>
          {!props.canManage && (
            <span className="rounded-full bg-surface-container-high px-3 py-1 text-xs font-bold text-on-surface-variant">
              {" "}
              <UiText
                id="t77e38dd7f60c"
                fallback="Read-only member list"
              />{" "}
            </span>
          )}
        </div>

        <div
          className="mt-5 divide-y divide-outline-variant/30"
          data-testid="web-members-list"
        >
          {props.members.map((member) => {
            const draft = props.memberDrafts[member.userId] ?? {
              role: member.role,
              status: member.status,
            };
            const isSaving = props.busyAction === `member:${member.userId}`;
            const hasChanges =
              draft.role !== member.role || draft.status !== member.status;

            return (
              <div
                key={member.userId}
                className="grid gap-3 py-4 md:grid-cols-[1.1fr_140px_140px_120px] md:items-center"
              >
                <div>
                  <p className="font-bold text-on-surface">
                    {memberDisplayName(member)}
                    {member.userId === props.currentUserId ? (
                      <UiText id="td385586c79f1" fallback=" (You)" />
                    ) : (
                      ""
                    )}
                  </p>
                  {member.email && (
                    <p className="text-sm text-on-surface-variant">
                      {member.email}
                    </p>
                  )}
                  <p className="text-xs text-on-surface-variant">
                    {" "}
                    <UiText id="t43a1c6266f88" fallback="Joined" />{" "}
                    {formatDate(member.joinedAt, formattingLocale)}
                    {member.invitedByUserId ? (
                      ` · invited by ${
                        member.invitedByDisplayName?.trim() ||
                        member.invitedByEmail ||
                        memberNameByUserId(
                          props.members,
                          member.invitedByUserId,
                        )
                      }`
                    ) : (
                      <UiText
                        id="tded598ac8523"
                        fallback=" · direct ownership"
                      />
                    )}
                  </p>
                </div>
                <select
                  value={draft.role}
                  onChange={(event) =>
                    props.onMemberDraftChange(member.userId, {
                      role: event.target.value as TripMemberRole,
                    })
                  }
                  disabled={!props.canManage || member.role === "host"}
                  className="rounded-2xl border border-outline-variant/40 bg-surface-container-lowest px-3 py-2 text-sm font-bold outline-none focus:border-primary disabled:opacity-60"
                  data-testid={`web-member-role-${member.userId}`}
                >
                  {ROLE_OPTIONS.filter(
                    (role) => member.role === "host" || role !== "host",
                  ).map((role) => (
                    <option key={role} value={role}>
                      <UiText text={role} />
                    </option>
                  ))}
                </select>
                <select
                  value={draft.status}
                  onChange={(event) =>
                    props.onMemberDraftChange(member.userId, {
                      status: event.target.value as TripMemberStatus,
                    })
                  }
                  disabled={!props.canManage || member.role === "host"}
                  className="rounded-2xl border border-outline-variant/40 bg-surface-container-lowest px-3 py-2 text-sm font-bold outline-none focus:border-primary disabled:opacity-60"
                  data-testid={`web-member-status-${member.userId}`}
                >
                  {STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>
                      <UiText text={status} />
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => props.onUpdateMember(member)}
                  disabled={
                    !props.canManage ||
                    !hasChanges ||
                    isSaving ||
                    member.role === "host"
                  }
                  className="rounded-full border border-primary px-4 py-2 text-sm font-bold text-primary disabled:cursor-not-allowed disabled:border-outline-variant disabled:text-outline"
                  data-testid={`web-member-save-${member.userId}`}
                >
                  {isSaving ? (
                    <UiText id="tae7e887517b0" fallback="Saving..." />
                  ) : (
                    <UiText id="tefc007a393f6" fallback="Save" />
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function AuditPanel({
  logs,
  members,
  canManage,
}: {
  logs: TripAuditLog[];
  members: TripMember[];
  canManage: boolean;
}) {
  const { locale: formattingLocale } = useAppLanguage();

  const [entityFilter, setEntityFilter] = useState("all");
  const filteredLogs =
    entityFilter === "all"
      ? logs
      : logs.filter((log) => log.entityType === entityFilter);

  if (!canManage) {
    return (
      <section
        className="rounded-3xl border border-outline-variant/30 bg-surface p-5 shadow-sm"
        data-testid="web-audit-forbidden"
      >
        <p className="text-xs font-extrabold uppercase tracking-widest text-error">
          {" "}
          <UiText id="t9dc8b7cf3ce9" fallback="Restricted audit" />{" "}
        </p>
        <h2 className="mt-2 font-headline text-xl font-black">
          {" "}
          <UiText id="t7f782079edc9" fallback="Host/co-host only" />{" "}
        </h2>
        <p className="mt-2 text-sm leading-6 text-on-surface-variant">
          {" "}
          <UiText
            id="t817ed513fbab"
            fallback="Audit logs include sensitive actor and change history, so viewers can keep using the trip without seeing management history."
          />{" "}
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-3xl border border-outline-variant/30 bg-surface p-5 shadow-sm">
      <div className="grid gap-3 sm:grid-cols-[1fr_220px] sm:items-end">
        <div>
          <h2 className="font-headline text-xl font-black">
            {" "}
            <UiText id="t33de865a8d82" fallback="Audit trail" />{" "}
          </h2>
          <p className="mt-1 text-sm text-on-surface-variant">
            {" "}
            <UiText
              id="t9c8a1478b240"
              fallback="Every collaboration change records actor, target, and time."
            />{" "}
          </p>
        </div>
        <label className="block">
          <span className="text-xs font-extrabold uppercase tracking-widest text-primary">
            {" "}
            <UiText id="t00a979697d8c" fallback="Entity filter" />{" "}
          </span>
          <select
            value={entityFilter}
            onChange={(event) => setEntityFilter(event.target.value)}
            className="mt-1 w-full rounded-2xl border border-outline-variant/40 bg-surface-container-lowest px-3 py-2 text-sm font-bold outline-none focus:border-primary"
            data-testid="web-audit-filter"
          >
            {AUDIT_ENTITY_FILTERS.map((entityType) => (
              <option key={entityType} value={entityType}>
                {entityType === "all" ? (
                  <UiText id="t50914f4260d8" fallback="All entities" />
                ) : (
                  entityType
                )}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="mt-5 space-y-3" data-testid="web-audit-list">
        {filteredLogs.length === 0 && (
          <p className="text-sm text-on-surface-variant">
            {" "}
            <UiText
              id="t2d78fff4afb0"
              fallback="No audit events for this filter."
            />{" "}
          </p>
        )}
        {filteredLogs.map((log) => (
          <article
            key={log.id}
            className="rounded-2xl bg-surface-container-low p-4"
          >
            <p className="text-sm font-black text-on-surface">
              {log.action}{" "}
              <span className="text-on-surface-variant">
                {" "}
                <UiText id="tdb3d405b1067" fallback="on" />{" "}
              </span>{" "}
              {log.entityType}
            </p>
            <p className="mt-1 break-all text-xs text-on-surface-variant">
              {" "}
              <UiText id="tcbd19b5c397e" fallback="Actor" />{" "}
              {log.actorUserId ? (
                memberNameByUserId(members, log.actorUserId)
              ) : (
                <UiText id="t317f1e761f2f" fallback="system" />
              )}{" "}
              <UiText id="t27e90dfa57c3" fallback="at" />{" "}
              {formatDate(log.createdAt, formattingLocale)}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

function toPlanScheduledAt(date: string, time: string): string | undefined {
  if (!date || !time) return undefined;
  const parsed = new Date(`${date} ${time}`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function formatDate(value: string | null, formattingLocale = "en") {
  if (!value) return "unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(formattingLocale, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(value: string, formattingLocale = "en") {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(formattingLocale, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateTimeInput(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatMoney(
  value: number | null,
  currency: string,
  formattingLocale = "en",
) {
  if (value === null) return "cost unknown";
  return new Intl.NumberFormat(formattingLocale, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function transportModeLabel(mode: TransportMode) {
  const labels: Record<TransportMode, string> = {
    flight: "Flight",
    train: "Train",
    bus: "Bus",
    ferry: "Ferry / boat",
    car: "Car",
    motorbike: "Motorbike",
    bicycle: "Bicycle",
    walking: "Walking",
    other: "Other",
  };
  return labels[mode];
}

function emptyActivityDraft(): ActivityDraftState {
  return {
    title: "",
    category: "activity",
    scheduledAt: "",
    locationName: "",
    address: "",
    estimatedCost: "",
  };
}

function buildActivityDraft(activity: TripActivity): ActivityDraftState {
  return {
    title: activity.title,
    category: activity.category,
    scheduledAt: formatDateTimeInput(activity.scheduledAt),
    locationName: activity.locationName ?? "",
    address: activity.address ?? "",
    estimatedCost:
      activity.estimatedCost === null ? "" : String(activity.estimatedCost),
  };
}

function buildActivityDrafts(activities: TripActivity[]) {
  return Object.fromEntries(
    activities.map((activity) => [activity.id, buildActivityDraft(activity)]),
  );
}

function buildTransportPriceDrafts(bookings: TransportBooking[]) {
  return Object.fromEntries(
    bookings.map((booking) => [
      booking.id,
      booking.price === null ? "" : String(booking.price),
    ]),
  );
}

function emptyBillDraft(): BillDraftState {
  return {
    activityId: "",
    merchantName: "",
    totalAmount: "",
    currency: "VND",
    rawText: "",
  };
}

function buildBillDraft(bill: BillUpload): BillDraftState {
  return {
    activityId: bill.activityId ?? "",
    merchantName: bill.merchantName ?? "",
    totalAmount: bill.totalAmount === null ? "" : String(bill.totalAmount),
    currency: bill.currency,
    rawText: bill.rawText ?? "",
  };
}

function activityTitle(activities: TripActivity[], activityId: string | null) {
  if (!activityId) return "No linked activity";
  return (
    activities.find((activity) => activity.id === activityId)?.title ??
    activityId
  );
}

function groupActivitiesByDay(
  activities: TripActivity[],
  formattingLocale = "en",
) {
  const groups = new Map<
    string,
    { key: string; label: string; activities: TripActivity[] }
  >();

  for (const activity of activities) {
    const date = activity.scheduledAt ? new Date(activity.scheduledAt) : null;
    const key =
      date && !Number.isNaN(date.getTime())
        ? localDateKey(date)
        : "unscheduled";
    const label =
      key === "unscheduled"
        ? "Unscheduled"
        : date!.toLocaleDateString(formattingLocale, {
            weekday: "short",
            month: "short",
            day: "numeric",
            year: "numeric",
          });
    const group = groups.get(key) ?? { key, label, activities: [] };
    group.activities.push(activity);
    groups.set(key, group);
  }

  return Array.from(groups.values()).sort((left, right) => {
    if (left.key === "unscheduled") return 1;
    if (right.key === "unscheduled") return -1;
    return left.key.localeCompare(right.key);
  });
}

function getBrowserOrigin() {
  return typeof window === "undefined" ? "" : window.location.origin;
}

async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    const input = document.createElement("input");
    input.value = value;
    document.body.appendChild(input);
    input.select();
    document.execCommand("copy");
    document.body.removeChild(input);
  }
}
