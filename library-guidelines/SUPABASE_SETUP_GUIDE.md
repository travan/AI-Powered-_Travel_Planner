# Optional Supabase Setup

Last verified against the repository: 2026-07-27.

Supabase is an optional integration. Database selection and authentication
selection are independent decisions.

## Configuration matrix

| Use case | Database provider | Web auth provider | Supabase required |
| --- | --- | --- | --- |
| Default local/self-hosted | `postgres` | `local` | No |
| Supabase-hosted PostgreSQL, local auth | `supabase` | `local` | Database connection only |
| Local PostgreSQL, Supabase Auth | `postgres` | `supabase` | Auth API URL/public key |
| Full Supabase | `supabase` | `supabase` | Database and Auth configuration |
| Isolated E2E | mock API | `mock` | No |

Do not set `DATABASE_PROVIDER=supabase` merely because Supabase Auth is used.
Do not set web auth to Supabase merely because the SQL database is hosted there.

## Default setup without Supabase

```dotenv
DATABASE_PROVIDER=postgres
POSTGRES_URL=postgres://travel_planner:travel_planner@localhost:5432/travel_planner
MONGODB_URI=mongodb://localhost:27017/travel_planner
JWT_SECRET=replace-with-at-least-32-random-characters
AUTH_PROVIDER=local
NEXT_PUBLIC_AUTH_PROVIDER=local
```

This is enough for the web auth layer and server to use first-party local auth.

## Supabase database

For hosted PostgreSQL:

```dotenv
DATABASE_PROVIDER=supabase
SUPABASE_DATABASE_URL=postgresql://...
```

`DATABASE_URL` is also accepted. The active migrations are in
`apps/server/src/database/migrations`; review and apply them through the
deployment’s PostgreSQL migration process.

Supabase database hosting does not require browser public keys.

## Supabase server API

Only server code may receive:

```dotenv
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=server-only-service-role-key
```

The service-role key bypasses normal row-level access controls and must never be
exposed to browser/mobile bundles or logs.

## Supabase web auth

```dotenv
AUTH_PROVIDER=supabase
NEXT_PUBLIC_AUTH_PROVIDER=supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-public-key
```

`NEXT_PUBLIC_SUPABASE_ANON_KEY` is accepted as an alternative key name. The app
shows a configuration error only when Supabase mode is selected and the required
public configuration is missing.

## Supabase mobile auth

```dotenv
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-public-key
EXPO_PUBLIC_WEB_URL=http://localhost:3000
EXPO_PUBLIC_API_URL=http://localhost:3001
```

`EXPO_PUBLIC_SUPABASE_ANON_KEY` is also accepted. Expo public variables are
embedded in the client, so they must contain public keys only.

## Auth and application authorization

Supabase Auth establishes identity. The Nest API still owns trip membership,
roles, invite consumption, bills, expenses, review, and audit authorization.
Row-level security is useful defense in depth but does not replace the API’s
role checks.

Current trip roles:

- `host`
- `co_host`
- `contributor`
- `viewer`

## CI and testing

Standard Playwright starts an isolated mock API and forces mock auth for web and
mobile. It must pass without Supabase variables:

```bash
pnpm test:e2e:auth
pnpm test:e2e:full-flow
pnpm test:e2e
```

Legacy Supabase demo seeding is opt-in; see `SUPABASE_DEMO_FLOW.md`.

## Production checklist

- Select database and auth providers independently.
- Keep service-role and database credentials server-only.
- Use a strong unique `JWT_SECRET` for local auth.
- Configure allowed OAuth redirects exactly for Supabase Auth.
- Apply current server migrations before traffic is switched.
- Verify API role authorization with distinct host/member accounts.
- Build once with the exact production public variables.
- Confirm local-mode builds do not require Supabase.
