# Repository map and local data flow

## Runtime ownership

- `apps/server` owns the NestJS HTTP API, auth endpoints, database clients, repositories, and the canonical local PostgreSQL bootstrap.
- `apps/web` owns the Next.js web interface. It calls the API through same-origin `/api/*` URLs in the browser and a server-side API target during SSR.
- `apps/mobile` owns the Expo/React Native interface. It calls the same HTTP API and reads the API base URL through `apps/mobile/lib/api.ts`.
- `apps/api` is a legacy code area. Its old modules and tests are not the production API entrypoint or database bootstrap.

## Shared packages

- `packages/types` holds cross-app request, response, and domain contracts.
- `packages/api-client` holds API URL resolution used by both clients. Route-specific wrappers remain in the web client today; migrate them here when both apps need the same operation.
- `packages/design-tokens/tokens.json` is the shared source for colors, spacing, font families, and radii. `scripts/generate-design-tokens.mjs` creates the Tailwind theme at `packages/design-tokens/tokens.css`; mobile styles import the same JSON values.
- `packages/ui` contains web-oriented React components. It is not a React Native component library; tokens/contracts are shared while platform components remain native.

## Database and provider selection

`apps/server/src/database` is the persistence boundary. Domain repositories depend on `SQL_CLIENT`; `DatabaseModule` creates the PostgreSQL pool. The connection string is selected from:

- `DATABASE_PROVIDER=postgres`: `POSTGRES_URL`, then `DATABASE_URL`.
- `DATABASE_PROVIDER=supabase`: `SUPABASE_DATABASE_URL`, then `DATABASE_URL`, then `POSTGRES_URL`.

Both values connect to PostgreSQL through the same SQL adapter. This keeps business repositories usable with local PostgreSQL or Supabase PostgreSQL. `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` configure a separate server-only Supabase API client; never expose the service key through a public web/mobile variable.

The canonical local schema and ordered compatibility migrations live in `apps/server/src/database/migrations`. Fresh Docker volumes run those scripts from `deploy/docker/docker-compose*.yml`; `pnpm db:local:up` also runs the idempotent bootstrap against the Compose database so pre-existing volumes that skipped init scripts are repaired. `pnpm db:local:init` bootstraps the PostgreSQL instance configured directly in `.env`. Both helpers provision the app role, grant runtime CRUD permissions, and verify a connection using the app role; they reject non-local database hosts.

After an itinerary is committed, the same database write enqueues a durable city-catalog job. The server worker retries failed jobs and stores generated activities, restaurants, and hotels with `source = 'ai_generated'`; these entries are retained for future planning but remain explicitly unverified.

The separate `supabase/migrations` directory targets a Supabase project with Supabase Auth (`auth.users`) and Data API behavior. It is not the local server bootstrap schema.

## Regression coverage

- `tests/unit` covers pure logic and repository/service behavior.
- `e2e/specs` exercises web and mobile browser journeys against deterministic mock API/auth services. These tests do not prove the local PostgreSQL role or grants are correct.
- `e2e/regression/local-postgres-auth.mjs` exercises real local signup, session lookup, logout/revocation, and login against the running server/PostgreSQL stack. Run it with `pnpm test:regression:local-auth` after local startup.

## Docker files

- `docker-compose.local-data.yml`: host-accessible local PostgreSQL and MongoDB; their published ports bind to loopback.
- `docker-compose.stack.yml`: API, web, PostgreSQL, MongoDB, and Redis containers.
- `docker-compose.unified.yml`: local web/API deployment layout using the combined server/web build.
- `docker-compose.profiles.yml`: staging/production profiles. Database passwords and JWT secrets must be provided explicitly.
- `Dockerfile.server`, `Dockerfile.ui`, and `Dockerfile.unified`: service-specific build stages; `.dockerignore` excludes dependency/build trees and local env files.
