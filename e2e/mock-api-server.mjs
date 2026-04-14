import { createServer } from "node:http";
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
  return token.length > 0 ? token : null;
}
