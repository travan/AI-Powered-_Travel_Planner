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

Keep `SUPABASE_DATABASE_URL` in ignored `.env.cloudflare.local` with file mode
600. Never commit that file, `.dev.vars`, database passwords or JWT secrets.

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

Authenticate Wrangler to the intended account and run:

```sh
pnpm dlx wrangler deploy --config apps/server/wrangler.jsonc
```

The Worker needs `JWT_SECRET` as a secret and the bindings/variables declared in
`wrangler.jsonc`. Scheduled catalog ingestion runs every minute instead of a
persistent Node timer.

Vercel uses root directory `apps/web` and the existing monorepo build configuration.
Set `API_PROXY_TARGET=https://travel-planner-api.travan-it-96.workers.dev` for
Production and Preview. Leave `NEXT_PUBLIC_API_URL` empty to use same-origin
rewrites. Authentication defaults to `local`. Rebuild after changing these values.

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
