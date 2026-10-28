# Regression checks

`local-postgres-auth.mjs` covers the real local stack path that the mock API
contracts do not exercise: PostgreSQL signup, authenticated `/me`, logout,
session revocation, and login.

Start the local database and API first:

```bash
pnpm db:local:up
pnpm db:local:init
pnpm dev:server
```

Then run `pnpm test:regression:local-auth`. The check creates one temporary
account and removes it from the local database when it finishes. It refuses a
non-local `POSTGRES_ADMIN_URL`.

## Unified planner and calendar

With the current production web build running on `127.0.0.1:3107`:

```bash
node e2e/regression/journey-wizard-ui.mjs
```

This uses isolated Chromium contexts with API fixtures on desktop (1440px) and
mobile (390px). It covers the date calendar, disabled return dates, automatic
return adjustment, EN/VI, group budget/currency, style/travelers, optional allergy,
draft save/reload and guest submission through the login redirect. It asserts
request criteria survive and checks overflow and uncaught browser errors. It does
not log in or claim to test the provider's generated itinerary in the browser.

For the real API/PostgreSQL lifecycle, set `JOURNEY_TEST_DATABASE_URL` to an
isolated localhost test database with migrations, then run:

```bash
node --import ./apps/server/node_modules/tsx/dist/loader.mjs e2e/regression/complete-journey.mts
```

This uses fixture users with mock auth tokens and mock AI, and removes its own
users/trips afterward. It covers flight return, multi-city car, duration-based
day trip with dietary constraints, save/reopen, accommodations, revisions,
permissions, version conflicts, translations, retries and crashed jobs. Never
point it at production. Exact-date trips require return after departure; the
one-day scenario uses `num_days: 1` without equal start/end dates.

Verified on 2026-10-28 after the calendar update: 213 unit tests passed; both
browser viewports passed; all API/PostgreSQL scenarios passed. Live AI quality
and a single browser run through real sign-in/generation remain separate checks.

## CI suite after the unified planner migration

GitHub E2E jobs pin `ubuntu-24.04` because Playwright 1.59 cannot install Chromium
on the Ubuntu 26.04 image now selected by `ubuntu-latest`. Browser installation
uses `playwright install --with-deps chromium`; no test jobs are skipped.

The regular Playwright test list now includes `web.planner.spec.ts` on desktop
and responsive mobile. It exercises structured criteria, the date calendar,
automatic return-date adjustment, locale preservation, durable-job polling,
result rendering and saving into the workspace. Legacy cached/SSE generation,
expired sessions, draft fallback and Explore preselection are retained.

Local verification with Node 22 after the CI fix: `pnpm lint`, `pnpm type-check`,
`pnpm test:coverage` (214 tests), `pnpm build:unified`, web E2E (49 tests) and
mobile-web E2E (14 tests) passed. The mock server provides planning validation
and guest-draft endpoints for these browser contracts; live AI/provider behavior
remains a separate integration check.
