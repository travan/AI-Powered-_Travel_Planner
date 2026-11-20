# Deployment configuration

This public repository contains deployment templates, not production resource
identifiers or operational reports. Keep real configuration in the ignored
`.private/deployment/production.json` file and GitHub's `production` environment
secrets. Never commit credentials, browser captures, database exports or canary
reports. Docker and Vercel source uploads also exclude `.private`.

## Private configuration

Create a private JSON object with `worker` (the complete Wrangler configuration)
and `supabaseProjectRef` (the selected project reference). Set real account and
Hyperdrive identifiers, origins, callback URL, provider and existing bindings in
`worker`. The checked-in Wrangler file is a generic local template.

For CI, configure these **production environment secrets**:

| Secret | Purpose |
| --- | --- |
| `TRAVEL_PRODUCTION_CONFIG` | The private JSON configuration described above |
| `CLOUDFLARE_ACCOUNT_ID` | The same account selected by the private config |
| `CLOUDFLARE_API_TOKEN` | Deployment permission plus Workers AI Read for REST inference checks |
| `CLOUDFLARE_MIGRATION_DATABASE_URL` | Admin session-pooler connection for migrations only |
| `PRODUCTION_API_BASE_URL` | HTTPS API origin |
| `PRODUCTION_WEB_ORIGIN` | HTTPS web origin |
| `PLANNING_CANARY_EMAIL` / `PLANNING_CANARY_PASSWORD` | Dedicated synthetic test account |

Keep API keys, database passwords and JWT secrets in their existing encrypted
secret bindings. Never put them in `NEXT_PUBLIC_*`, the public Wrangler template,
or reports. The migration tool rejects a database outside the privately selected
project and does not rotate existing runtime credentials in CI.

## Release checks

Pull requests run tests without production configuration. Production deployment
requires green build, coverage, web/mobile E2E, database and security checks,
followed by live-model candidate checks, migration checks, deployment, revision
smoke, Queue/consumer/DLQ verification and production canary generation. The Queue
check retries metadata propagation up to 12 times, five seconds apart, and still
fails persistent configuration errors.

Vercel's Git integration deploys the web independently. The legacy Vercel Actions
job remains opt-in. Verify both the Vercel production deployment and the backend
revision; a successful web build alone does not certify the API release.

Before deploying locally, load the private configuration and generate the actual
Wrangler file:

```sh
node apps/server/cloudflare/prepare-queue-config.mjs production
pnpm dlx wrangler@4.155.0 deploy --dry-run --config apps/server/wrangler.generated.json
```

Keep detailed operational evidence under `.private/deployment/` or ignored
`test-results/`. Removing a tracked file does not remove earlier Git versions. If
a real credential was published, revoke/rotate it and plan history removal
separately; `.gitignore` is not credential remediation.
