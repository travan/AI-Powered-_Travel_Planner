# Legacy Supabase Demo Flow

Last verified against the repository: 2026-07-27.

This is an opt-in compatibility flow for legacy demo data. It is not part of
normal development, CI, or the current production runtime.

## Current default

- SQL provider: local/self-hosted PostgreSQL
- Web auth: first-party local auth
- Playwright: in-memory mock API and mock auth
- Supabase seed: skipped

The active API is `apps/server`. The old Supabase seed/query/verify scripts are
not present in the current checkout; only local PostgreSQL initialization and
Vietnam city seed utilities remain under `apps/api/scripts`.

## Preconditions

Use a disposable Supabase project and provide server-side variables:

```dotenv
DATABASE_PROVIDER=supabase
SUPABASE_DATABASE_URL=postgresql://...
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=server-only-service-role-key
```

Never run demo seed scripts against production data without reviewing the
script and its target project first.

## Current command status

There are no supported `legacy:supabase:*` package scripts. Do not add CI or
runbook steps that call them unless equivalent scripts are restored and tested
against a disposable project.

## Optional Playwright seeding

The global E2E setup skips this path unless both values are present:

```dotenv
E2E_SEED_LEGACY_SUPABASE=true
DATABASE_PROVIDER=supabase
```

The global setup currently looks for the removed legacy script and safely skips
when it is absent. Standard E2E fixtures live in `e2e/mock-api-server.mjs`.

## Verification

If a replacement legacy seed is added later:

1. run the query command and confirm only expected demo rows appear;
2. inspect the intended Supabase project, not production;
3. run standard isolated E2E without the seed flag to ensure tests remain
   independent of remote state.

Do not add this seed as an unconditional CI step.
