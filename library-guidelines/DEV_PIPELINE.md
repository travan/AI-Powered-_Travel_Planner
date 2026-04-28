# Dev Pipeline: From Ticket to Deploy

> End-to-end workflow for every code change in the Horizon monorepo.  
> Follow this document from the moment a ticket is picked up to the moment it ships to production.

---

## Quick Reference – Commands

| Stage | Command | Time (approx.) |
|---|---|---|
| Local dev | `pnpm dev` | – |
| Lint | `pnpm lint` | ~10 s |
| Type check | `pnpm type-check` | ~5 s |
| Unit tests | `pnpm test` | ~2 s |
| Unit tests + coverage | `pnpm test:coverage` | ~3 s |
| Auth E2E flow (mock) | `pnpm test:e2e:auth:flow` | ~1–2 min |
| Auth E2E error (HTTP intercept) | `pnpm test:e2e:auth:error-http` | ~30–60 s |
| Auth E2E all contracts | `pnpm test:e2e:auth` | ~2–3 min |
| Full E2E (web) | `pnpm test:e2e:web` | ~5–10 min |
| Full E2E suite | `pnpm test:e2e` | ~15–20 min |
| Smoke test | `bash deploy/smoke-test.sh` | ~30 s |
| Build unified | `pnpm build:unified` | ~2 min |

---

## Stage 1 – Ticket Triage

Before writing a single line of code:

1. **Label the ticket** – `bug` / `feature` / `chore` + severity (P0–P3)
2. **Identify scope** – which app(s) and package(s) are affected (web / mobile / api / packages/*)
3. **Define acceptance criteria** – must be written before work starts (use the format from [AUTH_FLOW_GUIDELINE.md](AUTH_FLOW_GUIDELINE.md) as a template)
4. **Create branch** – convention:
   ```
   feat/<short-slug>      # new feature
   fix/<short-slug>       # bug fix
   chore/<short-slug>     # maintenance / refactor
   ```
   Branch from `develop` unless the fix targets `main` directly (hotfix only).

---

## Stage 2 – Local Development

### Required env vars

Copy `.env.example` to `.env` at the repo root. Minimum keys needed per feature area:

| Feature area | Required vars |
|---|---|
| All | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| AI generation | `AI_PROVIDER=openai` or `AI_PROVIDER=mock` |
| Auth (mock mode) | `ENABLE_MOCK_AUTH_SERVER=true`, `NODE_ENV=development` |
| Google OAuth | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
| Mobile | `EXPO_PUBLIC_WEB_URL`, `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` |

### Starting the dev servers

```bash
# All apps simultaneously (recommended)
pnpm dev

# Individual apps
pnpm --filter @travel/web dev        # Next.js on :3000
pnpm --filter @travel/api dev        # Express API on :3001
pnpm --filter @travel/mobile dev     # Expo on :8081
```

> **Tip:** For auth and trip generation tests locally, use `AI_PROVIDER=mock` to avoid real API costs.

### Turborepo task ordering

`turbo.json` defines the task graph. Key rules:
- `build` depends on upstream `^build` — always run `pnpm build` after changing a shared package
- `type-check` and `test` both depend on `^build` — the packages must compile first
- `dev` is persistent and cache-disabled — runs all apps in watch mode

---

## Stage 3 – Pre-commit Quality Gate

Run these locally before every `git push`. They mirror what CI checks.

```bash
pnpm lint         # ESLint across all apps and packages
pnpm type-check   # tsc --noEmit (all 9 packages)
```

**Current baseline (April 28, 2026):**
- `pnpm type-check` → ✅ 2 tasks successful, 0 errors
- `pnpm lint` → ✅ (pass)

### Common type-check failures

| Error pattern | Fix |
|---|---|
| Mock client missing a new Supabase method | Add method to `MockAuthClient` type + implementation in `apps/web/lib/supabase/mock-auth.ts` |
| `@travel/types` export not found | Add `export * from "./new-file"` in `packages/types/src/index.ts` |
| next-intl key not found | Add key to both `apps/web/messages/en.json` and `vi.json` |

---

## Stage 4 – Unit Testing

### Run

```bash
pnpm test              # fast run, no coverage
pnpm test:coverage     # with v8 coverage report
```

### Coverage thresholds (enforced in CI)

| Metric | Threshold |
|---|---|
| Statements | 80% |
| Branches | 80% |
| Functions | 80% |
| Lines | 80% |

Coverage is collected for:
- `packages/ai/src/**/*.ts`
- `packages/scrapers/src/**/*.ts`
- `packages/hooks/src/**/*.ts`
- `packages/ui/src/**/*.{ts,tsx}`
- `apps/web/lib/**/*.ts`
- `apps/web/hooks/**/*.ts`
- `apps/mobile/lib/**/*.ts`

> **Note:** `packages/types/src/` is excluded from coverage instrumentation by design (pure types + thin utilities), but test files there still run and pass.

### Test results (April 28, 2026)

```
Test Files  10 passed (10)
     Tests  61 passed (61)
  Duration  1.15s
```

| File | Tests | Status |
|---|---|---|
| packages/ai/src/index.test.ts | 10 | ✅ |
| packages/hooks/src/hooks.test.tsx | 4 | ✅ |
| packages/scrapers/src/google-places.test.ts | 4 | ✅ |
| **packages/types/src/auth-errors.test.ts** | **24** | **✅ new** |
| packages/ui/src/components/ui.test.tsx | 4 | ✅ |
| apps/mobile/lib/auth.test.ts | 4 | ✅ |
| apps/mobile/lib/supabase.test.ts | 2 | ✅ |
| apps/mobile/lib/theme.test.ts | 1 | ✅ |
| apps/web/hooks/useSSE.test.tsx | 2 | ✅ |
| apps/web/lib/api.test.ts | 6 | ✅ |

### Rules for new code

- Every new utility file in `packages/*/src/` **must** have a co-located `*.test.ts` file
- New auth error codes added to `normalizeSupabaseAuthError()` must have a corresponding test case in `auth-errors.test.ts`
- React components are tested via E2E (see Stage 5), not unit tests

---

## Stage 5 – E2E Testing

### Architecture

- **Mock API server** – `e2e/mock-api-server.mjs` on `:3101`, provides deterministic responses for city search, itinerary generation, SSE streaming
- **Mock auth** – enabled via `ENABLE_MOCK_AUTH_SERVER=true`, uses in-memory session store in `apps/web/lib/supabase/mock-auth.ts`
- **Playwright projects** – `web-desktop` (Chromium) and `mobile-web` (375×812 viewport)
- **Global setup** – `e2e/global-setup.ts` seeds demo itineraries before any test runs

### Test suites

| Command | Spec files | What it covers |
|---|---|---|
| `pnpm test:e2e:auth:flow` | `web.auth.contract.spec.ts`, `mobile-web.auth.contract.spec.ts` | Mock-mode flow contracts: sign up, login, redirect, verify-email, sign out |
| `pnpm test:e2e:auth:error-http` | `web.auth.error.contract.spec.ts` | Real HTTP path for web auth error-normalization intercept assertions |
| `pnpm test:e2e:auth` | Both commands above | Full auth contract gate |
| `pnpm test:e2e:web` | All `web.*` specs | Full web flow: auth + trips + share/save + nav |
| `pnpm test:e2e:mobile` | All `mobile-web.*` specs | Mobile viewport: auth + trip flow parity |
| `pnpm test:e2e` | All specs | Full suite |

### Auth E2E test cases (as of April 28, 2026)

| Test | File | Status |
|---|---|---|
| Protected route redirects to login, signup preserves redirect target | web.auth.contract.spec.ts | ✅ |
| Unauthenticated generate → login → resume flow | web.auth.contract.spec.ts | ✅ |
| Signup with resume → trips overview | web.auth.contract.spec.ts | ✅ |
| **Duplicate email → normalized error message** | web.auth.contract.spec.ts | ✅ new |
| **Invalid email format → normalized error message** | web.auth.contract.spec.ts | ✅ new |
| **Verify-email page renders email + resend button** | web.auth.contract.spec.ts | ✅ new |
| **Sign out from account menu → redirect to login** | web.auth.contract.spec.ts | ✅ new |
| Login continues into itinerary generation flow | web.auth.contract.spec.ts | ✅ |

### Running locally

```bash
# Start apps first (separate terminal)
pnpm dev

# In another terminal – auth flow contracts (mock mode)
pnpm test:e2e:auth:flow

# Error-normalization contracts (forces web client HTTP path for signup intercept tests)
pnpm test:e2e:auth:error-http

# Run full auth contract gate
pnpm test:e2e:auth

# Full E2E
ENABLE_MOCK_AUTH_SERVER=true pnpm test:e2e
```

> CI can keep `ENABLE_MOCK_AUTH_SERVER=true`; `test:e2e:auth:error-http` forces web client real HTTP path with `NEXT_PUBLIC_E2E_FORCE_REAL_AUTH_CLIENT=true` only for that command.

---

## Stage 6 – Pull Request

### Branch → PR target

| Branch source | PR target | Workflow triggered |
|---|---|---|
| `feat/*`, `fix/*`, `chore/*` | `develop` | `staging-deploy.yml` on merge |
| `develop` | `main` | `pipeline-unified-deploy.yml` on merge |
| Hotfix | `main` directly | `pipeline-unified-deploy.yml` on merge |

### CI gates (must pass before merge)

#### On PR to `develop` or `main` — `pipeline-unified-deploy.yml`

```
┌──────────────────────────────┐     ┌────────────────────────────────┐
│  Job: auth_contracts         │     │  Job: quality_and_tests        │
│  (runs in parallel)          │     │  (runs in parallel)            │
│                              │     │                                │
│  • Install deps              │     │  • Install deps                │
│  • Install Playwright        │     │  • pnpm lint                   │
│  • pnpm test:e2e:auth        │     │  • pnpm type-check             │
│  • Upload auth report        │     │  • pnpm test:coverage          │
└──────────────┬───────────────┘     │  • pnpm test:e2e               │
               │                     │  • Upload Playwright report     │
               └────────┬────────────┘
                        │ both pass
                        ▼
              ┌─────────────────────┐
              │  Job: build_unified │
              │                     │
              │  • pnpm build       │
              │  • Upload artifacts │
              └─────────────────────┘
```

#### On PR to `main`/`develop` — `ci-cd.yml` (path-filtered)

```
build → unit-tests (with Codecov coverage upload)
```

Triggers only when source files under `apps/**/src/**` or `packages/**/src/**` change.

### PR checklist

- [ ] Branch name follows convention (`feat/`, `fix/`, `chore/`)
- [ ] All acceptance criteria from the ticket are covered by a test (unit or E2E)
- [ ] New utility in `packages/` has a `*.test.ts` file
- [ ] `pnpm lint && pnpm type-check && pnpm test:coverage` passes locally
- [ ] Auth-related changes → run `pnpm test:e2e:auth` locally before pushing
- [ ] i18n keys added to **both** `en.json` and `vi.json`
- [ ] PR description links to the ticket and lists new/changed test cases

---

## Stage 7 – Merge & Deploy

### develop → Staging (`staging-deploy.yml`)

Triggers automatically on push to `develop`.

```
quality_and_tests
  └─ pnpm lint
  └─ pnpm type-check
  └─ pnpm test:coverage
  └─ pnpm test:e2e  (if run_e2e=true)
        │ pass
        ▼
build_unified
  └─ pnpm build:unified
        │ pass
        ▼
deploy_staging  (self-hosted runner)
  └─ docker-compose -f deploy/docker/docker-compose.profiles.yml up --build
```

### main → Production (`pipeline-unified-deploy.yml`)

Triggers on push to `main` or via manual `workflow_dispatch` with `deploy_target` selection.

**Deploy targets:**

| Target | Command | Notes |
|---|---|---|
| `pm2` | `pnpm deploy:pm2:release` | Zero-downtime reload via `pm2 reload` |
| `systemd` | `pnpm deploy:systemd:release` | Atomic release with `systemctl reload` |
| `docker` | `pnpm deploy:docker:up:production` | `docker-compose up --build` |
| `none` | – | CI only, no deploy |

---

## Stage 8 – Smoke Test

Run immediately after any deployment:

```bash
BASE_URL=https://your-domain.com bash deploy/smoke-test.sh
```

Checks:

| Check | Endpoint |
|---|---|
| Health | `GET /health` |
| Popular cities API | `GET /api/cities/popular` |
| Web home | `GET /` |

Retries every 2 seconds up to 60 seconds. Exits non-zero on any failure.

---

## Stage 9 – Rollback

### PM2

```bash
# List running apps
pm2 list

# Restart from previous ecosystem config
pm2 reload deploy/pm2/ecosystem.config.cjs

# Or restore previous deploy from the release script
bash deploy/pm2/release-zero-downtime.sh
```

### Docker

```bash
# Stop current
docker-compose -f deploy/docker/docker-compose.unified.yml down

# Roll back to previous image tag
docker tag ai-travel-planner:unified ai-travel-planner:rollback
docker-compose -f deploy/docker/docker-compose.unified.yml up -d
```

### Systemd

```bash
# Restart with previous binary (if kept)
bash deploy/systemd/release-atomic.sh --rollback

# Or simply restart the current service
systemctl restart ai-travel-planner-unified
```

---

## Appendix – Workflow Files

| File | Trigger | Purpose |
|---|---|---|
| `.github/workflows/ci-cd.yml` | push/PR to main/develop (path-filtered) | Build + unit tests + Codecov |
| `.github/workflows/pipeline-unified-deploy.yml` | PR/push to main, manual dispatch | Full quality gate + production deploy |
| `.github/workflows/staging-deploy.yml` | push to develop, manual dispatch | Full quality gate + staging Docker deploy |
| `.github/workflows/playwright-e2e.yml` | Manual dispatch only | Standalone full E2E run |

## Appendix – Coverage Configuration

```
vitest.config.mts
  provider:   v8
  thresholds: 80% (branches / functions / lines / statements)
  reporters:  text, json, html
  output:     coverage/
  include:
    packages/ai/src/**/*.ts
    packages/scrapers/src/**/*.ts
    packages/hooks/src/**/*.ts
    packages/ui/src/**/*.{ts,tsx}
    apps/web/lib/**/*.ts
    apps/web/hooks/**/*.ts
    apps/mobile/lib/**/*.ts
  exclude:
    packages/types     (pure types + thin utilities – tested but not instrumented)
    packages/config
    node_modules / dist / .next / .expo / e2e
```
