# Planning memory and training datasets

The application uses stored history to improve the context supplied to the existing model. Saving data does not retrain model weights. No training provider job, paid fine-tune, or automatic data upload is started.

## What is saved

`planner_learning_events` records accepted requests, every returned result (including cache hits), initial/repaired model candidates, generated plans, saved plans, revisions, feedback, manually entered activities and expense changes. Business-table triggers capture their snapshots in the same transaction as the underlying write. Existing itinerary records are backfilled as historical outputs without treating them as positive training labels. Original requests and generated content remain available internally; generated content is not automatically promoted to verified knowledge.

`trip_plan_revisions` retains the user's instruction and revision scope. Reviewed feedback stores an immutable copy of the plan being reviewed, including its applied trip revision. Foreign account feedback is rejected. Deleting the owning account cascades to learning settings, feedback and event history.

## How future plans improve

- Stable city IDs and accent-insensitive lookup keys unify Vietnamese/English names. For example, `Bắc Kinh`, `bac kinh` and `Beijing` resolve to `beijing`; `Đài Bắc` and `Taipei` resolve to `taipei`. Names are stored as English canonical labels plus localized display labels. New city names are resolved on explicit submission; one unambiguous provider result can be accepted automatically, while multiple locations still require a country/region choice. External geocoding is never used for autocomplete.
- Memory reads only the authenticated user's previous requests, current profile preferences, feedback, revision instructions and approved manually added activities on trips they can still access. The original prompt-history table is also consulted for older requests.
- Approved expense entries are grouped by canonical city, currency, category and party size. Pending/rejected entries, other currencies, other party sizes and inaccessible trips are excluded. Medians/ranges are labeled as historical per-charge observations, not daily totals or live quotations. Unclassified entries are excluded unless an associated activity gives a category.
- The existing model receives bounded historical context. Explicit current restrictions, budget and confirmed bookings take precedence. Changes to feedback or matching cost observations change the generation cache key. Repeating the exact same request with unchanged context can still reuse its result; every reuse is recorded.

## User controls and APIs

The itinerary and saved-trip panels collect ratings and feedback. The profile page contains the memory toggle, dataset-preparation opt-in and JSONL download. Expense entry includes a category selector.

- `GET/PATCH /api/learning/settings`: authenticated personal settings. Memory defaults on; training dataset consent defaults off.
- `POST /api/itinerary/:id/feedback`: owner-only rating 1–5 and optional note.
- `POST /api/trips/:tripId/learning-feedback`: owner-only review of the applied trip plan.
- `GET /api/learning/dataset`: private, non-cacheable JSONL export requiring explicit training consent.

Disabling memory stops historical context from being used for generation; ordinary saved planning history remains available as part of the app. Revoking training consent immediately disables further exports through these tools. Already downloaded files remain under the recipient's control.

## Feedback email delivery

Apply the backend migrations before releasing the feedback endpoint. Configure the existing server-only `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_FROM`, `SMTP_USER` and `SMTP_PASSWORD` on the API runtime. Use a verified sender and an encrypted public SMTP endpoint for the Cloudflare Worker, such as implicit TLS on port 465. The existing Worker cron drains the queue. Nest drains it on a local timer. A missing SMTP configuration leaves requests queued.

Feedback submissions and mail queue entries commit together. Identical resubmissions of the current rating, note and snapshot reuse the saved feedback. The worker retries failures and uses the same Message-ID across attempts. A crash after the relay accepts a message and before the database records delivery can cause a repeat. The queue clears its copy of the message text after delivery.

Create the Gmail label **Phản hồi lịch trình**, then import [planner-feedback-gmail.xml](planner-feedback-gmail.xml) from **Settings → Filters and Blocked Addresses → Import filters**. The filters label subjects containing `Horizon Planner Feedback` and star subjects containing `Horizon Planner Feedback Priority` for ratings 1–3. After configuring SMTP and the filters, submit a test rating of 2 and check the inbox, label, star and delivery timestamp in `planner_feedback_mail`.

## Dataset quality and privacy

Plan samples require rating 4–5 and no major completeness, budget or timing errors. The initial projection exports structured schedule/category/duration/cost features; it excludes raw prompts, free-text notes, venue narratives, personal names, addresses, exact dates, coordinates, account IDs and booking references. Rich original content stays in the internal event history for a later reviewed/licensed corpus. Approved spending samples require at least three comparable expense entries. This avoids relabeling an AI draft as ground truth or overweighting a single charge.

For operator collection across accounts, first build the server and run:

```sh
pnpm --dir apps/server build
pnpm learning:export --database local
pnpm learning:export --database cloud --output .training-data/cloud-training.jsonl
```

The exporter uses the same filters, scans only opted-in accounts, writes files with private permissions, adds an unlinkable per-export anonymous group for dataset splitting, and produces a count/checksum manifest. `.training-data/` is excluded from Git and Vercel uploads. An empty export is valid when no account has opted in or no reviewed sample is eligible. Exporting is not model training; a later training/evaluation pipeline must select a target model and compare quality before release.

## Verification

The learning E2E suite covers bilingual identity, persistence of repeated cache responses, private feedback authorization, approved expense medians appearing in subsequent prompts, account isolation, opt-in gating, filtered dataset contents and memory disablement. The database parity check applies migrations to both schema layouts and verifies bilingual reference merges and conflict rollback. Unit tests cover normalization, ambiguous locations, private field filtering and memory/consent gates.

## Production rollout — November 4, 2026

Both real local PostgreSQL and Supabase `travel_cloud` now have 22 migrations, including memory capture and bilingual reference reconciliation. Read-only metadata comparison confirms equal columns, constraints, indexes, migration checksums and reference-catalog versions. The backend runtime role successfully read private memory, queried approved spending/dataset projections and wrote settings/events in a rolled-back verification transaction. All 54 cloud application tables have RLS enabled. No users or trips were copied between environments.

Cloud retains three country-level legacy inputs (`nga`, `russia`, `taiwan`) requiring an actual city, plus a `bắc-kinh` alias whose activity-catalog references conflict with existing canonical entries. The migration records that conflict and preserves the records. Generation resolves the alias to verified `beijing`; search suppresses incomplete aliases when an identified city is available. No country input is silently treated as a capital city.

Validation passed: 339 unit tests, server/web type checks, production Next.js build, 16 real PostgreSQL/API E2E tests, and fresh/upgrade/repeated migration parity checks. CI now runs the API suite with a dedicated application role after schema parity. Both local and cloud operator exports completed with zero records because no existing account has opted in.

Backend release `working-0f69d337cc310247`, Worker version `44fb847c-1936-4e5c-b1ff-df85ec36ffbf`, and Vercel production deployment `dpl_AejsSRwSq9P4iBDct7ZemigJAB8V` are deployed. Public smoke checks verify the exact backend release, database health and bilingual search; anonymous memory/dataset access returns 401. Browser verification confirms the published privacy page describes the memory controls and dataset opt-in. The upload manifest contains no regular environment or training-data files.

## Catalog-first generation and measurement

Apply the planning reuse migration before deploying the worker. The Cloudflare
worker defaults to `PLANNING_CATALOG_PERCENT=0`. Use `100` on an isolated
staging deployment for the catalog run and `0` for the legacy run. A percentage
selects a stable cohort by job ID. A job with stored progress continues on its
original strategy so retries can reuse finished days. The catalog cohort
currently accepts structured planner requests. Free-form instructions continue
through the existing generator.

Run fresh (non-cache) fixtures for 1, 3, and 10 days, including Hanoi → Busan,
with the same model, catalog snapshot and trip constraints. Run a separate
cache-hit fixture. The server records per-attempt metrics and uses nullable
token fields for missing provider data. The job that started at 09:19 on
November 12, 2026 is a historical failure reference: nine AI calls and
approximately 2,146 Neurons before any complete day.

For each matched staging window, export aggregate measurements with:

```sh
PLANNING_METRICS_DATABASE_URL=… node scripts/report-planning-usage.mjs <start-ISO> <end-ISO>
```

Use a TLS-configured application-role URL. Compare completion, catalog-day
share, calls by stage, and estimated Neurons per completed job, including
consumption from failed jobs. Estimated Neurons are currently calculated for
the configured Llama 3.3 70B model. A missing token count or an unpriced model
leaves the comparison metric blank. Keep production rollout at 0 until the
matched 10-day run shows at least 30% savings and passes the same route,
schedule, booking and budget checks. Increase the cohort gradually after that.

The migration seeds shared templates from fresh catalog references. A reviewed
shared template can be entered by the application operator with verified
references and an approval flag. AI additions stay in the private itinerary
and checkpoint until reviewed. Dataset export continues to require the existing
training consent and quality checks.
