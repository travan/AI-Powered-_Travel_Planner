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

## User-facing quota recovery

Quota exhaustion is distinct from invalid itinerary output. Web and mobile retain the saved request and explain whether an estimated recovery time is available. For Cloudflare daily allocation only, the backend reports the next 00:00 UTC (07:00 Vietnam time) as an expected reset, not a guarantee. Other providers do not receive an invented daily reset. Temporary capacity/rate-limit errors are separate from quota exhaustion.

Web disables legacy retry until a known reset. A consumed V2 quota ticket is never resumed as a fresh inference; users return to the saved planner draft and create a new request after recovery. No job automatically starts when the clock reaches reset. Personal API keys, token purchases and app billing are deferred; this release uses the configured service provider and only the dedicated CI canary account.

## City resolution availability

City lookup keeps Nominatim as primary and uses the OSM-backed [Photon API](https://github.com/komoot/photon/blob/master/docs/api-v1.md) when primary lookup is unavailable or returns no candidates. City types, ISO country, coordinates and OSM identifiers are validated before caching; only an offered cached source ID can become a canonical city. Venue lookup does not fail over. Explicit primary rate limiting is not bypassed. Photon has a separate shared one-request/second lease and the same 30-day cache. `PHOTON_BASE_URL` can point to a managed/self-hosted instance; the public demo has no availability guarantee. AI provider selection is unchanged by geocoder failover.
