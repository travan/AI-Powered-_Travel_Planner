# Complete journey MVP

The journey MVP is now integrated into the unified bilingual form at `/plan`.
See [Unified planner and i18n](unified-planner-i18n.md) for the current UI, language,
translation API, migrations and deployment instructions. The API flag
`JOURNEY_MVP_ENABLED=false` pauses structured generation and the queue worker;
it does not select a second web form.

## Run and migrate

Use the existing local `db:init` command for local databases. It applies the two
new `20261026` migrations and grants the dedicated backend role access to the
server-only RLS tables. The Cloudflare bootstrap also picks up these migrations;
its existing private-schema rewrite and backend policies remain in use. Do not
run the local migration runner against a production Supabase database.

The queue is PostgreSQL-backed. Local Nest runs a polling worker; Cloudflare's
scheduled handler runs the same worker. Configure the scheduled trigger when
deploying Cloudflare. No request handler starts untracked background promises.
Jobs have leases, claim tokens, three attempts, retry delay and terminal failure
for expired exhausted leases. Browser polling is every three seconds and survives
reload through `/plan/jobs/:jobId`. Progress names are real processing stages.

## Request contract

Existing `GenerateRequest` fields remain accepted for legacy clients. New clients
send `planning` with `schema_version: 2` and these validated groups:

- `journey`: origin, ordered destinations, return flag, optional endpoint, timezone.
- `travelers`: adults and child ages.
- `budget`: total for the entire group and currency (authoritative for v2).
- `transport_preferences`: mode, destination arrival, return departure, airport
  buffer and any user-confirmed ticket information.
- `stay_preferences`: type, rooms, nightly per-room budget, requirements and any
  user-provided booked stay.
- `dining_preferences`: required/preferred requirements, mandatory allergy list,
  per-person budget, café criteria and independent venue preference.
- `experience_preferences`: pace, interests, required/preferred requirements.

`prompt_text` is free text, not a container for these groups. Existing saved
legacy JSON notes are preserved. V2 output adds stable IDs, typed timeline kinds,
scoped prices, evidence, criteria and machine-generated issues. Model claims of
catalog provenance are checked against supplied catalog names; unknown items
remain AI suggestions. No live price, availability or booking confirmation is
inferred from a link.

## Endpoints

- `GET /api/planning/config`: feature flag and defaults.
- `POST /api/locations/resolve`: text or latitude/longitude; returns catalog cities
  and hubs. Distance is straight-line and a user must confirm the candidate.
- `POST /api/planning/validate`: same request contract, returns `valid` and issues.
- `POST /api/itinerary/generate`: v2 returns queued job; legacy clients retain the
  existing synchronous/cached response.
- `GET /api/itinerary/jobs/:jobId`: creator-only job status.
- `GET/POST /api/trips/:tripId/accommodations`,
  `PATCH /api/trips/:tripId/accommodations/:id`: membership-protected stay records.
  PATCH takes the editable record fields plus its `version`; stale writes return 409. Viewers cannot write, and contributors can edit only their own records.
  Total = rooms × nights × nightly price. `booked` requires explicit user input.
- `GET/PATCH /api/trips/:tripId/planning`: effective plan and stable item locks.
  PATCH supplies `expected_version` and `locked_ids`.
- `POST/GET /api/trips/:tripId/itinerary-revisions`: queue partial regeneration or
  list previews/history. Scope is `day`, `meal`, `stay` or `restore`; supply target
  ID or restore revision ID, instruction and `expected_version`.
- `POST /api/trips/:tripId/itinerary-revisions/:revisionId/apply`: host/co-host
  applies a preview with `expected_version`. Contributors may propose revisions.
  A transaction checks membership and locks the trip, applies the plan, syncs
  linked schedule entries and records the revision. Invalid/stale candidates do
  not apply. Existing unrelated schedule entries remain intact.
- `GET /api/trips/:tripId/planning-checklist`,
  `PATCH /api/trips/:tripId/planning-checklist/:id`: generated todo items with
  explicit user-set status. Existing completed items are never reset.
- Existing recommendations accept `citySlug`, `category`, `q`, `tags` (CSV),
  `maxPrice`, `currency`, `independentOnly` and `limit`. Filters require matching
  catalog data; unknown prices/tags never count as verified matches.
- Existing activities accept optional `source_plan_item_id` to retain identity
  across schedule imports and revisions. Existing transport-booking APIs remain.

Schedule, transport and accommodation writes increment the trip's plan version
through database triggers, invalidating outstanding previews. Flight times and
booked stays are fixed anchors. Locked activities survive regeneration and
restore. Restoration creates another preview instead of immediately overwriting.

## Verification

Typecheck both web and server. Unit tests cover criteria validation, dates and
flight buffers, stable IDs, legacy notes, unified form submission, geolocation,
restoration and recommendation link handling.

For API integration, use a migrated **isolated localhost** database:

```sh
JOURNEY_TEST_DATABASE_URL=postgresql://...@localhost:55439/test_db \
  node apps/server/node_modules/tsx/dist/cli.mjs \
  --tsconfig apps/server/tsconfig.json e2e/regression/complete-journey.mts
```

Build `apps/server` first; this suite imports compiled Nest controllers so DTO
metadata and request validation run exactly as in production. It uses mock AI,
not paid provider calls. It checks the three acceptance journeys, ownership,
viewer restrictions, room totals, conflicts, previews, apply, restore and expired
leases. Run with the dedicated non-superuser app role to verify RLS policies too.

With the web dev server on localhost:3107, run
`node e2e/regression/journey-wizard-ui.mjs` for desktop/mobile wizard checks with
mocked APIs. Screenshots are saved under `/private/tmp`.

Provider model context/output limits still apply. Catalog gaps and unverified
requirements are visible issues. Road travel times, real-time room inventory,
prices, payments, refunds and embedded maps are outside this MVP.
