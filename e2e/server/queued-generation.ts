import { expect } from "@playwright/test";
export async function resolveQueuedGeneration(db: any, body: any) {
  if (body?.status !== "queued" || typeof body.job_id !== "string") return body;
  let row: any;
  await expect
    .poll(
      async () => {
        row = (
          await db.query("select * from itinerary_jobs where id=$1", [
            body.job_id,
          ])
        ).rows[0];
        return row?.status;
      },
      { timeout: 60_000, intervals: [200, 500, 1000] },
    )
    .toMatch(/^(complete|failed)$/);
  if (row.status === "failed")
    return { status: "unsupported", code: row.error_code };
  const saved = (
    await db.query("select result,created_at from itineraries where id=$1", [
      row.itinerary_id,
    ])
  ).rows[0];
  return {
    status: "cached",
    itinerary_id: row.itinerary_id,
    result: saved.result,
    cache_hit: new Date(saved.created_at) < new Date(row.created_at),
  };
}
