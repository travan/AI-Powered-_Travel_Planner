# Regression checks

`local-postgres-auth.mjs` covers the real local stack path that the mock API
contracts do not exercise: PostgreSQL signup, authenticated `/me`, logout,
session revocation, and login.

Start the local database and API first:

```bash
pnpm db:local:up
pnpm db:local:init
pnpm dev:server
```

Then run `pnpm test:regression:local-auth`. The check creates one temporary
account and removes it from the local database when it finishes. It refuses a
non-local `POSTGRES_ADMIN_URL`.
