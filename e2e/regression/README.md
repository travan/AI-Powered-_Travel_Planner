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
