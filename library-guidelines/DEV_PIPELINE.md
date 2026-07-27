# Development and CI Pipeline

Last verified against the repository: 2026-07-27.

## Repository layout

```text
apps/
  server/   NestJS 11 + Express 5 API and optional unified Next host
  web/      Next.js 15 + React 19
  mobile/   Expo 53 + Expo Router 5 + React Native 0.79
packages/
  ai/ config/ hooks/ scrapers/ types/ ui/
e2e/
  mock-api-server.mjs
  specs/
library-guidelines/
deploy/
```

Only `apps/server`, `apps/web`, `apps/mobile`, and `packages/*` are pnpm
workspaces. Treat `apps/api` as legacy scripts/reference, not as the active API
application.

## Prerequisites

- Node.js 22.x
- pnpm 10.15.0 through Corepack
- PostgreSQL and MongoDB for the real server
- Chromium only when running Playwright

```bash
corepack enable
pnpm install --frozen-lockfile
```

## Local development

Run all workspace development tasks:

```bash
pnpm dev
```

Or start the main apps separately:

```bash
pnpm dev:server
pnpm --dir apps/web dev
pnpm --dir apps/mobile dev
```

The normal local endpoints are server `3001`, web `3000`, and Expo’s selected
development port.

The default web auth provider is local. Supabase is not required to compile or
run the web app.

## Required quality gates

Run these before merging:

```bash
pnpm lint
pnpm type-check
pnpm test:coverage
pnpm test:e2e
pnpm build:unified
```

Useful focused commands:

```bash
pnpm test:e2e:web
pnpm test:e2e:mobile
pnpm test:e2e:auth
pnpm test:e2e:full-flow
pnpm test:e2e:full-flow:web
pnpm test:e2e:full-flow:mobile
```

`pnpm build` is the Turbo workspace build. `pnpm build:unified` is the
deployment gate for the actual server + web production artifact.

## E2E isolation

Playwright starts three isolated processes from `playwright.config.ts`:

| Process | Default URL |
| --- | --- |
| Mock API | `http://127.0.0.1:3301` |
| Next web | `http://127.0.0.1:3200` |
| Expo web | `http://127.0.0.1:8281` |

The web and mobile clients use mock auth and the in-memory mock API. Therefore
standard E2E does not depend on PostgreSQL, MongoDB, Supabase, or paid AI
providers. Tests that mutate shared fixtures run with one worker.

Legacy Supabase demo seeding is skipped unless all of the following are true:

```dotenv
E2E_SEED_LEGACY_SUPABASE=true
DATABASE_PROVIDER=supabase
```

Do not enable this in the default CI path.

## CI behavior

All CI jobs use Node 22, the repository’s pinned pnpm version, and
`pnpm install --frozen-lockfile`.

Pull requests and protected branches should block on:

1. lint;
2. TypeScript type-check;
3. unit/integration coverage;
4. Playwright auth and full-product contracts;
5. `pnpm build:unified`;
6. successful artifact packaging.

Test generation must not mutate source during CI. Tests are committed reviewable
assets, not generated from a list of changed files at runtime.

## Change routing

CI path filters must include:

- `apps/**`
- `packages/**`
- `e2e/**`
- root configuration and lock/workspace files
- deployment files and workflows
- `library-guidelines/**`

Filtering only `apps/**/src/**` is incorrect because Next and Expo route code
lives under `app/`, and much web behavior lives under `components/` and `lib/`.

## Environment rules

- Never require Supabase variables when auth/database provider is local.
- Never expose `SUPABASE_SERVICE_KEY`, database credentials, JWT secrets, or AI
  keys to public client variables.
- Keep production credentials in runner/deployment secret stores.
- Use `AI_PROVIDER=mock` for deterministic CI.
- Keep `AUTH_PROVIDER` and `NEXT_PUBLIC_AUTH_PROVIDER` aligned.
- Set `EXPO_PUBLIC_ENABLE_MOCK_AUTH=true` only in isolated test environments.

## Failure triage

- Compile passes but archive fails: check for stale `apps/api/dist` references;
  current output is `apps/server/dist`.
- Web reports Supabase missing in local mode: verify both web auth-provider
  variables are `local`.
- E2E connects to a manually started app: unset `E2E_REUSE_SERVERS` and use the
  isolated default ports.
- Production starts but health fails: validate SQL/Mongo connectivity,
  `JWT_SECRET`, `WEB_APP_DIR`, and the deployment environment file.
- Next build behaves differently locally: use Node 22, not an unsupported newer
  local Node runtime.
