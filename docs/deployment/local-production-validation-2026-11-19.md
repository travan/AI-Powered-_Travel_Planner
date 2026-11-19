# Local validation before merge — 19 November 2026

All local gates below passed for the working tree based on `d02dfdd`.
The source fingerprint and machine-readable evidence are saved in
`test-results/production-validation/source-manifest.json` and `validation.json`.
These results certify the local candidate, not a deployed GitHub revision.

## Results

| Gate | Result |
| --- | --- |
| Frozen dependency installation | Passed with pnpm 10.15.0 |
| Dependency audit | Zero vulnerabilities |
| Unit tests | 808 passed across 96 files |
| Coverage statements / branches / functions / lines | 85.97% / 81.35% / 88.29% / 88.72% |
| Coverage enforcement | All four thresholds are 80%; a deliberately incomplete test run exited 1 |
| Workspace lint / type checks | Passed |
| Web/mobile browser E2E | 70 passed: 48 desktop web, 8 responsive web, 14 mobile web |
| Real PostgreSQL backend/security E2E | 21 distinct tests passed: 20 in the full server run plus the browser security case run separately with `E2E_SECURITY_WEB=true` |
| Production Worker + production web E2E | 4 passed |
| V2 admission / durability | Passed: admission capacity, idempotency, dispatch ticket and checkpoint recovery |
| V2 100-generation fixture workload | 100 complete, 100 inference-fixture calls, zero duplicate itineraries |
| Local / Cloudflare-style database schemas | Migration checksums, schema and catalog versions match |
| Runtime-role / browser-role boundaries | Passed for both public and `travel_cloud` schemas |
| Browser assets | No server-secret sentinel or public source maps |
| Production Worker bundle | Wrangler 4.155.0 production-config dry-run passed; no upload |
| Next.js production build | Passed with real local authentication and same-origin API proxy |
| Mobile release bundle | Android export passed under Node 22 |
| Deployment smoke | Web home, health, popular cities and Worker revision/planner/rollout/Queue checks passed |

Coverage includes/excludes were preserved. Tests exercise previously untested
authentication, session restoration, stored drafts, edited schedules and API
contracts; the threshold was not lowered. `thresholds.global` was replaced with
the supported top-level coverage thresholds.

The browser run exposed a hydration race in the authentication form. Inputs now
remain disabled until React has initialized their handlers. Decorative remote
images/fonts are isolated in browser contract tests so CDN availability cannot
hold navigation open; application/API requests are still exercised.

## Production runtime parity and explicit substitutions

The local Worker uses the production entry point, compatibility date
`2026-10-25`, `nodejs_compat`, `NODE_ENV=production`, local auth, PostgreSQL
document storage, V2 rollout 100%, AI concurrency 1, rate-limit bindings and a
Queue producer/consumer. It runs in workerd via Wrangler 4.155.0. Build and test
commands use Node 22.22.0 and pnpm 10.15.0. The web runs with `next start`, not
`next dev`, for the production checks. PostgreSQL 17.6 runs in an isolated Docker
container; local and Cloudflare-style schemas are checked separately.

A read-only production health reference confirmed the deployed base revision
`d02dfdd5f3a3f82ac9e819ac06c05ce4f2fd2a7c`, Cloudflare provider, V2 100%,
Queue bound, concurrency 1, canary enabled, PostgreSQL document storage and no
staging mode. Those runtime flags are matched locally; the canary UUID is a
synthetic local-only account identifier. Repository-level public deployment
variables did not contain additional overrides. No production secrets were read.

Only environment-specific resources are substituted: localhost origins/HTTP,
test database credentials, local Hyperdrive/Queue bindings and a test JWT secret.
Google OAuth is disabled on this isolated Worker; Google/browser contracts use
the test provider. This does not certify Google's production credentials or TLS.

Remote Workers AI is deliberately absent from the local configuration. The
recorded Beijing/Moscow and Mu Cang Chai responses are seeded as durable
`received` AI results before dispatch. Tests exercise the actual recovery cron,
Queue consumer, claim/checkpoint handling, PostgreSQL persistence, authenticated
API retrieval, production browser login and itinerary rendering. A third replay
retains an unknown fare as `null`, marks the budget incomplete and displays a
warning. Queue recovery must not create a duplicate itinerary or replace the
saved AI result. These tests verify the reported failures without another paid
AI request; they do not certify live model availability, quotas or answer quality.

## Reproduction

Use Node 22 and pnpm 10.15.0. Create a disposable local PostgreSQL database and
application role with `apps/server/scripts/init-local-postgres.mjs`; its admin
and application URLs must both point to localhost, and the database name must
contain `test`. Do not use production credentials.

Set `E2E_POSTGRES_URL` to the isolated application connection string, then run:

```sh
pnpm install --frozen-lockfile
pnpm lint
pnpm type-check
pnpm test:coverage
AI_PROVIDER=mock NODE_ENV=development pnpm test:e2e
DOCUMENT_STORE=postgres pnpm test:e2e:server
pnpm test:production:local:prepare
pnpm dlx wrangler@4.155.0 deploy --dry-run --config apps/server/wrangler.generated.json
```

Start the local Worker in a separate terminal:

```sh
CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV=false WRANGLER_SEND_METRICS=false \
  pnpm test:production:local:worker
```

Build and test the production web against that Worker:

```sh
NODE_ENV=production AUTH_PROVIDER=local NEXT_PUBLIC_AUTH_PROVIDER=local \
ENABLE_MOCK_AUTH_SERVER=false API_PROXY_TARGET=http://127.0.0.1:8787 \
NEXT_PUBLIC_API_URL= pnpm --dir apps/web build
pnpm test:e2e:production:local
```

The production-local Playwright configuration starts/stops the production web
server automatically. Screenshots and the HTML report are saved under
`test-results/production-validation/`. To run `deploy/smoke-test.sh`, start the
same build on port 3352 with those environment variables and set
`BASE_URL=http://127.0.0.1:3352`.

The standard server/browser E2E suites use local provider fixtures and their own
test databases. Do not run the Node server worker and workerd against the same
test database concurrently. The source validation did not merge, deploy, alter
production databases or change live rollout variables.
