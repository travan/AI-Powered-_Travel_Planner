# Journey queue and notification rollout

Production now uses the [bounded production canary](planning-production-canary.md); staging is optional. The staging load procedure below remains available for separate capacity work and is not a release prerequisite.

## Optional staging

Use a separate Postgres database, Hyperdrive binding and web origin. Apply the server migrations with the same migration runner and runtime grants as the target deployment. The runtime role needs RLS policies for `itinerary_jobs`, `journey_job_dispatch` and `product_notifications`. Run the Security Gate before rollout.

Create the Cloudflare queues `travel-planner-journey-staging` and `travel-planner-journey-staging-dead`. Configure the staging Worker JWT secret separately, then generate and validate the deployment configuration.

```sh
STAGING_HYPERDRIVE_ID=<staging-binding-id> STAGING_WEB_ORIGIN=https://<staging-web-origin> \
  node apps/server/cloudflare/prepare-queue-config.mjs staging
pnpm dlx wrangler@4.155.0 deploy --dry-run --config apps/server/wrangler.generated.json
```

Deploy with `--var DEPLOY_COMMIT:<commit-sha>`. The staging config defaults to pipeline v2 at 100%, four consumers, four global inference slots and synthetic inference lasting 30 seconds. Seed destination cities and venue fixtures satisfying required dietary/independence restrictions first; leave selected prices missing to exercise inference. Synthetic venues with unverified required restrictions are rejected. Synthetic inference is restricted to `PLANNING_STAGING=true` and `AI_PROVIDER=mock`. Use `STAGING_AI_PROVIDER=cloudflare` for the separate real-model run. `/health` exposes the rollout percentage, Queue producer binding, inference limit and staging marker. Verify deployed producer/consumer/DLQ settings with `node scripts/check-planning-bindings.mjs`, using `WRANGLER_CONFIG` and `CLOUDFLARE_API_TOKEN`.

Prepare 100 synthetic test users with distinct access tokens. For mixed mode, give each user access to a staging test trip. Keep the fixture file outside the repository. Use freshly issued native API sessions with refresh tokens. The harness rotates them during the test. Keep staging accessible only to the test team.

The fixture is a JSON array of `{ "token": "...", "refreshToken": "...", "tripId": "..." }` objects. The planning fixture is a valid request body for `POST /api/itinerary/generate` with a `planning` object and a catalog destination.

```sh
LOAD_MODE=burst STAGING_API_ORIGIN=https://<staging-api-origin> \
  EXPECTED_DEPLOY_COMMIT=<commit-sha> STAGING_FIXTURES=/tmp/cohorizon-fixtures.json \
  STAGING_PLANNER_INPUT=/tmp/cohorizon-job.json k6 run tests/load/journey-capacity.js
```

Repeat with `LOAD_MODE=mixed`. Pass `LOAD_AI_MODE=real` for model quality/capacity runs. Measure concurrency at 1, 2, 4, 8 and 16; select the smallest level meeting admission p95 ≤1 second, status/history p95 ≤500 ms, infrastructure 5xx <0.5%, no lost jobs and terminal p95 ≤30 minutes for 100 simultaneous users. At least 95% of feasible real-model fixtures must complete, and every success must satisfy mandatory constraints. Mock throughput is not real-model certification. Track quota consumption, inference time, DB pool wait, queue age, attempts, tokens and notifications. Clean up fixture accounts afterwards.

## Production

Apply pending migrations with the existing runner. Provision `travel-planner-journey-production` and `travel-planner-journey-production-dead`. The workflow starts at one consumer and one global inference slot, with rollout 0% and an authenticated canary allowlist. It runs three exact/control cases on V1 and V2 through production, then promotes new requests directly to 100% only after the V2 controls pass. This replaces the staging-only and `PLANNING_V2_CERTIFIED_COMMIT` gates. Keep Queues available for pinned jobs at every rollout percentage. See [the production canary runbook](planning-production-canary.md) for credentials, provider selection, evidence and failure recovery.

Job states, notifications and dispatch records are durable in Postgres. Consumer messages carry only job IDs. Every generate input, including legacy requests, returns `queued`. Legacy input without `planning` describes travel within its selected destinations; missing dates default to today, with a visible scope warning rather than an invented external origin/fare. Send `planning.journey.origin` for a trip that includes outbound/return travel from home. The API commits the job/outbox before sending immediately; cron repairs deferred dispatch. Queue deliveries use job leases, and expired final attempts become terminal failures with a notification. Each account is limited to five outstanding jobs and 20 admissions/minute; v2 has an atomic 100-job global cap within the existing 1,500 total-job cap. A short per-user admission transaction replaces the global advisory lock. AI waits hold no DB connection or transaction. Global inference slots are independent of each invocation's connection pool.

## Generation durability and data rules

Jobs pin `pipeline_version`; v2 jobs keep their `generation_id` through `/retry`. Identical active criteria for the same account coalesce, while all submitted idempotency keys keep pointing to the original job. `force_refresh` creates a deliberate new request. Cache lookup precedes flexible-date selection and remains account scoped, dated and bounded by freshness.

`planning_generations` stores selected dates, DB choices, missing data and completed days. `planning_generation_ai` reserves a unique dispatch ticket before calling the provider and stores the raw response before parsing. Replay resumes this response or checkpoint. A crash after reserving, timeout or failure to persist the response yields `AI_RESULT_UNKNOWN` and consumes the ticket permanently. Retrying the same job cannot invoke AI again. This deliberately trades automatic recovery of an uncertain call for the strict one-dispatch limit. A fresh request is required if the user intentionally chooses another inference.

Backend assembly reserves main journey legs before sightseeing, sets provisional local time allowances, adds check-in/out per city, validates meals, overlap, duplicate venues and complete scoped pricing, and computes 10% contingency. AI only fills missing whole-trip data once: at most 16,000 prompt/schema bytes, 6,000 output tokens and a 180-second inference deadline. Optional repeated context is removed before rejecting oversized mandatory input. City coordinates/timezones come from the resolver; AI venue suggestions remain private to the itinerary. Missing mandatory costs and infeasible budgets cannot become successful plans. A short return-slot description cannot reject a trip.

## Local verification without staging

Use an isolated local PostgreSQL database whose name contains `test`, with migrations and runtime RLS grants applied. These scripts refuse remote databases:

```sh
PLANNING_V2_TEST_URL='<local-test-url>' ./apps/server/node_modules/.bin/tsx --tsconfig apps/server/tsconfig.json scripts/check-generation-v2.mts
PLANNING_V2_TEST_URL='<local-test-url>' ./apps/server/node_modules/.bin/tsx --tsconfig apps/server/tsconfig.json scripts/check-generation-v2-pipeline.mts
```

The first script covers 100 admissions, capacity, aliases, replay, uncertain dispatch and stale checkpoint claims. The second uses actual catalog queries and persistence for 100 accounts, mock inference and duplicate simulated deliveries; it checks ten-day results, budget completeness, no duplicate itineraries and no shared catalog ingestion. CI runs both. Neither exercises Cloudflare Queue delivery or production model quota.

`scripts/check-generation-v2-live.mts` additionally requires `PLANNING_LIVE_MODEL=true`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN` and a resolver contact URL (`NEXT_PUBLIC_APP_URL`). It uses the exact MY/SG request, one real model call, and local persistence; report/response/checkpoint go to ignored `test-results/generation-v2-live/result.json`. Credentials are never logged.

No isolated staging environment is required for the bounded production canary. Technical and real-model candidate checks run against an isolated local database before deployment; synthetic staging fixtures never run in production. After deployment, dedicated authenticated accounts run the same cases against the actual production API and Queue. Quota, invalid output, resolver failure or invalid successful plans block promotion. Setting rollout to zero retains Queue, ledger and checkpoints for already pinned V2 jobs; it does not convert them to legacy jobs.

Monitor p95 reads, HTTP 429/5xx, DB connection wait, job age, worker concurrency and notification counts. Lower the consumer concurrency when provider quota or DB capacity is under pressure. Inspect failed deliveries alongside dispatch records before replaying anything. A staged rollout should establish actual provider capacity independently of the mock result.

## Security CI

Make `Security Gate` a required PR check in branch protection. The Cloudflare and Vercel jobs defined in the repository both depend on it. Configure the separate `security-sandbox` environment and its test-only credentials to enable the manual provider checks. A provider marked `mock-only` did not receive a live call. The dependency check reports inherited high and critical advisories and fails when a change introduces a new affected dependency path. Address inherited advisories separately before certifying production readiness.

## Request inventory

| Flow | Browser request policy | Backend work |
| --- | --- | --- |
| Sign-in and session renewal | Existing session restore, refresh and retry behavior | JWT and Postgres sessions. OAuth and SMTP only for their own auth operations |
| Destination input | City search debounce. Country aliases resolved locally, with one cached country request per code | City catalog lookup. Explicit geocoding uses the configured provider |
| Planner submission | Shared validation and one idempotent POST | Atomic admission, outbox and queued notification |
| Job progress and history | Foreground backoff, lightweight grouped status reads, full list on entry | Owner-scoped job read. Consumer claims job and calls AI or mock |
| Workspace | One bootstrap request for overview, detail calls when opening relevant tabs | Membership and role checks before loading trip data |
| Notification bell | One badge reader, paged list on open | Current recipient and membership checks. No outbound provider calls |
| Scheduled work | Independent of web navigation | Queue dispatch and lease recovery, catalog and feedback delivery |

Use the `X-Request-Id` response header to correlate an API request with sampled `http.request` records. Records use route templates and contain status, elapsed time and SQL queries counted by the shared SQL client. Use Hyperdrive metrics for connection wait, and job records for queue age and attempt counts.
