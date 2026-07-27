# Authentication Flow Guideline

Last verified against the repository: 2026-07-27.

## Supported modes

Authentication is selected explicitly. Supabase is optional and must not be
required for the default web build.

| Client | Mode | Configuration | Intended use |
| --- | --- | --- | --- |
| Web | Local API (default) | `AUTH_PROVIDER=local`, `NEXT_PUBLIC_AUTH_PROVIDER=local` | Local development and self-hosted production |
| Web | Supabase | both provider variables set to `supabase` plus public Supabase URL/key | Hosted Supabase Auth, including Google OAuth |
| Web | Mock | provider variables set to `mock`, `ENABLE_MOCK_AUTH_SERVER=true` | Isolated Playwright tests only |
| Mobile | Supabase | `EXPO_PUBLIC_SUPABASE_URL` plus an anon/publishable key | Real Expo auth |
| Mobile web | Mock | `EXPO_PUBLIC_ENABLE_MOCK_AUTH=true` | Isolated Playwright tests only |

Do not infer an auth provider from the presence of a Supabase key. Keep the
provider flags explicit so a partially configured environment cannot switch
authentication unexpectedly.

## Web local-auth contract

The web client calls the first-party Nest API:

- `POST /api/auth/account-exists`
- `POST /api/auth/register`
- `POST /api/auth/session`
- `GET /api/auth/me`
- `POST /api/auth/logout`

The API returns the local JWT as `session.access_token`. Browser code stores the
session under `horizon.local.auth.session` and mirrors it to the
`horizon-local-auth` cookie for server-rendered pages. Protected API requests
send `Authorization: Bearer <token>`.

`JWT_SECRET` must be at least 32 characters and must be replaced in every
non-test deployment.

## Supabase-auth contract

When the provider is `supabase`, the web uses `@supabase/ssr` and
`@supabase/supabase-js`. Accepted public key names are:

- Web URL: `NEXT_PUBLIC_SUPABASE_URL`
- Web key: `NEXT_PUBLIC_SUPABASE_ANON_KEY` or
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- Mobile URL: `EXPO_PUBLIC_SUPABASE_URL`
- Mobile key: `EXPO_PUBLIC_SUPABASE_ANON_KEY` or
  `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

The service-role key is server-only. Never place it in a `NEXT_PUBLIC_*` or
`EXPO_PUBLIC_*` variable.

Google OAuth is available only in Supabase mode. The callback route is
`/auth/callback`; it exchanges the authorization code and then redirects to the
validated `next` destination.

## Product flow

The primary acquisition flow is:

1. A guest opens the public planning experience.
2. The guest enters destination, duration/dates, budget, style, and travelers.
3. On generation, the app stores a pending search intent and redirects the
   unauthenticated guest to login or signup.
4. After successful authentication, the app claims the guest search draft and
   resumes generation.
5. The generated itinerary can then be saved as a trip.

Direct visits to login or signup remain supported. `redirectTo` must be an
internal path; never redirect to an arbitrary external URL.

## Route behavior

Public routes include the landing/planning entry, authentication pages, the
OAuth callback, and invite join entry. Account and collaboration pages require a
valid session.

If an authenticated user opens an auth page, redirect them to the validated
post-auth destination. If a protected request receives `401`, clear stale
client auth state and return the user to login with the intended destination.

## Trip authorization is separate from authentication

Authentication proves identity; trip membership controls access. The API is the
source of truth and the UI only mirrors these permissions:

| Role | Access |
| --- | --- |
| `host` | Full trip control, membership management, review, audit, collaboration, and financial data |
| `co_host` | Operational control and non-host member management; cannot replace or demote the host |
| `contributor` | View members and contribute to planning, activities, transport, bills, expenses, and submissions where allowed |
| `viewer` | Read-only trip views; no mutation, invite, member-management, review, or audit actions |

Every protected mutation must be rejected by the server when the role is
insufficient, even if the UI hides the action.

## Testing

Playwright does not require Supabase. Its isolated servers force mock auth:

```bash
pnpm test:e2e:auth
pnpm test:e2e:full-flow:web
pnpm test:e2e:full-flow:mobile
pnpm test:e2e
```

Default isolated ports are mock API `3301`, web `3200`, and Expo web `8281`.
Set `E2E_REUSE_SERVERS=true` only when intentionally reusing compatible
instances.

## Acceptance checklist

- The web builds and starts with no Supabase variables in local mode.
- Local signup/login returns a usable API JWT and `/api/auth/me` succeeds.
- Supabase mode fails with a clear configuration message only when that mode is
  explicitly selected.
- A guest planning intent resumes after authentication.
- Invite links are opened by a different authenticated account from the host.
- Role restrictions are enforced by API tests, not just by disabled buttons.
- Logout clears browser session storage/cookies and protected routes no longer
  render private data.
