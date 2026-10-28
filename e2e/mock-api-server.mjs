import { createServer } from "node:http";
import { validatePlanning } from "../packages/types/src/journey.ts";
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
  tripBusiness,
} from "./fixtures/index.mjs";

const port = Number(process.env.PORT ?? 3101);
const localAuthAccounts = new Map();
const planningDrafts = new Map();
const localAuthSessions = new Map();

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

  if (req.method === "GET" && pathname === "/api/auth/account-exists") {
    const email = (url.searchParams.get("email") ?? "").trim().toLowerCase();
    return sendJson(res, 200, { exists: localAuthAccounts.has(email) });
  }

  if (req.method === "POST" && pathname === "/api/auth/register") {
    const body = await readJsonBody(req);
    const email =
      typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return sendJson(res, 400, {
        code: "invalid_email",
        message: "Please enter a valid email address.",
      });
    }
    if (password.length < 8) {
      return sendJson(res, 400, {
        code: "weak_password",
        message: "Password must be at least 8 characters.",
      });
    }
    if (localAuthAccounts.has(email)) {
      return sendJson(res, 409, {
        code: "user_already_exists",
        message: "User already registered",
      });
    }
    const user = {
      id: `local-e2e-${randomUUID()}`,
      email,
      user_metadata: {
        full_name:
          typeof body.full_name === "string" ? body.full_name.trim() : null,
        avatar_url: null,
      },
    };
    localAuthAccounts.set(email, { user, password });
    return sendJson(res, 201, createLocalAuthResponse(user));
  }

  if (req.method === "POST" && pathname === "/api/auth/session") {
    const body = await readJsonBody(req);
    const email =
      typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const account = localAuthAccounts.get(email);
    if (!account || account.password !== body.password) {
      return sendJson(res, 401, {
        code: "invalid_credentials",
        message: "Invalid login credentials",
      });
    }
    return sendJson(res, 200, createLocalAuthResponse(account.user));
  }

  if (req.method === "GET" && pathname === "/api/auth/me") {
    const token = getLocalAuthToken(req.headers.authorization);
    const email = token ? localAuthSessions.get(token) : undefined;
    const account = email ? localAuthAccounts.get(email) : undefined;
    if (!account)
      return sendJson(res, 401, {
        code: "invalid_credentials",
        message: "Invalid or missing token",
      });
    return sendJson(res, 200, { user: account.user });
  }

  if (req.method === "POST" && pathname === "/api/auth/logout") {
    const token = getLocalAuthToken(req.headers.authorization);
    if (token) localAuthSessions.delete(token);
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === "GET" && pathname === "/api/cities/popular") {
    return sendJson(res, 200, popularCities);
  }

  if (req.method === "GET" && pathname === "/api/cities/search") {
    const q = url.searchParams.get("q") ?? "";
    return sendJson(res, 200, findCitySuggestions(q));
  }

  if (req.method === "POST" && pathname === "/__e2e/reset-business-fixtures") {
    tripBusiness.resetBusinessFixtures();
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === "GET" && pathname === "/api/activities/catalog") {
    return sendJson(
      res,
      200,
      tripBusiness.searchActivityCatalog({
        citySlug: url.searchParams.get("citySlug") ?? undefined,
        category: url.searchParams.get("category") ?? undefined,
        q: url.searchParams.get("q") ?? undefined,
      }),
    );
  }

  if (req.method === "GET" && pathname === "/api/recommendations/places") {
    return sendJson(
      res,
      200,
      tripBusiness.listPlaceRecommendations({
        citySlug: url.searchParams.get("citySlug") ?? undefined,
        category: url.searchParams.get("category") ?? undefined,
        limit: Number(url.searchParams.get("limit") ?? 20),
      }),
    );
  }

  if (
    req.method === "GET" &&
    pathname === "/api/recommendations/transport-prices"
  ) {
    return sendJson(
      res,
      200,
      tripBusiness.listTransportPriceRecommendations({
        mode: url.searchParams.get("mode") ?? undefined,
        originCity: url.searchParams.get("originCity") ?? undefined,
        destinationCity: url.searchParams.get("destinationCity") ?? undefined,
        limit: Number(url.searchParams.get("limit") ?? 20),
      }),
    );
  }

  if (req.method === "GET" && pathname === "/api/trips") {
    const userId = getUserIdFromAuth(req.headers.authorization);
    if (!userId) return unauthorized(res);
    return sendJson(res, 200, tripBusiness.listTripsForUser(userId));
  }

  if (pathname.startsWith("/api/trips/")) {
    const routed = await routeTripBusiness(req, pathname);
    if (routed) return sendJson(res, routed.status, routed.body);
  }

  if (req.method === "GET" && pathname.match(/^\/api\/bills\/[^/]+$/)) {
    const userId = getUserIdFromAuth(req.headers.authorization);
    if (!userId) return unauthorized(res);
    const billId = pathname.split("/")[3];
    const result = tripBusiness.getBill({ billId, actorUserId: userId });
    return sendJson(res, result.status, result.body);
  }

  if (req.method === "PATCH" && pathname.match(/^\/api\/bills\/[^/]+$/)) {
    const userId = getUserIdFromAuth(req.headers.authorization);
    if (!userId) return unauthorized(res);
    const billId = pathname.split("/")[3];
    const result = tripBusiness.updateBill({
      billId,
      actorUserId: userId,
      body: await readJsonBody(req),
    });
    return sendJson(res, result.status, result.body);
  }

  if (
    req.method === "POST" &&
    pathname.match(/^\/api\/bills\/[^/]+\/analyze$/)
  ) {
    const userId = getUserIdFromAuth(req.headers.authorization);
    if (!userId) return unauthorized(res);
    const billId = pathname.split("/")[3];
    const result = tripBusiness.analyzeBill({ billId, actorUserId: userId });
    return sendJson(res, result.status, result.body);
  }

  if (req.method === "POST" && pathname === "/api/planning/validate") {
    return sendJson(res, 200, validatePlanning(await readJsonBody(req)));
  }
  if (req.method === "POST" && pathname === "/api/search-drafts") {
    const body = await readJsonBody(req);
    const draft = { ...body, id: randomUUID() };
    planningDrafts.set(draft.id, draft);
    return sendJson(res, 201, draft);
  }
  if (
    req.method === "POST" &&
    /^\/api\/search-drafts\/[^/]+\/claim$/.test(pathname)
  ) {
    if (!getUserIdFromAuth(req.headers.authorization)) return unauthorized(res);
    const draft = planningDrafts.get(pathname.split("/")[3]);
    const body = await readJsonBody(req);
    if (!draft || draft.guest_key !== body.guest_key)
      return sendJson(res, 404, {
        message: "Search draft not found or expired",
      });
    return sendJson(res, 200, draft);
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
    if (!itinerary)
      return sendJson(res, 404, { message: "Itinerary for job not found" });
    return sendJson(res, 200, itinerary);
  }

  if (
    req.method === "POST" &&
    pathname.match(/^\/api\/itinerary\/[^/]+\/save$/)
  ) {
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
    if (!itinerary)
      return sendJson(res, 404, { message: "Itinerary not found" });

    saveTripForUser(userId, itineraryId);
    tripBusiness.ensureSavedTripMember({
      tripId: tripBusiness.businessTripId,
      actorUserId: userId,
    });
    return sendJson(res, 200, {
      saved: true,
      trip_id: tripBusiness.businessTripId,
    });
  }

  if (
    req.method === "PATCH" &&
    pathname.match(/^\/api\/itinerary\/[^/]+\/share$/)
  ) {
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
    if (!itinerary)
      return sendJson(res, 404, { message: "Itinerary not found" });

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
    if (!itinerary)
      return sendJson(res, 404, { message: "Shared itinerary not found" });
    return sendJson(res, 200, itinerary);
  }

  if (req.method === "GET" && pathname.startsWith("/api/itinerary/")) {
    const itineraryId = pathname.split("/").at(-1);
    const itinerary = getItineraryById(itineraryId);
    if (!itinerary)
      return sendJson(res, 404, { message: "Itinerary not found" });
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
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
  });
  res.end(JSON.stringify(body));
}

function createLocalAuthResponse(user) {
  const accessToken = `local-e2e-${randomUUID()}`;
  const expiresIn = 7 * 24 * 60 * 60;
  localAuthSessions.set(accessToken, user.email);
  const session = {
    access_token: accessToken,
    refresh_token: "",
    token_type: "bearer",
    expires_in: expiresIn,
    expires_at: Math.floor(Date.now() / 1000) + expiresIn,
    user,
  };
  return { user, session };
}

function getLocalAuthToken(authorization) {
  return typeof authorization === "string"
    ? (authorization.match(/^Bearer\s+(.+)$/i)?.[1] ?? null)
    : null;
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
    }, delayMs),
  );

  const endTimer = setTimeout(
    () => {
      res.end();
    },
    Math.max(...events.map((event) => event.delayMs), 0) + 120,
  );

  res.on("close", () => {
    for (const timer of timers) clearTimeout(timer);
    clearTimeout(endTimer);
  });
}

function getUserIdFromAuth(authorization) {
  if (!authorization?.startsWith("Bearer ")) return null;
  const token = authorization.slice("Bearer ".length).trim();
  if (!token) return null;
  if (token.startsWith("mock-mobile-access-")) {
    return token.slice("mock-mobile-access-".length);
  }
  if (token.startsWith("mock-access-")) {
    return token.slice("mock-access-".length);
  }
  return token;
}

async function routeTripBusiness(req, pathname) {
  const userId = getUserIdFromAuth(req.headers.authorization);
  if (!userId) {
    return {
      status: 401,
      body: {
        statusCode: 401,
        error: "Unauthorized",
        message: "Invalid or missing token",
      },
    };
  }

  const parts = pathname.split("/").filter(Boolean);
  const tripId = parts[2];

  if (req.method === "GET" && parts.length === 4 && parts[3] === "membership") {
    return tripBusiness.getMembership({ tripId, actorUserId: userId });
  }

  if (req.method === "GET" && parts.length === 4 && parts[3] === "members") {
    const members = tripBusiness.listMembers(tripId);
    return members
      ? { status: 200, body: members }
      : { status: 404, body: { message: "Trip not found" } };
  }

  if (req.method === "POST" && parts.length === 4 && parts[3] === "invites") {
    return tripBusiness.createInvite({
      tripId,
      actorUserId: userId,
      body: await readJsonBody(req),
    });
  }

  if (req.method === "POST" && pathname === "/api/trips/join/invite") {
    return tripBusiness.joinInvite({
      actorUserId: userId,
      body: await readJsonBody(req),
    });
  }

  if (
    req.method === "PATCH" &&
    parts.length === 4 &&
    parts[3] === "share-link"
  ) {
    return tripBusiness.setShareLink({
      tripId,
      actorUserId: userId,
      body: await readJsonBody(req),
    });
  }

  if (req.method === "POST" && pathname === "/api/trips/join/share-link") {
    return tripBusiness.joinShareLink({
      actorUserId: userId,
      body: await readJsonBody(req),
    });
  }

  if (req.method === "PATCH" && parts.length === 5 && parts[3] === "members") {
    return tripBusiness.updateMember({
      tripId,
      targetUserId: parts[4],
      actorUserId: userId,
      body: await readJsonBody(req),
    });
  }

  if (req.method === "GET" && parts.length === 4 && parts[3] === "audit-logs") {
    return tripBusiness.listAuditLogs({ tripId, actorUserId: userId });
  }

  if (
    req.method === "GET" &&
    parts.length === 4 &&
    parts[3] === "review-queue"
  ) {
    return tripBusiness.listReviewQueue({ tripId, actorUserId: userId });
  }

  if (
    req.method === "PATCH" &&
    parts.length === 4 &&
    parts[3] === "review-submissions"
  ) {
    return tripBusiness.reviewSubmission({
      tripId,
      actorUserId: userId,
      body: await readJsonBody(req),
    });
  }

  if (
    req.method === "GET" &&
    parts.length === 4 &&
    parts[3] === "data-quality-signals"
  ) {
    return tripBusiness.listDataQualitySignals({ tripId, actorUserId: userId });
  }

  if (req.method === "GET" && parts.length === 4 && parts[3] === "activities") {
    return tripBusiness.listActivities({ tripId, actorUserId: userId });
  }

  if (
    req.method === "POST" &&
    parts.length === 4 &&
    parts[3] === "activities"
  ) {
    return tripBusiness.createActivity({
      tripId,
      actorUserId: userId,
      body: await readJsonBody(req),
    });
  }

  if (
    req.method === "PATCH" &&
    parts.length === 5 &&
    parts[3] === "activities"
  ) {
    return tripBusiness.updateActivity({
      tripId,
      activityId: parts[4],
      actorUserId: userId,
      body: await readJsonBody(req),
    });
  }

  if (
    req.method === "PATCH" &&
    parts.length === 7 &&
    parts[3] === "activities" &&
    parts[5] === "participants"
  ) {
    return tripBusiness.updateActivityParticipant({
      tripId,
      activityId: parts[4],
      targetUserId: parts[6],
      actorUserId: userId,
      body: await readJsonBody(req),
    });
  }

  if (
    req.method === "GET" &&
    parts.length === 4 &&
    parts[3] === "transport-bookings"
  ) {
    return tripBusiness.listTransport({ tripId, actorUserId: userId });
  }

  if (
    req.method === "POST" &&
    parts.length === 4 &&
    parts[3] === "transport-bookings"
  ) {
    return tripBusiness.createTransport({
      tripId,
      actorUserId: userId,
      body: await readJsonBody(req),
    });
  }

  if (
    req.method === "PATCH" &&
    parts.length === 5 &&
    parts[3] === "transport-bookings"
  ) {
    return tripBusiness.updateTransport({
      tripId,
      bookingId: parts[4],
      actorUserId: userId,
      body: await readJsonBody(req),
    });
  }

  if (req.method === "POST" && parts.length === 4 && parts[3] === "bills") {
    return tripBusiness.createBill({
      tripId,
      actorUserId: userId,
      body: await readJsonBody(req),
    });
  }

  if (req.method === "GET" && parts.length === 4 && parts[3] === "expenses") {
    return tripBusiness.listExpenses({ tripId, actorUserId: userId });
  }

  if (req.method === "POST" && parts.length === 4 && parts[3] === "expenses") {
    return tripBusiness.createExpense({
      tripId,
      actorUserId: userId,
      body: await readJsonBody(req),
    });
  }

  if (req.method === "PATCH" && parts.length === 5 && parts[3] === "expenses") {
    return tripBusiness.updateExpense({
      tripId,
      expenseId: parts[4],
      actorUserId: userId,
      body: await readJsonBody(req),
    });
  }

  if (
    req.method === "PATCH" &&
    parts.length === 7 &&
    parts[3] === "expenses" &&
    parts[5] === "splits"
  ) {
    return tripBusiness.updateExpenseSplit({
      tripId,
      expenseId: parts[4],
      splitId: parts[6],
      actorUserId: userId,
      body: await readJsonBody(req),
    });
  }

  return null;
}

function unauthorized(res) {
  return sendJson(res, 401, {
    statusCode: 401,
    error: "Unauthorized",
    message: "Invalid or missing token",
  });
}
