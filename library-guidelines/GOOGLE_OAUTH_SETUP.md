# Google OAuth Setup Guide

This guide covers setting up real Google OAuth for the AI-Powered Travel Planner web app using Supabase Auth.

---

## Prerequisites

- A real Supabase project (not placeholder credentials)
- A Google Cloud account
- The web app running locally at `http://localhost:3000`

---

## Step 1 — Update `apps/web/.env.local`

Replace any placeholder values with your real Supabase project credentials:

```env
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
NEXT_PUBLIC_API_URL=
API_PROXY_TARGET=http://127.0.0.1:3001
```

> **Note:** The anon key (publishable key) is safe to expose in the browser. Do **not** use the `service_role` key here — it bypasses Row Level Security and must only be used in secure server-side scripts.

To find these values:
1. Go to [https://supabase.com/dashboard](https://supabase.com/dashboard)
2. Open your project → **Project Settings** → **API**
3. Copy **Project URL** and **anon public** key

---

## Step 2 — Enable Google Provider in Supabase

1. Open your Supabase project dashboard
2. Navigate to **Authentication** → **Providers**
3. Find **Google** and toggle it **Enabled**
4. Paste your **Google Client ID** and **Google Client Secret** (obtained in Step 4)
5. Click **Save**

---

## Step 3 — Configure Supabase URL Settings

1. In your Supabase dashboard, go to **Authentication** → **URL Configuration**
2. Set **Site URL**:
   ```
   http://localhost:3000
   ```
3. Under **Additional Redirect URLs**, add:
   ```
   http://localhost:3000/**
   ```
4. For production, also add your production domain (e.g., `https://yourdomain.com/**`)
5. Click **Save**

---

## Step 4 — Create a Google OAuth Client

1. Go to [https://console.cloud.google.com](https://console.cloud.google.com)
2. Select or create a project
3. Navigate to **APIs & Services** → **Credentials**
4. Click **+ Create Credentials** → **OAuth client ID**
5. Set **Application type** to **Web application**
6. Under **Authorized JavaScript origins**, add:
   ```
   http://localhost:3000
   ```
7. Under **Authorized redirect URIs**, add the Supabase callback URL:
   ```
   https://<your-project-ref>.supabase.co/auth/v1/callback
   ```
   Example:
   ```
   https://cvlvzfkoarlwhvjwwppn.supabase.co/auth/v1/callback
   ```
8. Click **Create**
9. Copy the **Client ID** and **Client Secret**
10. Paste them into the Supabase Google provider settings (Step 2)

> **Note:** If you haven't configured the OAuth consent screen yet, Google will prompt you to do so. Set the app to **External**, fill in the required app name and support email, then add your email as a test user.

---

## Step 5 — Verify the Setup

1. Restart the dev server:
   ```bash
   pnpm dev
   ```
2. Open `http://localhost:3000/login`
3. Click **Continue with Google**
4. The browser should redirect to a URL starting with:
   ```
   https://<your-project-ref>.supabase.co/auth/v1/authorize?provider=google...
   ```
   If you still see `placeholder.supabase.co`, the `.env.local` update has not taken effect — restart the server.

---

## Step 6 — Auth Callback Route

The app handles the OAuth callback at:

```
GET /auth/callback?code=<authorization_code>
```

Located at `apps/web/app/auth/callback/route.ts`. It:
- Exchanges the authorization code for a session via `exchangeCodeForSession(code)`
- Validates the redirect target (only allows paths starting with `/`)
- Defaults to redirecting to `/plan` on success
- Redirects to `/login?error=auth_callback_error` on failure

---

## E2E Testing (Mock OAuth)

The project uses a mock auth system for E2E tests so real Google credentials are not required in CI.

- **Enable mock auth**: Set `ENABLE_MOCK_AUTH_SERVER=true` in the test environment
- **Mock implementation**: `apps/web/lib/supabase/mock-auth.ts`
- **Test file**: `e2e/specs/web.auth.oauth.spec.ts`
- **Helper**: `triggerGoogleOAuthOnWeb(page, mode, landingPath)` in `e2e/specs/helpers/e2e-helpers.ts`

The mock `signInWithOAuth` writes the session to `localStorage` under the key `horizon.mock.auth.session` synchronously before redirecting, so no real Google interaction occurs.

Run OAuth E2E tests:
```bash
pnpm playwright test e2e/specs/web.auth.oauth.spec.ts --project=web-desktop
```

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| OAuth URL contains `placeholder.supabase.co` | `.env.local` still has placeholder values | Update `NEXT_PUBLIC_SUPABASE_URL` and restart server |
| `redirect_uri_mismatch` error from Google | Redirect URI in Google Console doesn't match Supabase callback | Add `https://<project-ref>.supabase.co/auth/v1/callback` to Authorized redirect URIs |
| `Error 400: redirect_uri_mismatch` | Site URL or redirect URL not set in Supabase | Add `http://localhost:3000/**` to Additional Redirect URLs in Supabase |
| Seed scripts fail with permission errors | Root `.env` has publishable key as `SUPABASE_SERVICE_KEY` | Replace with the actual `service_role` key from Supabase **Project Settings → API** |
| Google consent screen shows "unverified app" | OAuth app not verified by Google | Add your email as a test user in Google Cloud Console OAuth consent screen |
| Session not persisted after callback | Cookie not set due to missing site URL config | Ensure Site URL matches the app's base URL exactly |

---

## Related Files

| File | Purpose |
|---|---|
| `apps/web/.env.local` | Local environment variables (Supabase URL + anon key) |
| `apps/web/app/auth/callback/route.ts` | Server-side OAuth code exchange |
| `apps/web/lib/supabase/mock-auth.ts` | Mock Supabase client for E2E testing |
| `apps/web/components/AuthExperience.tsx` | Google login/signup buttons (`data-testid="web-auth-google-login"`) |
| `apps/web/middleware.ts` | Route protection and session validation |
| `e2e/specs/web.auth.oauth.spec.ts` | Playwright E2E tests for OAuth flow |
| `library-guidelines/SUPABASE_SETUP_GUIDE.md` | Supabase project and database setup |

---

## Production Checklist

- [ ] `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` set in production environment
- [ ] Production domain added to **Additional Redirect URLs** in Supabase
- [ ] Production domain added to **Authorized JavaScript origins** in Google Cloud Console
- [ ] Production callback URI added to **Authorized redirect URIs** in Google Cloud Console
- [ ] Google OAuth consent screen published (not in test mode) for public users
- [ ] `service_role` key (not publishable key) used for server-side scripts and seed operations
