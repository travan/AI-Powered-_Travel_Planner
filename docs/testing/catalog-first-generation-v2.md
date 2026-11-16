# Catalog-first generation v2 — implementation verification

Date: 2026-11-16. The original verification below is historical and does not certify the current candidate or production generation. The new release procedure is the [production canary](../deployment/planning-production-canary.md), with no staging prerequisite.

## Current implementation follow-up

- Added named destination context from bare country IDs, configurable V2 Cloudflare/Claude/OpenAI/Gemini adapters, bounded public day/slot diagnostics and logistics-specific description validation.
- Independent dining is now a preference with a warning; allergies and explicit required restrictions still block unverified results.
- The regression fixture is now the exact supplied request, without destination names/references. Earlier live reports used a fixture enriched with those optional fields.
- Rechecked production job `8d40383b-8eaa-4be1-94d7-430c9b7344e4`: V1, 18 model calls, failed after the day-10 repair. Its stored public diagnostics are empty; access to historical Workers Logs returned 403, so the exact failing slot is not claimed as known.
- Current candidate: 643 unit tests, 20 local API integration tests (one browser-only case skipped), four quota browser tests at desktop/mobile widths, and server/web/mobile type checks passed. The local PostgreSQL durability check admitted 100 unique jobs; the mock pipeline completed 100/100 ten-day jobs with no duplicate itineraries and exactly 100 mock calls. These are not production model certifications. Real-model control on 2026-11-16 returned HTTP 429, Cloudflare code 4006 (`AI_QUOTA_EXHAUSTED`). This is a failed live gate, not a certification. Do not promote until real-model and production canary checks pass.


## Implemented

- All generate inputs return an asynchronous job. Legacy inputs without `planning` retain a destination-only route, default dates when absent, and an explicit warning that external home-to-destination travel is outside their scope. Pipeline selection is pinned per job; v2 uses cache → priced/fresh DB catalog/templates → one compact missing-data request → backend scheduling/validation → atomic persistence.
- Unique generation dispatch ledger, raw response persistence, checkpoints, active request coalescing, idempotency aliases, owner/claim guards and same-generation retries. Unknown inference outcomes consume the ticket and never trigger another call. Global slot ceilings were checked with competing SQL workers at 1/2/4/8/16.
- Atomic global admission limit of 100 v2 jobs, five outstanding jobs/account, 20 admissions/minute/account and global inference slots. Outbox commit precedes immediate dispatch. Enabled v2 requires Queue; cron only repairs dispatch/leases.
- Main travel duration allowances, per-city check-in/out, complete scoped prices, 10% contingency, duplicate/meal/overlap checks and explicit errors. Spending caps are not substituted for unknown prices. AI suggestions stay out of catalog ingestion.
- Web/mobile queued-result handling and new error messages. Additive migrations use the existing runner/RLS/grants. CI checks migration parity, local durability/pipeline regressions and deployed Queue producer/consumer/DLQ settings.
- Catalog prices are indexed and candidates sorted once per city, replacing repeated full scans/sorts for every activity slot.

## Results and limits

| Check | Result |
| --- | --- |
| Unit suite | 615 tests passed; separate regression tests include recorded real output, short return descriptions, explicit cost units and interrupted inference/persistence |
| Worldwide routing matrix | 120 synthetic tests across 12 cities and their 12 countries, in five modes: complete DB, missing prices, empty DB, unverified required independent dining and resolver downtime. 72 expected completions and 48 expected controlled failures; not live model/resolver coverage |
| API integration | 19 tests passed in full run; the remaining learning test was adapted to queued generation and both learning tests passed on rerun. One browser-only conditional test was skipped |
| Type checks | Server, web and mobile passed |
| Mobile browser | Seven queued/detail/results tests passed using authenticated job polling |
| Migrations | All 27 migrations applied on isolated PostgreSQL; local/cloud schema structure and checksums match |
| Admission/durability on PostgreSQL | 100 unique jobs; admission p95 166 ms; overflow rejected; retry preserves generation/response and quotas; unknown response never dispatched again |
| Full local pipeline | 100/100 complete ten-day plans; real catalog queries, real SQL persistence, mock inference, duplicate simulated deliveries; exactly 100 mock calls, no duplicate itineraries or catalog ingestion |
| Full local timing | Admission p95 137 ms; owner-status read p95 1 ms; terminal p95 3.31 seconds with four workers and 50 ms mock inference |
| Complete catalog | Separate real-SQL fixture completed with zero AI calls |
| Worker build | Cloudflare Wrangler dry-run bundle passed |
| Real model, exact FE payload | One call to the existing Llama model; 55.3 seconds end-to-end, 1,720 input + 1,727 output tokens. Returned `PLANNING_BUDGET_UNSATISFIABLE`, reason `mandatory_travel_and_stay_exceed_budget` |

The real response proposed main travel of 6m VND/person, lodging of 1.5m VND/room/night in Malaysia and 2.5m in Singapore. For two travelers, one room, five MY nights and four SG nights, these proposed mandatory costs alone total 29.5m VND, or 32.45m including contingency, before meals/activities. This explains rejection of that proposal; it does not prove no cheaper real trip exists. The response is retained as a regression fixture.

An earlier live call reached the city resolver and failed with 503; local DNS could not resolve `nominatim.openstreetmap.org`. Full worldwide resolver success has therefore not been certified.

Local mock timing does not certify Cloudflare Queue throughput, real model quota, HTTP latency under production traffic or the required ≥95% completion rate for feasible real-model fixtures.

## Release gate

The old staging-only release requirement is superseded by the [production canary runbook](../deployment/planning-production-canary.md). Local mock checks never certify model quality. Candidate model checks and actual production comparison must pass; quota exhaustion blocks promotion. The 100-account staging load experiment remains optional future capacity evidence, not a substitute for these real generation checks.

## Worldwide coverage follow-up

The matrix includes Tokyo/Japan, Paris/France, New York/USA, London/UK, Sydney/Australia, Cape Town/South Africa, Rio/Brazil, Cairo/Egypt, Reykjavík/Iceland, Đà Nẵng/Vietnam, Auckland/New Zealand and Singapore. These fixtures test backend routing, provenance and the zero/one-call rule with synthetic catalog/pricing and a mock resolver/model. They do not certify venue availability, realistic international travel times/prices or live inference quality for these locations.

The earlier independent-dining failure expectation is superseded: `independent_only=true` now generates a warning when verification is unavailable. It never claims verification from an AI venue name. Allergies and explicit required dining restrictions still require evidence. Resolver 429/503 during supplementation now stays `LOCATION_LOOKUP_UNAVAILABLE` instead of becoming an unexplained `PLANNING_FAILED`. Consequently, universal successful generation for arbitrary destinations is not a verified or supported guarantee at this stage.
