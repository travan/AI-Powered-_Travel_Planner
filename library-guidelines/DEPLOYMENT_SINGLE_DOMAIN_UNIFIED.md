# Single-domain Unified Deployment

Last verified against the repository: 2026-07-27.

## Runtime architecture

The production API runtime is `apps/server`, a NestJS 11 application on
Express 5. `apps/api` is legacy support material and is not a pnpm workspace
application.

In unified mode, the Nest server handles `/api/*` and `/health`, then delegates
web requests to the Next.js 15 application in `apps/web`.

```text
Browser
  |
  v
one public origin
  |
  +-- /api/*, /health -> apps/server
  |
  +-- all other paths -> apps/web through the Next request handler
```

Unified mode avoids browser CORS configuration because web and API share an
origin. A split Docker profile is also supported: Next runs separately and
proxies `/api/*` to the server.

## Supported toolchain

- Node.js 22.x
- pnpm 10.15.0
- Next.js 15.5.x / React 19
- NestJS 11 / Express 5
- PostgreSQL as the default SQL provider
- MongoDB for document data used by the server
- Supabase only when explicitly selected

## Build and start

From the repository root:

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm build:unified
pnpm start:unified
```

`build:unified` produces:

- `apps/server/dist`
- `apps/web/.next`

`start:unified` sets `NODE_ENV=production`, enables `SERVE_WEB=true`, and starts
`apps/server/dist/index.js`.

Health check:

```bash
curl --fail http://127.0.0.1:3001/health
```

## Required environment

Minimal local PostgreSQL deployment:

```dotenv
DATABASE_PROVIDER=postgres
POSTGRES_URL=postgres://user:password@host:5432/travel_planner
MONGODB_URI=mongodb://host:27017/travel_planner
JWT_SECRET=replace-with-at-least-32-random-characters
AUTH_PROVIDER=local
NEXT_PUBLIC_AUTH_PROVIDER=local
PORT=3001
SERVE_WEB=true
WEB_APP_DIR=../web
```

`DATABASE_URL` can replace `POSTGRES_URL`. For `DATABASE_PROVIDER=supabase`, use
`SUPABASE_DATABASE_URL` or `DATABASE_URL`.

Supabase API/Auth variables are optional. Add them only for Supabase features:

```dotenv
SUPABASE_URL=https://project.supabase.co
SUPABASE_SERVICE_KEY=server-only-service-role-key
NEXT_PUBLIC_SUPABASE_URL=https://project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=public-browser-key
AUTH_PROVIDER=supabase
NEXT_PUBLIC_AUTH_PROVIDER=supabase
```

Do not put secrets in the repository, Docker image, Next public variables, or
Expo public variables.

## Deployment targets

### PM2

```bash
pnpm deploy:pm2:start
pnpm deploy:pm2:release
```

The ecosystem starts the root `start:unified` command. The release script backs
up `apps/server/dist` and `apps/web/.next`, builds, reloads, checks health, and
rolls back those artifacts if health does not recover.

### systemd

```bash
pnpm deploy:systemd:install
pnpm deploy:systemd:release
```

The service runs from `/opt/ai-travel-planner/current` and starts
`pnpm start:unified`. Secrets belong in
`/etc/ai-travel-planner/ai-travel-planner.env`.

### Docker

```bash
pnpm deploy:docker:up:staging
pnpm deploy:docker:up:production
```

The current profile deployment runs web and server as separate containers.
`deploy/docker/Dockerfile.unified` is the server/web build image and uses the
same Node 22 toolchain as CI.

## CI/CD

Authoritative workflows:

- `.github/workflows/pipeline-unified-deploy.yml`: main PR/push quality gates,
  unified build artifact, and optional PM2/systemd/Docker production deployment.
- `.github/workflows/staging-deploy.yml`: develop branch quality gates, unified
  build, and staging Docker deployment.
- `.github/workflows/playwright-e2e.yml`: manually triggered isolated E2E.
- `.github/workflows/ci-cd.yml`: general build/test validation and optional
  legacy Vercel web deployment.

The archive step must package `apps/server/dist`, never `apps/api/dist`.

## Release checklist

1. Use Node 22 and pnpm 10.15.0.
2. Install with `--frozen-lockfile`.
3. Run lint, type-check, coverage, and isolated E2E.
4. Run `pnpm build:unified`.
5. Confirm the artifact contains `apps/server/dist` and `apps/web/.next`.
6. Provide PostgreSQL, MongoDB, and a strong JWT secret at runtime.
7. Configure Supabase only if its database or auth mode is selected.
8. Deploy and require `/health` to pass before declaring success.
