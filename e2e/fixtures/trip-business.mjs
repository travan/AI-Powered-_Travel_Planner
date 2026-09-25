export const businessTripId = "11111111-1111-4111-8111-111111111111";
export const hostUserId = "e2e-user-1";
export const guestUserId = "e2e-user-2";
export const friendUserId = "e2e-user-3";

const membersByTrip = new Map([
  [
    businessTripId,
    [
      buildMember(hostUserId, "host"),
      buildMember(guestUserId, "viewer"),
    ],
  ],
]);

const invites = new Map();
const shareLinks = new Map();
const activitiesByTrip = new Map();
const transportByTrip = new Map();
const billsById = new Map();
const expensesByTrip = new Map();
const auditByTrip = new Map();
let sequence = 0;

export const activityCatalog = [
  {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
    canonicalName: "Hoi An lantern workshop",
    category: "workshop",
    citySlug: "hoi-an",
    address: "Old Town, Hoi An",
    source: "seed",
    qualityScore: 92,
    isOutdated: false,
    lastVerifiedAt: "2026-07-01T00:00:00.000Z",
  },
  {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
    canonicalName: "Da Nang seafood dinner",
    category: "food",
    citySlug: "da-nang",
    address: "Vo Nguyen Giap, Da Nang",
    source: "user_submission",
    qualityScore: 87,
    isOutdated: false,
    lastVerifiedAt: "2026-07-02T00:00:00.000Z",
  },
];

const placeRecommendations = [
  ...activityCatalog.map((item) => ({
    id: item.id,
    name: item.canonicalName,
    category: item.category,
    citySlug: item.citySlug,
    address: item.address,
    priceLevel: item.category === "food" ? "$$" : "$",
    qualityScore: item.qualityScore,
    lastVerifiedAt: item.lastVerifiedAt,
    isOutdated: item.isOutdated,
  })),
  {
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1",
    name: "Son Tra sunrise cafe",
    category: "cafe",
    citySlug: "da-nang",
    address: "Son Tra, Da Nang",
    priceLevel: "$",
    qualityScore: 89,
    lastVerifiedAt: "2026-07-03T00:00:00.000Z",
    isOutdated: false,
  },
  {
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2",
    name: "Old Quarter homestay",
    category: "hotel",
    citySlug: "hoi-an",
    address: "Nguyen Thai Hoc, Hoi An",
    priceLevel: "$$",
    qualityScore: 84,
    lastVerifiedAt: "2026-06-28T00:00:00.000Z",
    isOutdated: false,
  },
  {
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3",
    name: "Renamed riverside bistro",
    category: "food",
    citySlug: "hoi-an",
    address: "Bach Dang, Hoi An",
    priceLevel: "$$",
    qualityScore: 51,
    lastVerifiedAt: "2025-11-01T00:00:00.000Z",
    isOutdated: true,
  },
];

const transportPriceInsights = [
  {
    id: "cccccccc-cccc-4ccc-8ccc-ccccccccccc1",
    mode: "train",
    providerName: "Vietnam Railways",
    originCity: "da-nang",
    destinationCity: "hue",
    currency: "VND",
    minPrice: 110000,
    medianPrice: 180000,
    bestObservedAt: "2026-07-04T02:00:00.000Z",
  },
  {
    id: "cccccccc-cccc-4ccc-8ccc-ccccccccccc2",
    mode: "flight",
    providerName: "Vietnam Airlines",
    originCity: "ho-chi-minh-city",
    destinationCity: "da-nang",
    currency: "VND",
    minPrice: 890000,
    medianPrice: 1450000,
    bestObservedAt: "2026-07-05T03:00:00.000Z",
  },
  {
    id: "cccccccc-cccc-4ccc-8ccc-ccccccccccc3",
    mode: "bus",
    providerName: "Futa Bus Lines",
    originCity: "da-nang",
    destinationCity: "hoi-an",
    currency: "VND",
    minPrice: 90000,
    medianPrice: 120000,
    bestObservedAt: "2026-07-06T01:00:00.000Z",
  },
];

export function resetBusinessFixtures() {
  membersByTrip.set(businessTripId, [buildMember(hostUserId, "host"), buildMember(guestUserId, "viewer")]);
  invites.clear();
  shareLinks.clear();
  activitiesByTrip.clear();
  transportByTrip.clear();
  billsById.clear();
  expensesByTrip.clear();
  auditByTrip.clear();
  sequence = 0;
}

export function listMembers(tripId) {
  return membersByTrip.get(tripId) ?? null;
}

export function getMembership({ tripId, actorUserId }) {
  const member = (membersByTrip.get(tripId) ?? []).find(
    (entry) => entry.userId === actorUserId && entry.status === "active",
  );
  return member
    ? { status: 200, body: member }
    : notFound("Trip membership not found");
}

export function ensureSavedTripMember({ tripId, actorUserId }) {
  return upsertMember(tripId, actorUserId, "host", null);
}

export function listTripsForUser(actorUserId) {
  return Array.from(membersByTrip.entries()).flatMap(([tripId, members]) =>
    members
      .filter(
        (member) =>
          member.userId === actorUserId && member.status === "active",
      )
      .map((member) => ({
        id: tripId,
        title: "Cache City Escape",
        description:
          "A saved itinerary ready for group planning, bookings, and expenses.",
        primary_city_slug: "hoi-an",
        start_date: "2026-04-14",
        end_date: "2026-04-15",
        status: "planning",
        visibility: "private",
        budget: 900,
        currency: "USD",
        role: member.role,
        member_count: members.filter((entry) => entry.status === "active")
          .length,
        activity_count: (activitiesByTrip.get(tripId) ?? []).length,
        checklist_done: 0,
        checklist_total: 0,
        expense_total: (expensesByTrip.get(tripId) ?? []).reduce(
          (sum, expense) => sum + Number(expense.amount ?? 0),
          0,
        ),
        created_at: "2026-07-26T00:00:00.000Z",
      })),
  );
}

export function createInvite({ tripId, actorUserId, body }) {
  if (!canManageTrip(tripId, actorUserId)) return forbidden("Only host or co-host can manage this trip");
  const invite = {
    id: nextUuid("invite"),
    tripId,
    invitedByUserId: actorUserId,
    email: body.email ?? null,
    role: body.role ?? "viewer",
    token: `${tripId.slice(0, 8)}-invite-token`,
    status: "pending",
    expiresAt: "2026-08-01T00:00:00.000Z",
    acceptedByUserId: null,
    acceptedAt: null,
    createdAt: now(),
  };
  invites.set(invite.token, invite);
  audit(tripId, actorUserId, "trip_invite", invite.id, "created", null, invite);
  return { status: 200, body: invite };
}

export function joinInvite({ actorUserId, body }) {
  const invite = invites.get(body.token);
  if (!invite || invite.status !== "pending") return notFound("Invite not found");
  const member = upsertMember(invite.tripId, actorUserId, invite.role, invite.invitedByUserId);
  invite.status = "accepted";
  invite.acceptedByUserId = actorUserId;
  invite.acceptedAt = now();
  audit(invite.tripId, actorUserId, "trip_invite", invite.id, "accepted", null, invite);
  return { status: 200, body: member };
}

export function setShareLink({ tripId, actorUserId, body }) {
  if (!canManageTrip(tripId, actorUserId)) return forbidden("Only host or co-host can manage this trip");
  const link = {
    tripId,
    enabled: body.enabled !== false,
    shareToken: body.enabled === false ? null : `${tripId.slice(0, 8)}-share-token`,
    role: body.role ?? "viewer",
  };
  if (link.enabled) shareLinks.set(link.shareToken, link);
  audit(tripId, actorUserId, "trip", tripId, link.enabled ? "share_link_enabled" : "share_link_disabled", null, link);
  return { status: 200, body: link };
}

export function joinShareLink({ actorUserId, body }) {
  const link = shareLinks.get(body.token);
  if (!link?.enabled) return notFound("Share link not found");
  const member = upsertMember(link.tripId, actorUserId, link.role, null);
  audit(link.tripId, actorUserId, "trip_member", actorUserId, "joined_by_share_link", null, member);
  return { status: 200, body: member };
}

export function updateMember({ tripId, targetUserId, actorUserId, body }) {
  if (!canManageTrip(tripId, actorUserId)) return forbidden("Only host or co-host can manage this trip");
  const members = membersByTrip.get(tripId) ?? [];
  const member = members.find((entry) => entry.userId === targetUserId);
  if (!member) return notFound("Trip member not found");
  const before = structuredClone(member);
  if (body.role) member.role = body.role;
  if (body.status) member.status = body.status;
  audit(tripId, actorUserId, "trip_member", targetUserId, "updated", before, member);
  return { status: 200, body: member };
}

export function searchActivityCatalog({ citySlug, category, q }) {
  const query = (q ?? "").toLowerCase();
  return activityCatalog.filter((item) => {
    if (citySlug && item.citySlug !== citySlug) return false;
    if (category && item.category !== category) return false;
    if (query && !`${item.canonicalName} ${item.address}`.toLowerCase().includes(query)) return false;
    return !item.isOutdated;
  });
}

export function listActivities({ tripId, actorUserId }) {
  if (!isActiveMember(tripId, actorUserId)) return notFound("Trip not found");
  return { status: 200, body: activitiesByTrip.get(tripId) ?? [] };
}

export function createActivity({ tripId, actorUserId, body }) {
  if (!isActiveMember(tripId, actorUserId)) return notFound("Trip not found");
  const activity = {
    id: nextUuid("activity"),
    tripId,
    activityCatalogId: body.activity_catalog_id ?? null,
    title: body.title,
    category: body.category ?? "activity",
    scheduledAt: body.scheduled_at ?? null,
    locationName: body.location_name ?? null,
    address: body.address ?? null,
    estimatedCost: body.estimated_cost ?? null,
    currency: body.currency ?? "VND",
    createdByUserId: actorUserId,
    updatedByUserId: null,
    status: canManageTrip(tripId, actorUserId) ? "approved" : "pending_review",
    createdAt: now(),
    updatedAt: now(),
    participants: [],
  };
  pushMapArray(activitiesByTrip, tripId, activity);
  audit(tripId, actorUserId, "trip_activity", activity.id, "created", null, activity);
  return { status: 200, body: activity };
}

export function updateActivity({ tripId, activityId, actorUserId, body }) {
  if (!isActiveMember(tripId, actorUserId)) return notFound("Trip not found");
  const activity = findById(activitiesByTrip, tripId, activityId);
  if (!activity) return notFound("Activity not found");
  if (activity.createdByUserId !== actorUserId && !canManageTrip(tripId, actorUserId)) {
    return forbidden("Only host/co-host or creator can edit this activity");
  }
  const before = structuredClone(activity);
  Object.assign(activity, camelizeKeys(body), { updatedByUserId: actorUserId, updatedAt: now() });
  audit(tripId, actorUserId, "trip_activity", activity.id, "updated", before, activity);
  return { status: 200, body: activity };
}

export function updateActivityParticipant({ tripId, activityId, targetUserId, actorUserId, body }) {
  if (actorUserId !== targetUserId && !canManageTrip(tripId, actorUserId)) {
    return forbidden("Only host/co-host can update another user's activity participation");
  }
  const activity = findById(activitiesByTrip, tripId, activityId);
  if (!activity) return notFound("Activity not found");
  const participant = {
    activityId,
    userId: targetUserId,
    status: body.status,
    joinedAt: now(),
  };
  activity.participants = activity.participants.filter((entry) => entry.userId !== targetUserId);
  activity.participants.push(participant);
  audit(tripId, actorUserId, "trip_activity_participant", activityId, `participant_${body.status}`, null, participant);
  return { status: 200, body: participant };
}

export function createTransport({ tripId, actorUserId, body }) {
  if (!isActiveMember(tripId, actorUserId)) return notFound("Trip not found");
  const participants = resolveParticipantIds(tripId, body.participant_user_ids);
  if (!participants.ok) return participants;
  const booking = {
    id: nextUuid("transport"),
    tripId,
    activityId: body.activity_id ?? null,
    mode: body.mode,
    providerName: body.provider_name ?? null,
    bookingReference: body.booking_reference ?? null,
    originName: body.origin_name,
    destinationName: body.destination_name,
    departureAt: body.departure_at ?? null,
    arrivalAt: body.arrival_at ?? null,
    price: body.price ?? null,
    currency: body.currency ?? "VND",
    bookingStatus: body.booking_status ?? "planned",
    notes: body.notes ?? null,
    createdByUserId: actorUserId,
    updatedByUserId: null,
    createdAt: now(),
    updatedAt: now(),
    participantUserIds: participants.value,
  };
  pushMapArray(transportByTrip, tripId, booking);
  audit(tripId, actorUserId, "transport_booking", booking.id, "created", null, booking);
  return { status: 200, body: booking };
}

export function listTransport({ tripId, actorUserId }) {
  if (!isActiveMember(tripId, actorUserId)) return notFound("Trip not found");
  return { status: 200, body: transportByTrip.get(tripId) ?? [] };
}

export function updateTransport({ tripId, bookingId, actorUserId, body }) {
  const booking = findById(transportByTrip, tripId, bookingId);
  if (!booking) return notFound("Transport booking not found");
  if (booking.createdByUserId !== actorUserId && !canManageTrip(tripId, actorUserId)) {
    return forbidden("Only host/co-host or creator can edit this transport booking");
  }
  const before = structuredClone(booking);
  Object.assign(booking, camelizeKeys(body), { updatedByUserId: actorUserId, updatedAt: now() });
  if (body.participant_user_ids) {
    const participants = resolveParticipantIds(tripId, body.participant_user_ids);
    if (!participants.ok) return participants;
    booking.participantUserIds = participants.value;
  }
  audit(tripId, actorUserId, "transport_booking", booking.id, "updated", before, booking);
  return { status: 200, body: booking };
}

export function createBill({ tripId, actorUserId, body }) {
  if (!isActiveMember(tripId, actorUserId)) return notFound("Trip not found");
  const bill = {
    id: nextUuid("bill"),
    tripId,
    activityId: body.activity_id ?? null,
    uploadedByUserId: actorUserId,
    status: "draft",
    storageUrl: body.storage_url ?? null,
    rawText: body.raw_text ?? null,
    totalAmount: body.total_amount ?? null,
    currency: body.currency ?? "VND",
    merchantName: body.merchant_name ?? null,
    billIssuedAt: body.bill_issued_at ?? null,
    createdAt: now(),
    updatedAt: now(),
  };
  billsById.set(bill.id, bill);
  audit(tripId, actorUserId, "bill_upload", bill.id, "created", null, bill);
  return { status: 200, body: bill };
}

export function getBill({ billId, actorUserId }) {
  const bill = billsById.get(billId);
  if (!bill || !isActiveMember(bill.tripId, actorUserId)) return notFound("Bill upload not found");
  return { status: 200, body: bill };
}

export function updateBill({ billId, actorUserId, body }) {
  const bill = billsById.get(billId);
  if (!bill) return notFound("Bill upload not found");
  if (bill.uploadedByUserId !== actorUserId && !canManageTrip(bill.tripId, actorUserId)) {
    return forbidden("Only host/co-host or the uploader can edit this bill");
  }
  const before = structuredClone(bill);
  Object.assign(bill, camelizeKeys(body), { updatedAt: now() });
  audit(bill.tripId, actorUserId, "bill_upload", bill.id, "updated", before, bill);
  return { status: 200, body: bill };
}

export function createExpense({ tripId, actorUserId, body }) {
  if (!isActiveMember(tripId, actorUserId)) return notFound("Trip not found");
  const paidByUserId = body.paid_by_user_id ?? actorUserId;
  if (!isActiveMember(tripId, paidByUserId)) return badRequest("Paid-by user must be an active trip member");
  const splits = resolveSplits(tripId, body);
  if (!splits.ok) return splits;
  const expense = {
    id: nextUuid("expense"),
    tripId,
    activityId: body.activity_id ?? null,
    billUploadId: body.bill_upload_id ?? null,
    title: body.title,
    description: body.description ?? null,
    amount: body.amount,
    currency: body.currency ?? "VND",
    paidByUserId,
    createdByUserId: actorUserId,
    updatedByUserId: null,
    status: "pending_review",
    createdAt: now(),
    updatedAt: now(),
    splits: splits.value,
  };
  expense.splits = expense.splits.map((split) => ({ ...split, expenseId: expense.id }));
  pushMapArray(expensesByTrip, tripId, expense);
  audit(tripId, actorUserId, "expense", expense.id, "created", null, expense);
  return { status: 200, body: expense };
}

export function listExpenses({ tripId, actorUserId }) {
  if (!isActiveMember(tripId, actorUserId)) return notFound("Trip not found");
  return { status: 200, body: expensesByTrip.get(tripId) ?? [] };
}

export function updateExpense({ tripId, expenseId, actorUserId, body }) {
  const expense = findById(expensesByTrip, tripId, expenseId);
  if (!expense) return notFound("Expense not found");
  if (expense.createdByUserId !== actorUserId && !canManageTrip(tripId, actorUserId)) {
    return forbidden("Only host/co-host or creator can edit this expense");
  }
  const before = structuredClone(expense);
  Object.assign(expense, camelizeKeys(body), { updatedByUserId: actorUserId, updatedAt: now() });
  if (body.splits) {
    const splits = resolveSplits(tripId, { ...body, amount: body.amount ?? expense.amount });
    if (!splits.ok) return splits;
    expense.splits = splits.value;
  }
  audit(tripId, actorUserId, "expense", expense.id, "updated", before, expense);
  return { status: 200, body: expense };
}

export function updateExpenseSplit({ tripId, expenseId, splitId, actorUserId, body }) {
  const expense = findById(expensesByTrip, tripId, expenseId);
  if (!expense) return notFound("Expense not found");
  const split = expense.splits.find((entry) => entry.id === splitId);
  if (!split) return notFound("Expense split not found");
  if (split.userId !== actorUserId && !canManageTrip(tripId, actorUserId)) {
    return forbidden("Only host/co-host or the split owner can update this split");
  }
  split.status = body.status;
  split.settledAt = body.status === "settled" ? now() : null;
  audit(tripId, actorUserId, "expense_split", split.id, `status_${body.status}`, null, split);
  return { status: 200, body: split };
}

export function listReviewQueue({ tripId, actorUserId }) {
  if (!canManageTrip(tripId, actorUserId)) return forbidden("Only host or co-host can review submissions");
  return { status: 200, body: buildReviewQueue(tripId) };
}

export function reviewSubmission({ tripId, actorUserId, body }) {
  if (!canManageTrip(tripId, actorUserId)) return forbidden("Only host or co-host can review submissions");
  const decision = body.decision === "rejected" ? "rejected" : "approved";
  const entityType = body.entity_type;
  let target = null;

  if (entityType === "activity") target = findById(activitiesByTrip, tripId, body.entity_id);
  if (entityType === "bill") target = Array.from(billsById.values()).find((bill) => bill.tripId === tripId && bill.id === body.entity_id);
  if (entityType === "expense") target = findById(expensesByTrip, tripId, body.entity_id);
  if (entityType === "place_signal") {
    audit(tripId, actorUserId, "place_signal", body.entity_id, `host_${decision}`, null, {
      notes: body.notes ?? null,
      decision,
    });
    return { status: 200, body: buildReviewQueue(tripId).filter((item) => item.entityId !== body.entity_id) };
  }

  if (!target) return notFound("Review target not found");
  const before = structuredClone(target);
  target.status = decision;
  target.updatedByUserId = actorUserId;
  target.updatedAt = now();
  audit(tripId, actorUserId, entityType === "bill" ? "bill_upload" : entityType, target.id, `host_${decision}`, before, target);
  return { status: 200, body: buildReviewQueue(tripId) };
}

export function analyzeBill({ billId, actorUserId }) {
  const bill = billsById.get(billId);
  if (!bill || !isActiveMember(bill.tripId, actorUserId)) return notFound("Bill upload not found");
  const before = structuredClone(bill);
  const extractedAmount = bill.totalAmount ?? extractAmount(bill.rawText) ?? null;
  const extractedMerchant = bill.merchantName ?? extractMerchant(bill.rawText) ?? "Unknown merchant";
  bill.status = "ocr_processed";
  bill.totalAmount = extractedAmount;
  bill.merchantName = extractedMerchant;
  bill.updatedAt = now();
  audit(bill.tripId, actorUserId, "bill_upload", bill.id, "ocr_normalized", before, bill);

  return {
    status: 200,
    body: {
      bill,
      extracted: {
        merchantName: extractedMerchant,
        totalAmount: extractedAmount,
        currency: bill.currency,
        issuedAt: bill.billIssuedAt,
        lineItems: buildLineItems(bill.rawText, extractedAmount),
      },
      suggestedExpense: {
        title: `${extractedMerchant} payment`,
        amount: extractedAmount,
        currency: bill.currency,
        activityId: bill.activityId,
        splitStrategy: "equal",
      },
      placeSignal: {
        canonicalName: extractedMerchant,
        address: inferAddress(bill.rawText),
        category: inferCategory(bill.rawText),
        confidence: 0.86,
        action: "update_existing",
        reason: "Matched merchant name and trip city; price evidence should update the recommendation catalog.",
      },
    },
  };
}

export function listPlaceRecommendations({ citySlug, category, limit = 20 }) {
  return placeRecommendations
    .filter((item) => !item.isOutdated)
    .filter((item) => !citySlug || item.citySlug === citySlug)
    .filter((item) => !category || item.category === category)
    .sort((left, right) => right.qualityScore - left.qualityScore)
    .slice(0, limit)
    .map(({ isOutdated: _isOutdated, ...item }) => item);
}

export function listTransportPriceRecommendations({ mode, originCity, destinationCity, limit = 20 }) {
  return transportPriceInsights
    .filter((item) => !mode || item.mode === mode)
    .filter((item) => !originCity || item.originCity === originCity)
    .filter((item) => !destinationCity || item.destinationCity === destinationCity)
    .slice(0, limit);
}

export function listDataQualitySignals({ tripId, actorUserId }) {
  if (!isActiveMember(tripId, actorUserId)) return notFound("Trip not found");
  const billSignals = Array.from(billsById.values())
    .filter((bill) => bill.tripId === tripId && bill.status === "ocr_processed")
    .map((bill) => ({
      id: nextUuid("signal"),
      signalType: "price_change",
      severity: "medium",
      title: `${bill.merchantName ?? "Merchant"} price evidence`,
      detail: `Observed ${bill.totalAmount ?? "unknown"} ${bill.currency} from a normalized bill.`,
      entityType: "bill_upload",
      entityId: bill.id,
      status: "open",
    }));

  return {
    status: 200,
    body: [
      ...billSignals,
      {
        id: "dddddddd-dddd-4ddd-8ddd-dddddddddd01",
        signalType: "renamed_place",
        severity: "high",
        title: "Possible venue rename at Bach Dang, Hoi An",
        detail: "Same address appeared with a newer merchant name. Keep old record outdated until host confirms.",
        entityType: "place_catalog",
        entityId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3",
        status: "open",
      },
      {
        id: "dddddddd-dddd-4ddd-8ddd-dddddddddd02",
        signalType: "moved_place",
        severity: "medium",
        title: "Cafe address may have changed",
        detail: "User-submitted address differs from the last verified catalog address; review before recommending.",
        entityType: "place_catalog",
        entityId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1",
        status: "open",
      },
    ],
  };
}

export function listAuditLogs({ tripId, actorUserId }) {
  if (!canManageTrip(tripId, actorUserId)) return forbidden("Only host or co-host can manage this trip");
  return { status: 200, body: auditByTrip.get(tripId) ?? [] };
}

function buildReviewQueue(tripId) {
  const activities = (activitiesByTrip.get(tripId) ?? [])
    .filter((activity) => ["pending_review", "rejected"].includes(activity.status))
    .map((activity) => ({
      id: `activity:${activity.id}`,
      entityType: "activity",
      entityId: activity.id,
      title: activity.title,
      subtitle: activity.locationName ?? activity.address,
      status: activity.status,
      submittedByUserId: activity.createdByUserId,
      amount: activity.estimatedCost,
      currency: activity.currency,
      linkedActivityId: activity.id,
      createdAt: activity.createdAt,
    }));

  const bills = Array.from(billsById.values())
    .filter((bill) => bill.tripId === tripId && !["approved", "rejected"].includes(bill.status))
    .map((bill) => ({
      id: `bill:${bill.id}`,
      entityType: "bill",
      entityId: bill.id,
      title: bill.merchantName ?? "Unverified bill",
      subtitle: bill.rawText ? bill.rawText.slice(0, 120) : bill.storageUrl,
      status: bill.status,
      submittedByUserId: bill.uploadedByUserId,
      amount: bill.totalAmount,
      currency: bill.currency,
      linkedActivityId: bill.activityId,
      createdAt: bill.createdAt,
    }));

  const expenses = (expensesByTrip.get(tripId) ?? [])
    .filter((expense) => expense.status === "pending_review")
    .map((expense) => ({
      id: `expense:${expense.id}`,
      entityType: "expense",
      entityId: expense.id,
      title: expense.title,
      subtitle: expense.description,
      status: expense.status,
      submittedByUserId: expense.createdByUserId,
      amount: expense.amount,
      currency: expense.currency,
      linkedActivityId: expense.activityId,
      createdAt: expense.createdAt,
    }));

  return [...activities, ...bills, ...expenses].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

function buildMember(userId, role) {
  const profile = profileForUser(userId);
  return {
    tripId: businessTripId,
    userId,
    displayName: profile.displayName,
    email: profile.email,
    role,
    status: "active",
    invitedByUserId: null,
    invitedByDisplayName: null,
    invitedByEmail: null,
    joinedAt: now(),
  };
}

function canManageTrip(tripId, userId) {
  const member = (membersByTrip.get(tripId) ?? []).find((entry) => entry.userId === userId);
  return member?.status === "active" && ["host", "co_host"].includes(member.role);
}

function isActiveMember(tripId, userId) {
  return (membersByTrip.get(tripId) ?? []).some((entry) => entry.userId === userId && entry.status === "active");
}

function upsertMember(tripId, userId, role, invitedByUserId) {
  const members = membersByTrip.get(tripId) ?? [];
  const existing = members.find((entry) => entry.userId === userId);
  if (existing) {
    existing.role = role;
    existing.status = "active";
    return existing;
  }
  const profile = profileForUser(userId);
  const inviterProfile = invitedByUserId
    ? profileForUser(invitedByUserId)
    : null;
  const member = {
    tripId,
    userId,
    displayName: profile.displayName,
    email: profile.email,
    role,
    status: "active",
    invitedByUserId,
    invitedByDisplayName: inviterProfile?.displayName ?? null,
    invitedByEmail: inviterProfile?.email ?? null,
    joinedAt: now(),
  };
  members.push(member);
  membersByTrip.set(tripId, members);
  return member;
}

function resolveParticipantIds(tripId, requested) {
  const activeUserIds = (membersByTrip.get(tripId) ?? []).filter((member) => member.status === "active").map((member) => member.userId);
  const participants = requested?.length ? requested : activeUserIds;
  const invalid = participants.find((userId) => !activeUserIds.includes(userId));
  return invalid ? badRequest("Every participant must be an active trip member") : { ok: true, value: [...new Set(participants)] };
}

function resolveSplits(tripId, body) {
  const participants = resolveParticipantIds(
    tripId,
    body.participant_user_ids,
  );
  if (!participants.ok) return participants;

  if (body.split_strategy === "custom") {
    const splits = body.splits ?? [];
    const splitUserIds = [...new Set(splits.map((split) => split.user_id))];
    if (
      splitUserIds.length !== participants.value.length ||
      splitUserIds.some((userId) => !participants.value.includes(userId))
    ) {
      return badRequest("Custom splits must match the selected participants");
    }
    const total = Math.round(splits.reduce((sum, split) => sum + split.amount, 0) * 100) / 100;
    if (Math.abs(total - body.amount) > 0.01) return badRequest("Custom split total must equal expense amount");
    return {
      ok: true,
      value: splits.map((split) => ({
        id: nextUuid("split"),
        expenseId: "",
        activityId: body.activity_id ?? null,
        userId: split.user_id,
        amount: split.amount,
        status: "owed",
        settledAt: null,
      })),
    };
  }
  const users = participants.value;
  if (users.length === 0) return badRequest("Select at least one expense participant");
  const amount = Math.round((body.amount / users.length) * 100) / 100;
  return {
    ok: true,
    value: users.map((userId) => ({
      id: nextUuid("split"),
      expenseId: "",
      activityId: body.activity_id ?? null,
      userId,
      amount,
      status: "owed",
      settledAt: null,
    })),
  };
}

function profileForUser(userId) {
  const knownProfiles = {
    [hostUserId]: {
      displayName: "Host Traveler",
      email: "host@example.com",
    },
    [guestUserId]: {
      displayName: "Viewer Traveler",
      email: "viewer@example.com",
    },
    [friendUserId]: {
      displayName: "Friend Traveler",
      email: "friend@example.com",
    },
  };
  if (knownProfiles[userId]) return knownProfiles[userId];

  const readable = userId
    .replace(/^mock-/, "")
    .replace(/[-_.]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .trim();
  return {
    displayName: readable || "E2E Traveler",
    email: `${userId}@e2e.local`,
  };
}

function pushMapArray(map, key, value) {
  const values = map.get(key) ?? [];
  values.push(value);
  map.set(key, values);
}

function findById(map, key, id) {
  return (map.get(key) ?? []).find((entry) => entry.id === id);
}

function audit(tripId, actorUserId, entityType, entityId, action, beforeSnapshot, afterSnapshot) {
  pushMapArray(auditByTrip, tripId, {
    id: nextUuid("audit"),
    tripId,
    actorUserId,
    entityType,
    entityId,
    action,
    beforeSnapshot,
    afterSnapshot,
    createdAt: now(),
  });
}

function camelizeKeys(value) {
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase()), entry])
  );
}

function extractAmount(rawText) {
  const match = rawText?.match(/(?:total|tong|tổng)?\s*([0-9][0-9.,]{3,})\s*(?:vnd|đ|dong)?/i);
  if (!match?.[1]) return null;
  const amount = Number(match[1].replace(/[.,]/g, ""));
  return Number.isFinite(amount) ? amount : null;
}

function extractMerchant(rawText) {
  if (!rawText) return null;
  if (/lantern/i.test(rawText)) return "Hoi An Lantern Studio";
  if (/coffee|cafe/i.test(rawText)) return "Son Tra sunrise cafe";
  if (/hotel|homestay/i.test(rawText)) return "Old Quarter homestay";
  return rawText.split(/\n| bill | total /i)[0]?.trim().slice(0, 80) || null;
}

function buildLineItems(rawText, totalAmount) {
  if (/lantern/i.test(rawText ?? "")) {
    return [
      { name: "Lantern workshop", amount: totalAmount ?? 600000, category: "activity" },
    ];
  }
  if (/coffee|cafe/i.test(rawText ?? "")) {
    return [
      { name: "Coffee and snacks", amount: totalAmount ?? 180000, category: "cafe" },
    ];
  }
  return [
    { name: "Bill total", amount: totalAmount ?? 0, category: null },
  ];
}

function inferAddress(rawText) {
  if (/hoi an/i.test(rawText ?? "")) return "Old Town, Hoi An";
  if (/son tra|da nang/i.test(rawText ?? "")) return "Son Tra, Da Nang";
  return null;
}

function inferCategory(rawText) {
  if (/coffee|cafe/i.test(rawText ?? "")) return "cafe";
  if (/hotel|homestay/i.test(rawText ?? "")) return "hotel";
  if (/dinner|restaurant|food/i.test(rawText ?? "")) return "food";
  return "activity";
}

function nextUuid(prefix) {
  const seeds = {
    invite: "22222222-2222-4222-8222-",
    activity: "33333333-3333-4333-8333-",
    transport: "44444444-4444-4444-8444-",
    bill: "55555555-5555-4555-8555-",
    expense: "66666666-6666-4666-8666-",
    split: "77777777-7777-4777-8777-",
    audit: "88888888-8888-4888-8888-",
    signal: "99999999-9999-4999-8999-",
  };
  sequence += 1;
  const count = String(sequence).padStart(12, "0");
  return `${seeds[prefix] ?? "99999999-9999-4999-8999-"}${count}`;
}

function now() {
  return new Date().toISOString();
}

function notFound(message) {
  return { status: 404, body: { statusCode: 404, error: "Not Found", message } };
}

function forbidden(message) {
  return { status: 403, body: { statusCode: 403, error: "Forbidden", message } };
}

function badRequest(message) {
  return { ok: false, status: 400, body: { statusCode: 400, error: "Bad Request", message } };
}
