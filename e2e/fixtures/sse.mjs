import { queuedScenario } from "./itineraries.mjs";

export function getSSESequence(jobId) {
  if (jobId !== queuedScenario.jobId) {
    return [
      {
        event: "error",
        data: { message: "Job not found", code: "JOB_NOT_FOUND" },
        delayMs: 50,
      },
    ];
  }

  return [
    {
      event: "queued",
      data: { status: "queued", job_id: queuedScenario.jobId },
      delayMs: 50,
    },
    {
      event: "processing",
      data: { step: "fetching_city_data" },
      delayMs: 180,
    },
    {
      event: "overview_ready",
      data: { cities: [queuedScenario.city] },
      delayMs: 320,
    },
    {
      event: "complete",
      data: { itinerary_id: queuedScenario.itineraryId, status: "complete" },
      delayMs: 520,
    },
  ];
}
