import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import {
  createShareToken,
  findCitySuggestions,
  getItineraryById,
  getItineraryByJobId,
  getSharedItinerary,
  getSSESequence,
  popularCities,
  removeShareToken,
  resolveGenerateScenario,
  saveTripForUser,
} from "./fixtures/index.mjs";

const port = Number(process.env.PORT ?? 3101);
const tripStateByUser = new Map();

const server = createServer(async (req, res) => {
  setCors(res);

  if (!req.url || !req.method) {
    return sendJson(res, 400, { message: "Missing request data" });
  }

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://127.0.0.1:${port}`);
  const pathname = url.pathname;

  if (pathname === "/health") {
    return sendJson(res, 200, { status: "ok" });
  }

  if (req.method === "GET" && pathname === "/api/cities/popular") {
    return sendJson(res, 200, popularCities);
  }

  if (req.method === "GET" && pathname === "/api/cities/search") {
    const q = url.searchParams.get("q") ?? "";
    return sendJson(res, 200, findCitySuggestions(q));
  }

  if (req.method === "GET" && pathname === "/api/recommendations/places") {
    return sendJson(res, 200, [
      {
        id: "rec-place-cafe",
        city_slug: url.searchParams.get("city_slug") ?? "da-nang",
        current_name: "Han River Coffee",
        type: "cafe",
        category: "coffee",
        normalized_address: "Bach Dang, Da Nang",
        average_rating: 4.6,
        quality_score: 0.86,
        freshness_score: 0.9,
        status: "active",
        latest_price: 65000,
        latest_price_type: "coffee",
        latest_price_observed_at: new Date().toISOString(),
        pending_signal_count: 1,
        recommendation_score: 0.82,
        data_quality_label: "watch_price",
      },
    ]);
  }

  if (req.method === "GET" && pathname === "/api/recommendations/transport-prices") {
    return sendJson(res, 200, [
      {
        id: "rec-transport-flight-sgn-dad",
        mode: "flight",
        from_hub_code: "SGN",
        to_hub_code: "DAD",
        from_label: "SGN",
        to_label: "DAD",
        provider_name: "Vietnam Airlines",
        service_class: "economy",
        month: 8,
        cheapest_observed_price: 1290000,
        average_price: 1850000,
        expensive_threshold: 2400000,
        cheap_window_start: 45,
        cheap_window_end: 28,
        recommendation: "Book 4-6 weeks before departure for better DAD fares.",
        confidence_score: 0.74,
        updated_at: new Date().toISOString(),
      },
      {
        id: "rec-transport-train-sgn-dad",
        mode: "train",
        from_hub_code: "SG",
        to_hub_code: "DN",
        from_label: "Saigon Station",
        to_label: "Da Nang Station",
        provider_name: "Vietnam Railways",
        service_class: "sleeper",
        month: 8,
        cheapest_observed_price: 820000,
        average_price: 1100000,
        expensive_threshold: 1500000,
        cheap_window_start: 30,
        cheap_window_end: 14,
        recommendation: "Sleeper train is usually cheaper when booked 2-4 weeks ahead.",
        confidence_score: 0.68,
        updated_at: new Date().toISOString(),
      },
    ]);
  }

  if (req.method === "GET" && pathname === "/api/profile/me") {
    const userId = getUserIdFromAuth(req.headers.authorization);
    if (!userId) return sendUnauthorized(res);

    return sendJson(res, 200, {
      user_id: userId,
      email: `${userId.replace(/^mock-/, "")}@test.com`,
      display_name: "E2E Traveler",
      avatar_url: null,
      home_city_slug: "ho-chi-minh-city",
      travel_preferences: { pace: "balanced", food: true },
    });
  }

  if (req.method === "GET" && pathname === "/api/trips") {
    const userId = getUserIdFromAuth(req.headers.authorization);
    if (!userId) return sendUnauthorized(res);

    const trip = getTripState(userId);
    return sendJson(res, 200, [toTripSummary(trip)]);
  }

  if (req.method === "GET" && pathname.match(/^\/api\/trips\/[^/]+$/)) {
    const userId = getUserIdFromAuth(req.headers.authorization);
    if (!userId) return sendUnauthorized(res);

    const trip = getTripState(userId);
    if (pathname.split("/").at(-1) !== trip.id) return sendJson(res, 404, { message: "Trip not found" });
    return sendJson(res, 200, trip);
  }

  if (req.method === "POST" && pathname.match(/^\/api\/trips\/[^/]+\/activities$/)) {
    const userId = getUserIdFromAuth(req.headers.authorization);
    if (!userId) return sendUnauthorized(res);

    const trip = getTripState(userId);
    const body = await readJsonBody(req);
    const activity = {
      id: randomUUID(),
      trip_day_id: trip.days[0]?.id ?? null,
      title: body.title,
      status: "planned",
      approval_status: "approved",
      place_name: body.place_name ?? "Custom activity",
      start_time: null,
      end_time: null,
      price_snapshot: body.price ?? null,
      created_by_user_id: userId,
    };
    trip.activities.unshift(activity);
    trip.activity_count = trip.activities.length;
    pushAudit(trip, {
      actorUserId: userId,
      actorEmail: `${userId.replace(/^mock-/, "")}@test.com`,
      action: "activity.created",
      targetType: "activity",
      targetId: activity.id,
      afterSnapshot: { title: activity.title, approval_status: activity.approval_status },
    });
    return sendJson(res, 201, activity);
  }

  if (req.method === "POST" && pathname.match(/^\/api\/trips\/[^/]+\/place-submissions$/)) {
    const userId = getUserIdFromAuth(req.headers.authorization);
    if (!userId) return sendUnauthorized(res);

    const trip = getTripState(userId);
    const body = await readJsonBody(req);
    const submission = {
      id: randomUUID(),
      raw_name: body.raw_name,
      raw_type: body.raw_type ?? null,
      raw_address: body.raw_address ?? null,
      raw_notes: body.raw_notes ?? null,
      raw_price: body.raw_price ?? null,
      status: "pending",
      created_at: new Date().toISOString(),
    };
    trip.place_submissions.unshift(submission);
    pushAudit(trip, {
      actorUserId: userId,
      actorEmail: `${userId.replace(/^mock-/, "")}@test.com`,
      action: "place_submission.created",
      targetType: "place_submission",
      targetId: submission.id,
      afterSnapshot: { raw_name: submission.raw_name, status: submission.status },
    });
    return sendJson(res, 201, submission);
  }

  if (req.method === "POST" && pathname.match(/^\/api\/trips\/[^/]+\/expenses$/)) {
    const userId = getUserIdFromAuth(req.headers.authorization);
    if (!userId) return sendUnauthorized(res);

    const trip = getTripState(userId);
    const body = await readJsonBody(req);
    const splitUserIds = body.split_user_ids?.length
      ? body.split_user_ids
      : trip.members.map((member) => member.user_id);
    const shareAmount = Math.floor(Number(body.amount) / splitUserIds.length);
    const expense = {
      id: randomUUID(),
      title: body.title,
      amount: Number(body.amount),
      currency: body.currency ?? "VND",
      expense_type: body.expense_type ?? "other",
      approval_status: "approved",
      paid_by_email: trip.members[0]?.email ?? null,
      place_name: null,
      activity_title: trip.activities.find((activity) => activity.id === body.activity_id)?.title ?? null,
      activity_id: body.activity_id ?? null,
      place_id: null,
      created_by_user_id: userId,
      splits: splitUserIds.map((memberId, index) => {
        const member = trip.members.find((entry) => entry.user_id === memberId);
        return {
          id: randomUUID(),
          user_id: memberId,
          email: member?.email ?? null,
          display_name: member?.display_name ?? null,
          share_amount: index === 0 ? Number(body.amount) - shareAmount * (splitUserIds.length - 1) : shareAmount,
          share_percent: Number((100 / splitUserIds.length).toFixed(2)),
          status: "pending",
        };
      }),
    };
    trip.expenses.unshift(expense);
    trip.expense_total += expense.amount;
    pushAudit(trip, {
      actorUserId: userId,
      actorEmail: `${userId.replace(/^mock-/, "")}@test.com`,
      action: "expense.created",
      targetType: "expense",
      targetId: expense.id,
      afterSnapshot: { title: expense.title, approval_status: expense.approval_status },
    });
    return sendJson(res, 201, expense);
  }

  if (req.method === "POST" && pathname.match(/^\/api\/trips\/[^/]+\/bills$/)) {
    const userId = getUserIdFromAuth(req.headers.authorization);
    if (!userId) return sendUnauthorized(res);

    const trip = getTripState(userId);
    const body = await readJsonBody(req);
    const totalAmount = Number(body.total_amount) || extractMockBillTotal(body.raw_ocr_text) || 0;
    const bill = {
      id: randomUUID(),
      trip_id: trip.id,
      uploaded_by_user_id: userId,
      place_id: null,
      activity_id: body.activity_id ?? null,
      storage_url: body.storage_url ?? "local://manual-ocr-entry",
      status: totalAmount > 0 ? "parsed" : "needs_review",
      total_amount: totalAmount || null,
      currency: body.currency ?? "VND",
      bill_date: body.bill_date ?? null,
      expense_id: null,
      created_at: new Date().toISOString(),
      line_items: extractMockBillItems(body.raw_ocr_text),
    };

    if (totalAmount > 0 && body.create_expense !== false) {
      const splitUserIds = body.split_user_ids?.length
        ? body.split_user_ids
        : trip.members.map((member) => member.user_id);
      const shareAmount = Math.floor(totalAmount / splitUserIds.length);
      const expense = {
        id: randomUUID(),
        title: body.place_name ? `Bill at ${body.place_name}` : "Bill upload",
        amount: totalAmount,
        currency: bill.currency,
        expense_type: "food",
        approval_status: "approved",
        paid_by_email: trip.members[0]?.email ?? null,
        place_name: body.place_name ?? null,
        activity_title: trip.activities.find((activity) => activity.id === body.activity_id)?.title ?? null,
        activity_id: body.activity_id ?? null,
        place_id: null,
        created_by_user_id: userId,
        splits: splitUserIds.map((memberId, index) => {
          const member = trip.members.find((entry) => entry.user_id === memberId);
          return {
            id: randomUUID(),
            user_id: memberId,
            email: member?.email ?? null,
            display_name: member?.display_name ?? null,
            share_amount: index === 0 ? totalAmount - shareAmount * (splitUserIds.length - 1) : shareAmount,
            share_percent: Number((100 / splitUserIds.length).toFixed(2)),
            status: "pending",
          };
        }),
      };
      bill.expense_id = expense.id;
      trip.expenses.unshift(expense);
      trip.expense_total += expense.amount;
    }

    pushAudit(trip, {
      actorUserId: userId,
      actorEmail: `${userId.replace(/^mock-/, "")}@test.com`,
      action: "bill.normalized",
      targetType: "bill_upload",
      targetId: bill.id,
      afterSnapshot: { total_amount: bill.total_amount, line_item_count: bill.line_items.length },
    });

    return sendJson(res, 201, bill);
  }

  if (req.method === "PATCH" && pathname.match(/^\/api\/trips\/[^/]+\/change-requests\/[^/]+\/review$/)) {
    const userId = getUserIdFromAuth(req.headers.authorization);
    if (!userId) return sendUnauthorized(res);

    const trip = getTripState(userId);
    const parts = pathname.split("/");
    if (parts[3] !== trip.id) return sendJson(res, 404, { message: "Trip not found" });
    if (!["host", "co_host"].includes(trip.role)) return sendJson(res, 403, { message: "Only hosts can review changes" });

    const body = await readJsonBody(req);
    if (!["approved", "rejected"].includes(body.status)) {
      return sendJson(res, 400, { message: "Invalid review status" });
    }

    const requestId = parts[5];
    const changeRequest = trip.change_requests.find((request) => request.id === requestId);
    if (!changeRequest || changeRequest.status !== "pending") {
      return sendJson(res, 403, { message: "Change request is not reviewable" });
    }

    changeRequest.status = body.status;
    changeRequest.reviewed_by_user_id = userId;
    changeRequest.reviewed_by_email = `${userId.replace(/^mock-/, "")}@test.com`;
    changeRequest.reviewed_at = new Date().toISOString();
    if (changeRequest.target_type === "activity") {
      const activity = trip.activities.find((entry) => entry.id === changeRequest.target_id);
      if (activity) activity.approval_status = body.status;
    }
    if (changeRequest.target_type === "expense") {
      const expense = trip.expenses.find((entry) => entry.id === changeRequest.target_id);
      if (expense) expense.approval_status = body.status;
    }
    if (changeRequest.target_type === "place_submission") {
      const submission = trip.place_submissions.find((entry) => entry.id === changeRequest.target_id);
      if (submission) submission.status = body.status === "approved" ? "normalized" : "rejected";
    }
    pushAudit(trip, {
      actorUserId: userId,
      actorEmail: `${userId.replace(/^mock-/, "")}@test.com`,
      action: `change_request.${body.status}`,
      targetType: changeRequest.target_type,
      targetId: changeRequest.target_id,
      afterSnapshot: { review_status: body.status, change_request_id: changeRequest.id },
    });

    return sendJson(res, 200, changeRequest);
  }

  if (req.method === "POST" && pathname === "/api/itinerary/generate") {
    const body = await readJsonBody(req);
    const scenario = resolveGenerateScenario(body);
    return sendJson(res, scenario.statusCode, scenario.body);
  }

  if (req.method === "GET" && pathname.startsWith("/api/itinerary/stream/")) {
    const jobId = pathname.split("/").at(-1);
    return sendSSE(res, getSSESequence(jobId));
  }

  if (req.method === "GET" && pathname.startsWith("/api/itinerary/job/")) {
    const jobId = pathname.split("/").at(-1);
    const itinerary = getItineraryByJobId(jobId);
    if (!itinerary) return sendJson(res, 404, { message: "Itinerary for job not found" });
    return sendJson(res, 200, itinerary);
  }

  if (req.method === "POST" && pathname.match(/^\/api\/itinerary\/[^/]+\/save$/)) {
    const userId = getUserIdFromAuth(req.headers.authorization);
    if (!userId) {
      return sendJson(res, 401, {
        statusCode: 401,
        error: "Unauthorized",
        message: "Invalid or missing token",
      });
    }

    const itineraryId = pathname.split("/")[3];
    const itinerary = getItineraryById(itineraryId);
    if (!itinerary) return sendJson(res, 404, { message: "Itinerary not found" });

    saveTripForUser(userId, itineraryId);
    return sendJson(res, 200, { saved: true });
  }

  if (req.method === "PATCH" && pathname.match(/^\/api\/itinerary\/[^/]+\/share$/)) {
    const userId = getUserIdFromAuth(req.headers.authorization);
    if (!userId) {
      return sendJson(res, 401, {
        statusCode: 401,
        error: "Unauthorized",
        message: "Invalid or missing token",
      });
    }

    const itineraryId = pathname.split("/")[3];
    const itinerary = getItineraryById(itineraryId);
    if (!itinerary) return sendJson(res, 404, { message: "Itinerary not found" });

    const body = await readJsonBody(req);
    const isPublic = body?.is_public !== false;

    if (!isPublic) {
      removeShareToken(itineraryId);
      return sendJson(res, 200, { is_public: false, share_token: null });
    }

    const shareToken = createShareToken(itineraryId);
    return sendJson(res, 200, {
      is_public: true,
      share_token: shareToken,
      share_url: `http://127.0.0.1:${port}/shared/${shareToken}`,
    });
  }

  if (req.method === "GET" && pathname.startsWith("/api/itinerary/shared/")) {
    const shareToken = pathname.split("/").at(-1);
    const itinerary = getSharedItinerary(shareToken);
    if (!itinerary) return sendJson(res, 404, { message: "Shared itinerary not found" });
    return sendJson(res, 200, itinerary);
  }

  if (req.method === "GET" && pathname.startsWith("/api/itinerary/")) {
    const itineraryId = pathname.split("/").at(-1);
    const itinerary = getItineraryById(itineraryId);
    if (!itinerary) return sendJson(res, 404, { message: "Itinerary not found" });
    return sendJson(res, 200, itinerary);
  }

  return sendJson(res, 404, { message: "Not found" });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Mock API server listening on http://127.0.0.1:${port}`);
});

process.on("SIGTERM", () => server.close(() => process.exit(0)));
process.on("SIGINT", () => server.close(() => process.exit(0)));

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function sendJson(res, statusCode, body) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function sendUnauthorized(res) {
  return sendJson(res, 401, {
    statusCode: 401,
    error: "Unauthorized",
    message: "Invalid or missing token",
  });
}

async function readJsonBody(req) {
  const chunks = [];

  for await (const chunk of req) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) return {};

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return {};
  }
}

function sendSSE(res, events) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });

  const timers = events.map(({ event, data, delayMs }) =>
    setTimeout(() => {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    }, delayMs)
  );

  const endTimer = setTimeout(() => {
    res.end();
  }, Math.max(...events.map((event) => event.delayMs), 0) + 120);

  res.on("close", () => {
    for (const timer of timers) clearTimeout(timer);
    clearTimeout(endTimer);
  });
}

function getUserIdFromAuth(authorization) {
  if (!authorization?.startsWith("Bearer ")) return null;
  const token = authorization.slice("Bearer ".length).trim();
  if (!token) return null;
  if (token.startsWith("mock-access-")) return token.slice("mock-access-".length);
  return token;
}

function getTripState(userId) {
  if (!tripStateByUser.has(userId)) {
    tripStateByUser.set(userId, createDemoTrip(userId));
  }

  return tripStateByUser.get(userId);
}

function createDemoTrip(userId) {
  const tripId = "e2e-trip-da-nang";
  const dayId = "e2e-trip-day-1";
  const members = [
    {
      user_id: userId,
      email: `${userId.replace(/^mock-/, "")}@test.com`,
      display_name: "E2E Host",
      role: "host",
      status: "active",
    },
    {
      user_id: "mock-e2e-friend",
      email: "friend@test.com",
      display_name: "E2E Friend",
      role: "contributor",
      status: "active",
    },
  ];
  const activities = [
    {
      id: "e2e-activity-coffee",
      trip_day_id: dayId,
      title: "Coffee crawl by Han River",
      status: "planned",
      approval_status: "approved",
      place_name: "Han River Coffee",
      start_time: null,
      end_time: null,
      price_snapshot: 120000,
      created_by_user_id: userId,
    },
    {
      id: "e2e-activity-pending",
      trip_day_id: dayId,
      title: "Contributor seafood market",
      status: "planned",
      approval_status: "pending",
      place_name: "Son Tra Night Market",
      start_time: null,
      end_time: null,
      price_snapshot: 250000,
      created_by_user_id: "mock-e2e-friend",
    },
  ];
  const expenses = [
    {
      id: "e2e-expense-dinner",
      title: "Dinner at Madame Lan",
      amount: 980000,
      currency: "VND",
      expense_type: "food",
      approval_status: "approved",
      paid_by_email: members[0].email,
      place_name: "Madame Lan",
      activity_title: "Coffee crawl by Han River",
      activity_id: activities[0].id,
      place_id: null,
      created_by_user_id: userId,
      splits: members.map((member) => ({
        id: randomUUID(),
        user_id: member.user_id,
        email: member.email,
        display_name: member.display_name,
        share_amount: 490000,
        share_percent: 50,
        status: "pending",
      })),
    },
    {
      id: "e2e-expense-pending",
      title: "Contributor market bill",
      amount: 420000,
      currency: "VND",
      expense_type: "food",
      approval_status: "pending",
      paid_by_email: "friend@test.com",
      place_name: "Son Tra Night Market",
      activity_title: "Contributor seafood market",
      activity_id: activities[1].id,
      place_id: null,
      created_by_user_id: "mock-e2e-friend",
      splits: members.map((member) => ({
        id: randomUUID(),
        user_id: member.user_id,
        email: member.email,
        display_name: member.display_name,
        share_amount: 210000,
        share_percent: 50,
        status: "pending",
      })),
    },
  ];
  const placeSubmissions = [
    {
      id: "e2e-place-pending",
      raw_name: "Tiny Banh Mi Place",
      raw_type: "restaurant",
      raw_address: "12 Nguyen Thai Hoc, Hoi An",
      raw_notes: "Contributor says price increased this month",
      raw_price: 55000,
      status: "pending",
      created_at: new Date().toISOString(),
    },
  ];

  return {
    id: tripId,
    title: "E2E Da Nang group trip",
    description: "Mock group trip with activity, place data, and expense splits.",
    primary_city_slug: "da-nang",
    start_date: "2026-08-12",
    end_date: "2026-08-15",
    status: "planning",
    visibility: "private",
    budget: 8000000,
    currency: "VND",
    role: "host",
    member_count: members.length,
    activity_count: activities.length,
    checklist_done: 1,
    checklist_total: 2,
    expense_total: expenses.reduce((sum, expense) => sum + expense.amount, 0),
    created_at: new Date().toISOString(),
    members,
    days: [{ id: dayId, day_index: 1, date: "2026-08-12", title: "Arrival and food crawl" }],
    activities,
    checklist: [
      {
        id: "e2e-checklist-flight",
        title: "Buy SGN -> DAD transport tickets",
        category: "transport",
        status: "done",
        due_date: "2026-07-28",
        assigned_to_user_id: userId,
      },
      {
        id: "e2e-checklist-room",
        title: "Confirm river-view family room",
        category: "hotel",
        status: "todo",
        due_date: "2026-08-01",
        assigned_to_user_id: userId,
      },
    ],
    accommodations: [
      {
        id: "e2e-stay",
        place_name: "Hoi An Riverside Homestay",
        check_in_date: "2026-08-12",
        check_out_date: "2026-08-15",
        room_type: "Family room",
        total_price: 2400000,
        currency: "VND",
        booking_status: "booked",
      },
    ],
    transports: [
      {
        id: "e2e-transport-flight",
        mode: "flight",
        provider_name: "Vietnam Airlines",
        service_number: "VN132",
        from_label: "SGN",
        to_label: "DAD",
        departure_time: "2026-08-12T02:00:00.000Z",
        arrival_time: "2026-08-12T03:20:00.000Z",
        service_class: "economy",
        status: "booked",
      },
      {
        id: "e2e-transport-ferry",
        mode: "ferry",
        provider_name: "Hoi An River Ferry",
        service_number: "FERRY-01",
        from_label: "Bach Dang Pier",
        to_label: "Cam Kim Pier",
        departure_time: "2026-08-13T08:00:00.000Z",
        arrival_time: "2026-08-13T08:25:00.000Z",
        service_class: "standard",
        status: "planned",
      },
    ],
    expenses,
    change_requests: [
      {
        id: "e2e-change-activity",
        target_type: "activity",
        target_id: "e2e-activity-pending",
        requested_by_user_id: "mock-e2e-friend",
        requested_by_email: "friend@test.com",
        reviewed_by_user_id: null,
        reviewed_by_email: null,
        reviewed_at: null,
        change_payload: { title: "Contributor seafood market", price: 250000 },
        reason: "New contributor activity needs host review",
        status: "pending",
        created_at: new Date().toISOString(),
      },
      {
        id: "e2e-change-expense",
        target_type: "expense",
        target_id: "e2e-expense-pending",
        requested_by_user_id: "mock-e2e-friend",
        requested_by_email: "friend@test.com",
        reviewed_by_user_id: null,
        reviewed_by_email: null,
        reviewed_at: null,
        change_payload: { title: "Contributor market bill", amount: 420000 },
        reason: "New contributor expense needs host review",
        status: "pending",
        created_at: new Date().toISOString(),
      },
      {
        id: "e2e-change-place",
        target_type: "place_submission",
        target_id: "e2e-place-pending",
        requested_by_user_id: "mock-e2e-friend",
        requested_by_email: "friend@test.com",
        reviewed_by_user_id: null,
        reviewed_by_email: null,
        reviewed_at: null,
        change_payload: { raw_name: "Tiny Banh Mi Place", raw_price: 55000 },
        reason: "New contributor place signal needs host review",
        status: "pending",
        created_at: new Date().toISOString(),
      },
    ],
    place_submissions: placeSubmissions,
    audit_logs: [
      {
        id: randomUUID(),
        actor_user_id: "mock-e2e-friend",
        actor_email: "friend@test.com",
        actor_display_name: "E2E Friend",
        action: "activity.created",
        target_type: "activity",
        target_id: "e2e-activity-pending",
        before_snapshot: null,
        after_snapshot: { title: "Contributor seafood market", approval_status: "pending" },
        created_at: new Date().toISOString(),
      },
    ],
  };
}

function pushAudit(trip, event) {
  trip.audit_logs.unshift({
    id: randomUUID(),
    actor_user_id: event.actorUserId,
    actor_email: event.actorEmail,
    actor_display_name: null,
    action: event.action,
    target_type: event.targetType,
    target_id: event.targetId,
    before_snapshot: event.beforeSnapshot ?? null,
    after_snapshot: event.afterSnapshot ?? null,
    created_at: new Date().toISOString(),
  });
}

function extractMockBillTotal(rawText = "") {
  const match = String(rawText).match(/(?:total|tong|thanh tien)\s*:?\s*([0-9][0-9.,\s]*)/i);
  if (!match) return null;
  return Number((match[1] ?? "").replace(/[.,\s]/g, "")) || null;
}

function extractMockBillItems(rawText = "") {
  return String(rawText)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !/^(total|tong|thanh tien)\b/i.test(line))
    .map((line) => {
      const match = line.match(/^(.+?)\s+([0-9][0-9.,\s]*)$/);
      const amount = Number((match?.[2] ?? "0").replace(/[.,\s]/g, "")) || 0;
      return {
        id: randomUUID(),
        name: match?.[1] ?? line,
        quantity: null,
        unit_price: null,
        amount,
        category: "food",
        confidence_score: 0.72,
      };
    })
    .filter((item) => item.amount > 0);
}

function toTripSummary(trip) {
  return {
    id: trip.id,
    title: trip.title,
    description: trip.description,
    primary_city_slug: trip.primary_city_slug,
    start_date: trip.start_date,
    end_date: trip.end_date,
    status: trip.status,
    visibility: trip.visibility,
    budget: trip.budget,
    currency: trip.currency,
    role: trip.role,
    member_count: trip.member_count,
    activity_count: trip.activities.length,
    checklist_done: trip.checklist.filter((item) => item.status === "done").length,
    checklist_total: trip.checklist.length,
    expense_total: trip.expense_total,
    created_at: trip.created_at,
  };
}
