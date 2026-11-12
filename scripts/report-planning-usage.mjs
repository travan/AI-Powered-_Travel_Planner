// Read-only comparison for matched staging fixture windows.
// Supply a TLS-configured URL for the server's application role.
import { createRequire } from "node:module";

const { Client } = createRequire(
  new URL("../apps/server/package.json", import.meta.url),
)("pg");
const [from, to] = process.argv.slice(2);
const connectionString = process.env.PLANNING_METRICS_DATABASE_URL;
if (
  !connectionString ||
  !Number.isFinite(Date.parse(from)) ||
  !Number.isFinite(Date.parse(to)) ||
  Date.parse(from) >= Date.parse(to)
) {
  console.error(
    "Usage: PLANNING_METRICS_DATABASE_URL=… node scripts/report-planning-usage.mjs <from-ISO> <to-ISO>",
  );
  process.exit(2);
}

const weights = new Map([
  ["@cf/meta/llama-3.3-70b-instruct-fp8-fast", [0.026668, 0.204805]],
]);
const client = new Client({
  connectionString,
  statement_timeout: 10_000,
  connectionTimeoutMillis: 5000,
});
try {
  await client.connect();
  await client.query("begin read only");
  const { rows } = await client.query(
    `select a.job_id, a.strategy, a.outcome, a.calls, a.catalog_days, a.ai_days,
            j.status, coalesce(j.planning_progress->'cities'->>0, j.payload->'dto'->'cities'->>0) as destination,
            coalesce(jsonb_array_length(j.planning_progress->'cities'), (j.payload->'dto'->>'num_days')::integer) as days
       from planning_ai_attempts a join itinerary_jobs j on j.id=a.job_id
      where j.created_at >= $1 and j.created_at < $2
      order by a.job_id, a.recorded_at`,
    [from, to],
  );
  const groups = new Map();
  for (const row of rows) {
    const key = JSON.stringify([row.strategy, row.destination, row.days]);
    if (!groups.has(key)) groups.set(key, new Map());
    const jobs = groups.get(key);
    const job = jobs.get(row.job_id) ?? { calls: [], last: row };
    job.calls.push(...row.calls);
    job.last = row;
    jobs.set(row.job_id, job);
  }
  const summary = [];
  for (const [key, jobs] of groups) {
    const [strategy, destination, days] = JSON.parse(key);
    let complete = 0,
      cacheHits = 0,
      failed = 0,
      dbDays = 0,
      aiDays = 0;
    let calls = 0,
      quotaRejected = 0,
      missingUsage = 0,
      unpricedCalls = 0;
    const callsByStage = {};
    let inputTokens = 0,
      outputTokens = 0,
      neurons = 0;
    for (const { calls: records, last } of jobs.values()) {
      if (last.status === "complete") complete++;
      if (last.outcome === "cache_hit") cacheHits++;
      if (last.status === "failed") failed++;
      dbDays += last.catalog_days;
      aiDays += last.ai_days;
      for (const record of records) {
        calls++;
        callsByStage[record.stage] = (callsByStage[record.stage] ?? 0) + 1;
        if (record.outcome === "quota_rejected") {
          quotaRejected++;
          continue;
        }
        if (record.input_tokens == null || record.output_tokens == null) {
          missingUsage++;
          continue;
        }
        inputTokens += record.input_tokens;
        outputTokens += record.output_tokens;
        const weight = weights.get(record.model);
        if (weight)
          neurons +=
            record.input_tokens * weight[0] + record.output_tokens * weight[1];
        else unpricedCalls++;
      }
    }
    summary.push({
      strategy,
      destination,
      days,
      jobs: jobs.size,
      complete,
      cacheHits,
      failed,
      completionRate: complete / jobs.size,
      catalogDayShare: dbDays + aiDays ? dbDays / (dbDays + aiDays) : null,
      calls,
      callsByStage,
      quotaRejected,
      missingUsage,
      unpricedCalls,
      inputTokens,
      outputTokens,
      observedNeuronsEstimate: Math.round(neurons),
      neuronsPerCompleted:
        complete && !missingUsage && !unpricedCalls
          ? Math.round(neurons / complete)
          : null,
    });
  }
  console.log(JSON.stringify({ from, to, summary }, null, 2));
  await client.query("rollback");
} catch (error) {
  console.error("Could not read planning usage.", error.code ?? error.name);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
