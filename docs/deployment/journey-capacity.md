# Journey queue and notification rollout

## Staging

Use a separate Postgres database, Hyperdrive binding and web origin. Apply the server migrations with the same migration runner and runtime grants as the target deployment. The runtime role needs RLS policies for `itinerary_jobs`, `journey_job_dispatch` and `product_notifications`. Run the Security Gate before rollout.

Create the Cloudflare queues `travel-planner-journey-staging` and `travel-planner-journey-staging-dead`. Configure the staging Worker JWT secret separately, then generate and validate the deployment configuration.

```sh
STAGING_HYPERDRIVE_ID=<staging-binding-id> STAGING_WEB_ORIGIN=https://<staging-web-origin> \
  node apps/server/cloudflare/prepare-queue-config.mjs staging
pnpm dlx wrangler@4.155.0 deploy --dry-run --config apps/server/wrangler.generated.json
```

Deploy with `--var DEPLOY_COMMIT:<commit-sha>`. The staging config uses the existing mock AI provider, a 30-second job delay and up to 20 consumer invocations. It exposes a load-test marker in `/health`. The test harness checks the marker and exact deployed commit before issuing requests.

Prepare 1,000 synthetic test users with distinct access tokens. For mixed mode, give each user access to a staging test trip. Keep the fixture file outside the repository. Use freshly issued native API sessions with refresh tokens. The harness rotates them during the test. Keep staging accessible only to the test team.

The fixture is a JSON array of `{ "token": "...", "refreshToken": "...", "tripId": "..." }` objects. The planning fixture is a valid request body for `POST /api/itinerary/generate` with a `planning` object and a catalog destination.

```sh
LOAD_MODE=burst STAGING_API_ORIGIN=https://<staging-api-origin> \
  EXPECTED_DEPLOY_COMMIT=<commit-sha> STAGING_FIXTURES=/tmp/cohorizon-fixtures.json \
  STAGING_PLANNER_INPUT=/tmp/cohorizon-job.json k6 run tests/load/journey-capacity.js
```

Repeat with `LOAD_MODE=mixed`. Pass `BASELINE_STATUS_READS` from the corresponding baseline to enforce the polling reduction. Run only on isolated staging and clean up the fixture accounts afterwards. Track DB pool wait, queue age, attempts, and notifications alongside the load summary. Confirm all submitted IDs are unique in the database and each job has the expected notification history.

## Production

Apply migrations ahead of the application rollout. Provision `travel-planner-journey-production` and `travel-planner-journey-production-dead` and set the production environment variable `JOURNEY_QUEUE_CONCURRENCY` using measured AI and database capacity. The existing Cloudflare deployment job uses the generated config when this variable is present. The base config retains cron processing until queues are provisioned.

Job states, notifications and dispatch records are durable in Postgres. Consumer messages carry only job IDs. Cron reserves due dispatch records in batches and retries reservations that did not produce a claim. Queue deliveries use job leases, and expired final attempts become terminal failures with a notification. User submissions are limited to five outstanding jobs and 20 new jobs per minute. The global outstanding limit is 1,500 jobs. The generated Worker config applies separate distributed limits for public search, journey admission and status/inbox reads. These limits protect the ingress. Postgres enforces the strict per-account and global admission quotas.

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
