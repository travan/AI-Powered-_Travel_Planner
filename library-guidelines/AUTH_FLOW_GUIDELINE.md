# Auth Flow Guideline

> Standardized authentication flow documentation for the Horizon app – Web (Next.js 15) and Mobile (Expo React Native).  
> Purpose: help the team follow the complete auth flow, identify missing screens, and write tests against clear acceptance criteria.

---

## 1. Screen Inventory

### Web (`apps/web/`)

| Screen | Route | Component | Status |
|---|---|---|---|
| Login | `/login` | `AuthExperience` (mode=login) | ✅ Complete |
| Sign Up | `/signup` | `AuthExperience` (mode=signup) | ✅ Complete |
| **Verify Email** | `/verify-email?email=...` | `VerifyEmailCard` | ✅ Added |
| Forgot Password | Inline at `/login` (forgot flow) | `AuthExperience` | ✅ Complete |
| Set New Password | `/reset-password` | `ResetPasswordExperience` | ✅ Complete |
| OAuth Callback | `/auth/callback` | Route handler | ✅ Complete |
| Account Menu / Sign Out | Header – all authenticated pages | `AccountMenu` (dropdown) | ✅ Added |

### Mobile (`apps/mobile/`)

| Screen | Route | Component | Status |
|---|---|---|---|
| Login | `app/login` | `AuthMobileExperience` (mode=login) | ✅ Complete |
| Sign Up | `app/signup` | `AuthMobileExperience` (mode=signup) | ✅ Complete |
| OAuth Callback (Google) | `app/auth/callback` | Expo deep-link handler | ✅ Complete |
| **Verify Email** | – | – | ⚠️ Missing – currently shows an Alert only |
| Reset Password (confirm) | – | – | ⚠️ Missing – currently redirects to web |
| Account / Profile / Sign Out | – | – | ⚠️ Missing – needs a profile/settings tab |

### Gap List – Screens to Add

| # | Screen | Priority | Notes |
|---|---|---|---|
| 1 | **Mobile – Verify Email screen** | High | Replace current Alert with a dedicated screen + Resend button |
| 2 | **Mobile – Sign Out / Profile** | High | Users have no visible way to sign out on mobile |
| 3 | **Mobile – Reset Password confirm** | Medium | Currently redirects to the web app; needs deep-link or in-app form |
| 4 | **Web – OAuth Error screen** | Low | `/login?error=auth_callback_error` surfaces the error inline in `AuthExperience` – acceptable for now |

---

## 2. Auth Flows

### 2.1 Sign Up (Email + Password)

```
User enters email + password + full name
        │
        ▼
[Client-side validation]
  • email is not empty
  • password is at least 6 characters
  • fullName is not empty (signup only)
        │
        ▼
supabase.auth.signUp()
        │
   ┌────┴────┐
   │ error?  │
   └────┬────┘
        │ YES → normalizeSupabaseAuthError(error)
        │       → t(i18nKey)  [web]
        │       → getMobileAuthErrorMessage()  [mobile]
        │       → display friendly error  (never show raw error.message)
        │
        │ NO
        ▼
  data.session exists?
  ┌─────┴──────────┐
  │ YES             │  → redirect to /plan (web) or /(tabs) (mobile)
  │ (auto-confirmed)│
  └─────┬──────────┘
        │ NO (email confirmation required)
        ▼
  [Web]    → redirect to /verify-email?email=<email>
  [Mobile] → Alert("Check your email…") + router.replace("/login")
```

### 2.2 Login (Email + Password)

```
User enters email + password
        │
        ▼
supabase.auth.signInWithPassword()
        │
   ┌────┴────┐
   │ error?  │ YES → normalizeSupabaseAuthError → show message
   └────┬────┘
        │ NO
        ▼
  redirect /plan (web)
  completeAuthFlow() (mobile)
    └─ check pendingSearchIntent → /trips?resume=1  or  /(tabs)
```

### 2.3 Google OAuth

```
User clicks "Continue with Google"
        │
        ▼
supabase.auth.signInWithOAuth({ provider: "google" })
        │
  [Web]    redirect → Google consent screen → /auth/callback?next=<path>
                                                      │
                                               exchangeCodeForSession()
                                                      │
                                              error  → /login?error=auth_callback_error
                                              success → redirect to <next>
        │
  [Mobile] signInWithGoogleOnMobile()
           → Expo AuthSession → deep-link callback → completeAuthFlow()
```

### 2.4 Forgot Password

```
User enters email → clicks "Forgot?"
        │
        ▼
supabase.auth.resetPasswordForEmail(email, { redirectTo: /reset-password })
        │
  success → inline success message: "Password reset email sent"
  error   → normalizeSupabaseAuthError → show message
```

### 2.5 Set New Password

```
User clicks link in email → /reset-password
        │
        ▼
[ResetPasswordExperience] checks for active session
  no session → show "Open this page from the reset link in your email"
        │
  session exists → user enters new password + confirm
        │
  supabase.auth.updateUser({ password })
        │
  success → "Password updated successfully" → redirect /login
  error   → show error message
```

### 2.6 Verify Email (Resend)

```
User is on /verify-email?email=<email>
        │
        ▼
[VerifyEmailCard] displays the email address + "Resend" button
        │
  clicks Resend → supabase.auth.resend({ type: "signup", email })
        │
  success → "Verification email resent. Please check your inbox."
  error   → "Authentication failed. Please try again."
        │
  "Back to sign in" link → /login
```

### 2.7 Sign Out

```
User clicks avatar in the web header → AccountMenu dropdown opens
        │
  clicks "Sign out"
        │
  supabase.auth.signOut()
        │
  router.replace("/login") + router.refresh()
```

---

## 3. Error Normalization

All Supabase auth errors are routed through `normalizeSupabaseAuthError()` in `packages/types/src/auth-errors.ts`. Raw `error.message` strings are **never** shown in the UI.

| Supabase raw error | Normalized code | i18n key (web) | Mobile message |
|---|---|---|---|
| "User already registered" / `user_already_exists` | `email_exists` | `auth.error_email_exists` | "This email is already registered. Try signing in instead." |
| "Email address … is invalid" | `invalid_email` | `auth.error_invalid_email` | "Please enter a valid email address." |
| "Invalid login credentials" / `invalid_credentials` | `invalid_credentials` | `auth.error_invalid_credentials` | "Email or password is incorrect." |
| "Password should be at least…" / `weak_password` | `weak_password` | `auth.error_weak_password` | "Password must be at least 6 characters." |
| Session not found / JWT expired | `session_expired` | `auth.error_session_expired` | "Your session expired. Please sign in again." |
| Too many requests / HTTP 429 | `rate_limited` | `auth.error_rate_limited` | "Too many attempts. Please wait a moment and try again." |
| Fallback | `unknown` | `auth.error_generic` | "Authentication failed. Please try again." |

### Usage

**Web (next-intl):**
```tsx
import { normalizeSupabaseAuthError } from "@travel/types";
const t = useTranslations("auth");

if (error) {
  setErrorMessage(t(normalizeSupabaseAuthError(error).i18nKey));
}
```

**Mobile (string lookup):**
```tsx
import { normalizeSupabaseAuthError } from "@travel/types";

const AUTH_ERROR_MESSAGES: Record<string, string> = { /* ... */ };

function getMobileAuthErrorMessage(error: unknown): string {
  const normalized = normalizeSupabaseAuthError(error as { message?: string; code?: string; status?: number });
  return AUTH_ERROR_MESSAGES[normalized.code] ?? "Authentication failed. Please try again.";
}

Alert.alert("Auth error", getMobileAuthErrorMessage(error));
```

---

## 4. Acceptance Criteria

### Sign Up

| ID | Scenario | Expected result |
|---|---|---|
| AC-S1 | Valid email, password ≥ 6 chars, email not yet registered | Redirect to `/verify-email` (web) or Alert "Check your email" (mobile) |
| AC-S2 | Email already registered | "This email is already registered. Try signing in instead." |
| AC-S3 | Invalid email format (e.g. Supabase rejects it) | "Please enter a valid email address." |
| AC-S4 | Password shorter than 6 characters | "Password must be at least 6 characters." |
| AC-S5 | Email confirmation disabled in Supabase project | Auto-login + redirect to `/plan` (skips `/verify-email`) |

### Login

| ID | Scenario | Expected result |
|---|---|---|
| AC-L1 | Correct email + password | Redirect to `/plan` (web) or `/(tabs)` (mobile) |
| AC-L2 | Wrong password | "Email or password is incorrect." |
| AC-L3 | Email not yet verified (when confirmation is required) | "Email or password is incorrect." |

### Verify Email

| ID | Scenario | Expected result |
|---|---|---|
| AC-V1 | Navigate to `/verify-email?email=user@test.com` | Email address is visible in the page body |
| AC-V2 | Click Resend (success) | "Verification email resent. Please check your inbox." |
| AC-V3 | Click "Back to sign in" | Navigates to `/login` |

### Sign Out

| ID | Scenario | Expected result |
|---|---|---|
| AC-SO1 | Click avatar in the header | AccountMenu dropdown shows display name, email, and "Sign out" |
| AC-SO2 | Click "Sign out" | Supabase session cleared + redirect to `/login` |
| AC-SO3 | Access `/dashboard` after signing out | Redirected to `/login` |

---

## 5. Checklist triển khai

- [x] `packages/types/src/auth-errors.ts` – `normalizeSupabaseAuthError()`
- [x] `apps/web/messages/en.json` & `vi.json` – thêm keys `error_email_exists`, `error_invalid_email`, `error_invalid_credentials`, `error_weak_password`, `error_session_expired`, `error_rate_limited`, `signup_check_email`, `verify_email_*`
- [x] `apps/web/components/auth/AuthExperience.tsx` – dùng `normalizeSupabaseAuthError`, signup redirect → `/verify-email`
- [x] `apps/mobile/components/auth/AuthMobileExperience.tsx` – dùng `getMobileAuthErrorMessage`
- [x] `apps/web/app/(auth)/verify-email/page.tsx` – trang Verify Email
- [x] `apps/web/components/auth/VerifyEmailCard.tsx` – UI card + resend
- [x] `apps/web/components/layout/AccountMenu.tsx` – dropdown account menu với sign out
- [x] `apps/web/components/layout/SiteHeader.tsx` – dùng `AccountMenu` thay avatar tĩnh
- [ ] `apps/mobile` – màn Verify Email riêng (Alert hiện tại tạm chấp nhận)
- [ ] `apps/mobile` – Profile/Settings tab với Sign Out button
- [ ] E2E tests cập nhật (xem mục 6)

---

## 6. E2E Test Cases cần thêm

File: `e2e/specs/web.auth.contract.spec.ts`

```
describe("signup errors")
  - test: duplicate email → shows "already registered" message
  - test: invalid email format → shows "valid email" message
  - test: short password → shows "at least 6 characters" message

describe("verify email page")
  - test: /verify-email?email=x renders email in body
  - test: resend button calls supabase.auth.resend

describe("sign out")
  - test: clicking avatar opens account menu
  - test: clicking Sign out redirects to /login
  - test: accessing /dashboard after sign out redirects to /login
```
