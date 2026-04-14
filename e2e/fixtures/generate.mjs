import { cachedScenario, queuedScenario } from "./itineraries.mjs";

export function resolveGenerateScenario(body) {
  const cities = Array.isArray(body?.cities) ? body.cities : [];

  if (cities.includes("cache-city")) {
    return {
      statusCode: 200,
      body: {
        status: "cached",
        itinerary_id: cachedScenario.itineraryId,
        result: cachedScenario.itinerary.itineraries[0],
      },
    };
  }

  return {
    statusCode: 202,
    body: {
      job_id: queuedScenario.jobId,
      status: "queued",
      stream_url: `/api/itinerary/stream/${queuedScenario.jobId}`,
      estimated_wait_seconds: 2,
    },
  };
}
