# Cloudflare Workers and Vercel

The cloud backend uses Workers with Node compatibility, Hyperdrive, Supabase
PostgreSQL and Workers AI. MongoDB document records are stored in PostgreSQL in
this deployment. Local Docker development continues to use its configured stores.

## Resources

- API: https://travel-planner-api.travan-it-96.workers.dev
- Web: https://ai-powered-travel-planner-api.vercel.app
- Supabase project: `cvlvzfkoarlwhvjwwppn`, application schema `travel_cloud`.
- Hyperdrive: `travel-planner-db`, query caching disabled.
- TLS: `verify-full`, using the public Supabase CA in
  `apps/server/cloudflare/supabase-ca.crt` (expires April 26, 2031).

## Database setup

Keep `SUPABASE_DATABASE_URL` in ignored `.env.cloudflare.local` with file mode 600. Never commit that file, `.dev.vars`, database passwords or JWT secrets.

Run `node scripts/init-cloudflare-postgres.mjs` for a transaction that rolls back,
then add `--apply` to initialize the application schema and restricted runtime
role. The script preserves existing demo tables in `public`. It saves the runtime
`POSTGRES_URL` and `JWT_SECRET` locally. Keep these credentials to rerun the script
without rotating the runtime role.

Configure Hyperdrive with the runtime role rather than the Supabase administrator,
upload the Supabase CA using Wrangler, and select `verify-full`. The Worker uses
the `HYPERDRIVE` binding; it does not connect to the origin using an admin URI.
The runtime role has application CRUD grants and RLS policies. Supabase anonymous
and authenticated API roles do not receive access to the application schema.

## Deployment

### Automatic production deployment

The **CI/CD Pipeline → Deploy Cloudflare API** job deploys every push/merge to
`main` after build, type checks, unit tests and both E2E targets pass. Pull requests
only run checks; they cannot deploy production. To redeploy, run **CI/CD Pipeline**
from Actions with branch `main` selected. Failed checks prevent deployment.

Configure these secrets in the repository's **production** environment
(Settings → Environments → production → Environment secrets):

| Secret                              | Value                                                                                                                                                                                                                                                              |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `CLOUDFLARE_API_TOKEN`              | Account-scoped token with Workers Scripts Edit and the read permissions required by the existing AI and Hyperdrive bindings. Use the Edit Cloudflare Workers template restricted to account `6b34ff1e99d15ffdbbb503dac4423549`.                                    |
| `CLOUDFLARE_MIGRATION_DATABASE_URL` | Administrator PostgreSQL URL for project `cvlvzfkoarlwhvjwwppn`, used only by the migration step. On IPv4-only hosted runners use the dashboard's **Session pooler** URL on port 5432 with user `postgres.cvlvzfkoarlwhvjwwppn`. Do not use transaction port 6543. |

Repository secrets with these names also work if environment secrets are absent.
The account ID and existing bindings come from `apps/server/wrangler.jsonc`.
Initialize the runtime role once using the database setup above. The existing
Worker `JWT_SECRET` and Hyperdrive credentials stay on Cloudflare; CI does not
upload, generate or rotate them. Do not put the migration credential in Worker
variables, Vercel, `NEXT_PUBLIC_*` variables or source control.

The job bundles the Worker using pinned Wrangler 4.155.0, dry-runs migrations in a
rolled-back transaction, applies only pending migrations using the existing
`travel_cloud.schema_migrations` ledger, then deploys the Worker and cron triggers.
Migration CI mode refuses an uninitialized runtime role and never reads or writes
`.env.cloudflare.local`. Migrations retain the existing backend grants/RLS setup.
Only backward-compatible migrations should be merged, because the old Worker is
still serving requests during this step. A failed deploy does not reverse database
migrations; investigate before rerunning. Production deploys are serialized.

The post-deploy smoke check retries for propagation and checks PostgreSQL health,
the exact Git commit, journey config and `POST /api/planning/validate`. Missing
routes such as `Cannot POST /api/planning/validate` fail the job. It does not create
accounts, trips or AI jobs. Inspect **Deploy Cloudflare API** separately from the
Vercel Ready status. Vercel deploys independently and may be ready earlier.

### Manual fallback

Authenticate Wrangler to the intended account and run from the repository root:

```sh
pnpm dlx wrangler@4.155.0 deploy --config apps/server/wrangler.jsonc
```

The Worker needs `JWT_SECRET` as a secret and the bindings/variables declared in
`wrangler.jsonc`. Scheduled journey jobs and catalog ingestion run every minute
instead of persistent Node timers.

Vercel uses root directory `apps/web` and the existing monorepo build configuration.
Set `API_PROXY_TARGET=https://travel-planner-api.travan-it-96.workers.dev` for
Production and Preview. Leave `NEXT_PUBLIC_API_URL` empty to use same-origin
rewrites. Authentication defaults to `local`. Rebuild after changing these values.

## Shared daily itinerary planning

Trips of three or more days use the same daily planner through both the Ollama
adapter and Cloudflare Workers AI adapter. The planner builds an outline, assigns
separate meal/activity/return slots, generates each day, validates it and repairs
only an incomplete day. The JSON normalizer is provider-independent. This code
uses ordinary JavaScript data structures; it has no filesystem, local model or
HTTP endpoint dependency.

The existing Worker selects `AI_PROVIDER=cloudflare` and
`CLOUDFLARE_AI_MODEL=@cf/meta/llama-3.3-70b-instruct-fp8-fast` in
`apps/server/wrangler.jsonc`. Inference goes through the request-scoped `AI`
binding. Each outline/day request uses Workers AI's
[`response_format` JSON schema](https://developers.cloudflare.com/workers-ai/features/json-mode/).
Application validation is still required: schema mode does not guarantee a
usable itinerary. Incomplete responses and binding/quota failures propagate;
the cloud adapter does not fall back to a local model or mock itinerary.

Prices may be planning allowances. Such amounts carry
`basis=planning_estimate`, `status=estimated`, an explicit `assumption` and a
person/group scope. Hotel allowances identify room and night counts. Budget
reconciliation multiplies these units once, includes return transport and
separates the contingency. A planning allowance is not a verified service quote.
The same reconciliation and UI apply to local and cloud results.

`scripts/review-local-itinerary.mts` is a development harness only. Its model
requests, saved responses and reports live in ignored `test-results/`; Docker
excludes that directory. Production generation uses the server's city catalog,
public reference data packaged with the application and the selected model
binding, not saved local test responses. Jobs continue through the existing
server-side itinerary job queue and Worker scheduled handler.

## Validation and limits

On October 26, 2026, the deployed API passed health (PostgreSQL), registration,
login, profile, real Workers AI generation, and itinerary save checks. The sample
generated a Tokyo day with six activities and reported model token usage.
Unit validation passed 86 tests across 19 files before deployment.

Vercel Production deployment `295DSGhYRruLhJsTqm6kTbfV6gL3` reached Ready using
frontend commit `d0ae097`. Browser checks against Production covered registration,
city search, generation, opening the itinerary, saving and opening its workspace,
and reading the saved itinerary preview. Widths 390px and 412px had no horizontal
page overflow. These were Chrome responsive checks, not mobile OS browser tests.

Native iOS and Android E2E have not been verified. Browser viewport emulation and
Expo Web tests do not establish native compatibility. Password recovery also
requires a configured mail transport. Video transcription is unavailable with the
configured Cloudflare text model. Free service quotas still apply; AI failures are
returned instead of substituting mock output.

## Google sign-in and observability costs

See [Google OAuth and free observability runbook](google-auth-observability.md) for configuration, quotas, deployment, testing and rollback. Google remains disabled until its credentials are configured.
