# Password recovery

Web and mobile now call the same API regardless of database hosting:

- `POST /api/auth/forgot-password` with `{ "email": "you@example.com" }`.
- `POST /api/auth/reset-password` with `{ "token": "from-email", "password": "at-least-8-characters" }`.

`DATABASE_PROVIDER` selects the SQL connection only. Server `AUTH_PROVIDER=local` (default) recovers application accounts in `users`, even when PostgreSQL is hosted on Supabase. `AUTH_PROVIDER=supabase` recovers native Supabase Auth accounts. Match it with the web/mobile auth provider settings. It does not merge or migrate accounts between identity stores.

## Configuration

Both providers send recovery links through the server's SMTP transport. Set these server-only values in `.env` (never use a `NEXT_PUBLIC_` prefix for credentials):

```dotenv
AUTH_PROVIDER=local
NEXT_PUBLIC_APP_URL=http://localhost:3000
SMTP_HOST=smtp.your-provider.example
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-smtp-username
SMTP_PASSWORD=your-smtp-password
SMTP_FROM=Horizon <no-reply@your-verified-domain.example>
```

Port 465 normally uses `SMTP_SECURE=true`; port 587 normally uses STARTTLS. Production requires HTTPS for `NEXT_PUBLIC_APP_URL` and encrypted SMTP. For native Supabase Auth, also set `AUTH_PROVIDER=supabase`, `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` on the server. Keys stay server-side.

The link always uses the server-configured app URL; callers cannot supply a redirect URL. Mobile users finish recovery on the web page, then sign in again in the app.

Apply server migrations with `pnpm db:local:init` for local PostgreSQL. Docker's existing migration service discovers the new timestamped migration automatically; no additional individual SQL volume is needed. For externally hosted PostgreSQL with **local auth**, deploy the server schema/migration using the deployment's privileged SQL connection and grant the application role USAGE on schema `private` plus SELECT/INSERT/UPDATE/DELETE on `private.password_resets`. Keep `private` out of Supabase's exposed schemas. Native Supabase Auth recovery does not use this table.

The stack compose passes SMTP settings explicitly; unified/profiles read the server env file. Restart/rebuild the server after configuration changes. Without `SMTP_HOST` or `SMTP_FROM`, the API returns 503; no delivery service can be inferred from a database connection.

## Guarantees and limits

Local tokens use 32 random bytes, with SHA-256 hashes stored in a private schema. They expire after 30 minutes. Issuance has a per-account one-minute cooldown; reset, consumption and session revocation commit atomically. Concurrent resets cannot reuse a token. Reissuing replaces the previous token. Tokens travel in the URL fragment and are removed from the address bar when the form opens; refreshing then requires reopening the email link.

Forgot-password responses do not disclose account existence. SMTP/provider failures after lookup are logged without credentials, recipient or token, and return the same generic response. Missing SMTP configuration returns 503 for every email. Undelivered local tokens are removed. The SMTP sink in tests never relays mail outside the machine.

Endpoints have per-IP limits (5 requests/15 minutes for issuance, 20 for confirmation); the local database cooldown also works across processes. Express IP limiting uses the current in-memory store; multiple production replicas should use a shared limiter. Configure trusted proxy hops correctly.

Supabase recovery uses native `generateLink(type=recovery)`, `verifyOtp(type=recovery)`, a separate client for each recovered session, `updateUser`, and global sign-out. Supabase controls its token expiry and password policy. Global sign-out revokes refresh sessions; already-issued Supabase access JWTs can remain valid until expiration. A failed update after native token consumption requires a new recovery link. See [generateLink](https://supabase.com/docs/reference/javascript/auth-admin-generatelink), [verifyOtp](https://supabase.com/docs/reference/javascript/auth-verifyotp), and [signOut](https://supabase.com/docs/reference/javascript/auth-signout).

## Verification

- Unit tests cover local and Supabase adapters, nonexistent accounts, mail failure, unconfigured delivery, invalid tokens, and cleanup of Supabase sessions after update failure.
- `E2E_POSTGRES_URL=postgresql://.../travel_e2e pnpm test:e2e:server` uses actual Nest, PostgreSQL, and a localhost SMTP sink. Covers email generation, hashed token storage, old-password rejection, new-password login, revoked sessions, token replay/expiry/replacement, concurrent redemption, and rate limits.
- `pnpm test:e2e:auth:local` covers web/mobile calls to the common API and the web reset form with a fragment token. This UI suite uses stubbed API responses; the server suite exercises real persistence independently.
- Native Supabase is unit-tested with a mocked SDK; a live Supabase project and a real outbound SMTP provider are not exercised automatically.
