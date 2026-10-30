# Security, login sessions and cookies

Local auth uses two credentials. A signed access JWT authorizes API requests for **15 minutes**. A random 256-bit refresh token restores access for at most **30 days from login**. Every successful refresh consumes its token and issues a new one in the same transaction. Replaying a consumed token revokes its entire session family, including access tokens. Independent logins have independent families.

## Browser and native storage

Web and Expo Web request browser auth with `X-Auth-Client: web`. The server writes host-only `horizon_local_auth` and `horizon_local_refresh` cookies with HttpOnly, SameSite=Lax and Path=/. Secure is mandatory in production and enabled for HTTPS requests. Production therefore requires HTTPS. The refresh token is omitted from browser JSON responses. Access tokens returned to the browser live only in memory; the previous localStorage/sessionStorage credentials are removed.

`POST /api/auth/restore` validates the access cookie without consuming a refresh token. `POST /api/auth/refresh` rotates the refresh cookie when access expires. Cookie operations require the custom header, reject cross-site Fetch Metadata and use the configured CORS allowlist. Keep `CORS_ORIGINS` restricted to trusted UI origins. Responses containing credentials use Cache-Control: no-store.

Concurrent browser callers share an in-flight request. Web Locks coordinate tabs when supported; each lock first rechecks the access cookie, avoiding unnecessary rotation. On older browsers without Web Locks, simultaneous refreshes across tabs can trigger the replay defense and require login again. The middleware sends expired SSR sessions through `/auth/renew`, where the browser refreshes before returning to the requested page. API wrappers obtain a current access token and retry an unauthorized request at most once.

Native iOS/Android receives refresh tokens in JSON and keeps its session in OS SecureStore. Expo Web uses protected cookies and memory. Logout revokes the whole login family. Password reset revokes every access and refresh session for the account. Failed web logout reports an error because JavaScript cannot clear an HttpOnly cookie while offline.

HttpOnly prevents direct cookie reads by JavaScript; it does not make an application immune to XSS or prevent malicious same-origin script from acting as the user. These regression tests are not a full penetration test.

## Migration and deployment

Apply `apps/server/src/database/migrations/20261029100000_refresh_sessions.sql` before deploying the server. The migration adds the private refresh token table and family indexes, and **revokes existing seven-day bearer sessions**, requiring users to sign in again. No production database is migrated automatically by this coding task.

The local bootstrap (`pnpm db:local:init`) applies the migration and grants the dedicated server role access. For external PostgreSQL deployments, grant the application role USAGE on schema `private` and SELECT/INSERT/UPDATE/DELETE on `private.refresh_tokens`. Keep that schema out of any Supabase Data API exposed schemas. Existing deployment migration helpers discover the migration through the normal ledger.

## Verification

Run `pnpm test:security` for JWT verification, auth guards, credential hashing, session issuance, memory-only browser auth, refresh/restore failures, request retries, CORS, workspace roles and password recovery unit tests.

Run `pnpm test:e2e:auth:local` for web and Expo Web login, protected cookies, reload restoration, duplicate signup, failed login and recovery UI. This suite uses the local mock API; it does not prove PostgreSQL revocation semantics.

For real Nest, PostgreSQL, browser-cookie and SMTP recovery tests, prepare a dedicated migrated local database whose name contains `test` or `e2e`:

```sh
E2E_POSTGRES_URL=postgresql://USER:PASSWORD@127.0.0.1:5433/travel_e2e pnpm test:security:e2e

DOCUMENT_STORE=postgres E2E_POSTGRES_URL=postgresql://USER:PASSWORD@127.0.0.1:5433/travel_e2e \
  pnpm exec playwright test --config playwright.server.config.ts auth-security.spec.ts password-recovery.spec.ts
```

Tests cover hashed access/refresh storage, fresh tokens at login, actual HttpOnly cookie isolation, Secure on HTTPS, CSRF rejection, rotation, old-token replay, simultaneous redemption, refresh expiry, logout, and password-reset revocation. Accounts use unique names and are deleted during cleanup. The security script sets DOCUMENT_STORE=postgres so MongoDB is unnecessary. The full server suite retains its default MongoDB document store.

Design references: [OWASP session management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html) and [RFC 9700 refresh token protection](https://www.rfc-editor.org/rfc/rfc9700.html#section-4.14).
