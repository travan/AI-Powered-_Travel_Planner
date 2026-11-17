# Production planning canary and provider selection

## Release contract

No staging environment is required. The production workflow runs technical checks and three real-model candidate cases against an isolated local test database, deploys the candidate with `PLANNING_V2_PERCENT=0`, compares three cases on each pipeline through the production API, and promotes to 100% only if V2 passes. Producer, consumer, DLQ and global AI concurrency start at one. The final smoke uses the ordinary API without a pipeline override.

Production jobs pin their pipeline. A failed canary blocks promotion; it never reroutes V2 jobs to V1. Existing pinned jobs retain their Queue, checkpoint and ledger. Set the percentage back to zero to stop new general V2 admissions while investigating; retain Queue bindings to finish admitted work. The bounded canary does not certify 100-account capacity or a population success rate.

## Configuration

The GitHub `production` environment needs `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_MIGRATION_DATABASE_URL`, `PLANNING_CANARY_EMAIL` and `PLANNING_CANARY_PASSWORD` secrets. The dedicated account is created through the ordinary native registration API if it does not exist. Its UUID is configured as the backend canary allowlist for that deployment. Only the dedicated CI account is configured; no personal account receives override access.

`X-Planning-Pipeline: v1|v2` is accepted only after JWT authentication for an allowlisted user; others receive 403. The override is not a frontend feature. No provider/key is accepted from the request. Use a distinct idempotency key for each case and pipeline; reuse it when recovering a runner interruption. Do not resubmit with a different key automatically.

| Provider variable `AI_PROVIDER` | Model variable | API secret |
| --- | --- | --- |
| `cloudflare` (default) | `CLOUDFLARE_AI_MODEL` (existing Llama default) | Workers AI binding |
| `claude` | `ANTHROPIC_MODEL` | `ANTHROPIC_API_KEY` |
| `openai` | `OPENAI_MODEL` | `OPENAI_API_KEY` |
| `gemini` | `GEMINI_MODEL` | `GEMINI_API_KEY` |

Set these as GitHub production environment variables/secrets. The workflow validates the selected model and syncs available third-party secrets using a private temporary file. Missing keys/models fail before dispatch. V2 never silently selects Mock or another provider. Synthetic staging mocks remain explicitly restricted to `PLANNING_STAGING=true`.

The external adapters send one HTTPS request with a 120-second timeout and no automatic retry. Cloudflare binding requests use the same 120-second ledger deadline. An unresolved binding call retains its capacity lease until it settles and cannot be dispatched again. Raw business content is persisted before JSON validation. Timeout/unknown response consumes the dispatch ticket, so retrying that generation cannot incur a second inference. No API key, authorization header or raw provider error is written into usage or public responses.

## Cases and pass criteria

`tests/fixtures/malaysia-singapore-request.json` is the exact captured request, without optional destination names. It retains January 2027 deliberately; renew the dated live cases before that window expires, keeping this fixture for historical regression. Two controls use the same route at 200m VND and a three-day Da Nang trip at 30m VND. The runner adds only `force_refresh=true` to bypass cache; the stored fixture is unchanged.

The comparison submits at most six jobs sequentially, polls each for at most 30 minutes, and never retries generation automatically. The original case may report an explicit budget rejection; this is recorded as `constraint_rejected`, **not** successful generation. Both V2 controls must complete. AI errors, timeouts, missing jobs and invalid successes fail the gate. Successful plans are checked for dates, destination order, resolver-backed country association, outbound/return legs, meal coverage, non-overlapping times, priced activities, budget completeness and duplicate visits. The final promoted smoke adds one ordinary V2 control job.

Independent dining is a preference: unverified suggestions receive a warning. Allergies and explicit required restrictions remain mandatory. Estimated prices are not verified quotes and cannot be made up as zero to force a budget fit.

Reports are uploaded for seven days under `planning-production-<commit>-<run>`, including failures. They contain synthetic test plans, job IDs, actual pipeline, provider/model, calls, tokens, durations and bounded validation codes. They contain no session credentials. Provider adapters without configured credentials have contract tests only; do not claim they received a live call.

## Manual recovery

Use the same production environment and tested source revision as CI. Prepare configuration with the canary UUIDs, `JOURNEY_QUEUE_CONCURRENCY=1`, `PLANNING_AI_CONCURRENCY=1` and `PLANNING_V2_PERCENT=0`, then run:

```sh
node apps/server/cloudflare/prepare-queue-config.mjs production
WRANGLER_CONFIG=apps/server/wrangler.generated.json node scripts/provision-planning-queues.mjs
pnpm dlx wrangler@4.155.0 deploy --dry-run --config apps/server/wrangler.generated.json
```

Deploy only after the candidate real-model gates pass. Set `API_BASE_URL`, `EXPECTED_DEPLOY_COMMIT`, dedicated account credentials, and `PLANNING_CANARY_RUN_ID` for `node scripts/check-production-generation.mjs`. The comparison requires health to report 0% and a bound Queue; promoted mode requires 100%. A Cloudflare 429/4006 is exhausted quota and blocks release. Restore quota or explicitly configure and test another provider; do not bypass the gate or automatically switch providers.

## Deploying a merged commit while GitHub Actions is blocked

GitHub-hosted runner billing can prevent the automatic deploy job from starting. It does not prevent uploading a Worker with Wrangler from a local machine. Local verification does not turn failed GitHub check statuses green. Keep the merge decision separate from the production generation gate.

Use Node 22 and pnpm 10.15.0. Check out and pull the merged `main` commit, install with the frozen lockfile, and complete the local equivalents of the quality, security, database, API and browser checks. The validation report must identify the tested source revision. Do not deploy a different application revision based on an older report.

Wrangler can use `CLOUDFLARE_API_TOKEN` from the environment or an existing `pnpm dlx wrangler@4.155.0 login` session. The provisioning and binding verification scripts now support both: they capture `wrangler auth token --json` internally and never print the credential. No GitHub billing change is needed for this path. Global API key/email authentication is not supported by these scripts; use a scoped API token or OAuth login.

Load the existing dedicated CI UUID as `PLANNING_CANARY_USER_IDS`; do not add personal accounts. Load any selected provider secrets and database migration credentials from a private environment/secret manager. The following commands upload only the bounded **0% canary**, after the technical and candidate gates have passed:

```sh
set -euo pipefail
: "${PLANNING_CANARY_USER_IDS:?Set the dedicated CI canary UUID}"
DEPLOY_COMMIT="$(git rev-parse HEAD)"
export WRANGLER_CONFIG=apps/server/wrangler.generated.json
export JOURNEY_QUEUE_CONCURRENCY=1 PLANNING_AI_CONCURRENCY=1 PLANNING_V2_PERCENT=0
node apps/server/cloudflare/prepare-queue-config.mjs production
node scripts/sync-planning-secrets.mjs
node scripts/provision-planning-queues.mjs
pnpm dlx wrangler@4.155.0 deploy --dry-run --config "$WRANGLER_CONFIG"
node --env-file=.env.cloudflare.local scripts/init-cloudflare-postgres.mjs --ci
node --env-file=.env.cloudflare.local scripts/init-cloudflare-postgres.mjs --ci --apply
pnpm dlx wrangler@4.155.0 deploy --config "$WRANGLER_CONFIG" --var "DEPLOY_COMMIT:$DEPLOY_COMMIT"
API_BASE_URL=https://travel-planner-api.travan-it-96.workers.dev \
EXPECTED_DEPLOY_COMMIT="$DEPLOY_COMMIT" EXPECTED_PLANNING_V2_PERCENT=0 \
EXPECTED_PLANNING_CANARY=true node scripts/smoke-cloudflare.mjs
node scripts/check-planning-bindings.mjs
```

Then run `scripts/check-production-generation.mjs` with that exact commit, the CI account credentials and a stable `PLANNING_CANARY_RUN_ID`. It submits at most six sequential cases and stops on a failed V2 gate. An exhausted model quota still blocks this step even though Worker upload is available. Only a passing comparison allows changing `PLANNING_V2_PERCENT` to 100 and redeploying the same commit. Verify health/revision/bindings and run `PLANNING_CANARY_MODE=promoted` without an override; return the percentage to zero and retain the Queue if verification fails. Do not interpret a successful upload or health check as a successful generation gate.

## User-facing quota recovery

Quota exhaustion is distinct from invalid itinerary output. Web and mobile retain the saved request and explain whether an estimated recovery time is available. For Cloudflare daily allocation only, the backend reports the next 00:00 UTC (07:00 Vietnam time) as an expected reset, not a guarantee. Other providers do not receive an invented daily reset. Temporary capacity/rate-limit errors are separate from quota exhaustion.

Web disables legacy retry until a known reset. A consumed V2 quota ticket is never resumed as a fresh inference; users return to the saved planner draft and create a new request after recovery. No job automatically starts when the clock reaches reset. Personal API keys, token purchases and app billing are deferred; this release uses the configured service provider and only the dedicated CI canary account.

## City resolution availability

City lookup keeps Nominatim as primary and uses the OSM-backed [Photon API](https://github.com/komoot/photon/blob/master/docs/api-v1.md) when primary lookup is unavailable or returns no candidates. City types, ISO country, coordinates and OSM identifiers are validated before caching; only an offered cached source ID can become a canonical city. Venue lookup does not fail over. Explicit primary rate limiting is not bypassed. Photon has a separate shared one-request/second lease and the same 30-day cache. `PHOTON_BASE_URL` can point to a managed/self-hosted instance; the public demo has no availability guarantee. AI provider selection is unchanged by geocoder failover.
