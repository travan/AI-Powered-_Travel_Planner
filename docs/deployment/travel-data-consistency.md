# Travel data consistency and itinerary enrichment

## Behavior

- Google-only users have no application password. Existing password accounts must authenticate before linking a matching Google identity. No accounts or sessions are copied between environments.
- City relationships use stable slugs; `name.en` is canonical and `name.vi` is the Vietnamese label. New itinerary day/place city fields also store the canonical English name; the UI resolves their localized labels from `city_slug`. Existing catalog aliases work in both generation and lookup. Unknown free text is rejected as `CITY_UNRESOLVED`; the planner provides an explicit country/region search and selection flow backed by Nominatim. Only a cached provider candidate may create a city. Its coordinates determine the IANA timezone using `tz-lookup`; an unknown currency stays empty rather than being guessed.
- Known Vietnamese city names are seeded by a versioned additive migration. A second migration moves relational references for unambiguous duplicate names. Conflicting rows are preserved in `city_reconciliation_report`; saved plan JSON is not rewritten, and old slugs resolve through aliases.
- Verified catalog coordinates or Google Place IDs produce exact Maps links. Other entries produce contextual searches. The user can explicitly compare OpenStreetMap candidates. There is no automated bulk geocoding.
- Weather is fetched independently of AI generation/cache. MET Norway supplies forecasts; NASA POWER supplies monthly climatology for 2001–2020 outside the forecast horizon. Undated plans show today's forecast clearly marked for reference. Failed providers show missing data and do not invalidate a plan.
- Meals belong in the daily timeline in both legacy and v2 output. Quality checks cover meal slots, pace, useful descriptions, times, duration, transfer time, overlaps, repeated sightseeing stops and allergen confirmation. Generation attempts one repair; remaining issues stay visible.
- Booking links are generated on the backend. Klook links carry the place/city query. Agoda, Trip.com, Traveloka and Skyscanner use official search landing pages with trip context beside the link, avoiding undocumented parameters or invented product pages. They are not live quotations or reservations.
- New generation totals are derived from scoped costs, one selected hotel estimate per overnight city, transport segments and contingency. A confirmed main-transport total replaces the corresponding leg estimates once. Unknown or mismatched-currency costs remain explicit; an incomplete total is labeled as a subtotal. Old saved costs and user locks are not silently rewritten.

## Database rollout

Both bootstraps use `apps/server/scripts/migrate-postgres.mjs`. It checks source checksums, handles an explicit application schema and respects a caller-owned transaction. Existing cloud migrations without checksums are adopted once and are logged; verify the read-only audit before adopting history. Do not edit applied SQL migrations.

1. Run `pnpm db:audit` using reachable local/admin URLs. The command uses read-only transactions and prints metadata, aggregate sign-in counts and city issues, never emails, password hashes, URLs or session tokens. Optional overrides are `AUDIT_LOCAL_URL` and `AUDIT_CLOUD_URL`. Use a Supabase Session pooler URL on port 5432 on IPv4-only hosts.
2. Run `pnpm db:local:init` with the existing local database configuration. It applies only pending migrations and grants the new cache/report tables to the restricted backend role.
3. Run `node scripts/init-cloudflare-postgres.mjs` for a rolled-back validation, then `node scripts/init-cloudflare-postgres.mjs --apply` for the selected Supabase project. Keep the existing runtime credentials. CI uses the same migration source before deploying the Worker.
4. Run the read-only audit again. Review `city_reconciliation_report` conflicts and any account without a sign-in method. Data in users/trips/sessions remains environment-specific; only migration-controlled reference catalog data is expected to match.
5. Deploy backend before frontend. Smoke-test provider status, a Google/password account, generation, saving, reopening, weather attribution and Maps/booking links.

The cloud schema is `travel_cloud`. Existing demo tables in cloud `public` are not the application's production database and are not part of parity checks.

## External sources

Set `WEATHER_CONTACT_URL` to a genuine application contact page/domain; it falls back to `NEXT_PUBLIC_APP_URL`. This identifies the backend to MET Norway and Nominatim. No paid API keys are required. Nominatim's base URL is configurable via `NOMINATIM_BASE_URL`.

MET responses are cached according to `Expires`/`Last-Modified`. NASA climatology is cached for 30 days. Location results are cached for 30 days. A PostgreSQL rate lease limits Nominatim starts to one request per second across Worker isolates; additional requests return 429 without contacting the provider. Frontend pages show source attribution.

Sources: [MET API terms](https://api.met.no/doc/TermsOfService), [MET forecast format](https://api.met.no/doc/locationforecast/HowTO), [NASA climatology](https://power.larc.nasa.gov/docs/services/api/temporal/climatology/), [Nominatim policy](https://operations.osmfoundation.org/policies/nominatim/), [Google Maps URLs](https://developers.google.com/maps/documentation/urls/get-started).

## Verification

`PARITY_POSTGRES_URL` must point to an isolated local database with `test`/`e2e` in its name. `node scripts/check-travel-database-parity.mjs` creates and removes two disposable databases, migrates local/cloud schemas twice, compares normalized structure/checksums/catalog data, tests duplicate reference migration, and verifies rollback on uniqueness conflicts. It refuses to reuse existing parity databases. CI requires this job before deployment.

Relevant checks:

```sh
pnpm test
pnpm --dir apps/server type-check
pnpm --dir apps/web type-check
PARITY_POSTGRES_URL='<isolated-local-test-admin-url>' node scripts/check-travel-database-parity.mjs
E2E_POSTGRES_URL='<isolated-local-test-url>' DOCUMENT_STORE=postgres pnpm exec playwright test --config playwright.server.config.ts itinerary.spec.ts auth-security.spec.ts
E2E_POSTGRES_URL='<isolated-local-test-url>' pnpm exec playwright test --config playwright.google-auth.config.ts
```

During implementation, native isolated PostgreSQL schema/catalog parity and duplicate-merge/conflict checks passed. All 13 server E2E cases, 3 Google UI cases, and the Google PostgreSQL security regression passed. Real MET/NASA calls for Da Nang returned both a forecast and correctly labeled future climatology.

Follow-up rollout on November 3, 2026: the user-supplied Session pooler endpoint connected successfully with the existing database password. The administrator URL is saved in ignored `.env.cloudflare.local`; runtime credentials and Hyperdrive configuration were preserved. All 20 migrations are now applied in local and `travel_cloud`, with matching checksums. Live read-only comparison confirms matching columns, constraints and indexes, and the same reference-catalog version with 44 Vietnam cities. Cloud retains a redundant legacy `hanoi` alias and environment-specific legacy city rows. Seven cloud city entries remain incomplete (including country-level inputs such as Russia/Taiwan); they require explicit city resolution rather than guessed coordinates or deletion.

The cloud account audit is unchanged across migration: 4 total users, 2 password accounts, 2 Google-only accounts, no duplicate emails and no missing sign-in methods. The runtime role read cities and wrote the external cache in a rolled-back transaction; all 51 application tables have RLS enabled. The bootstrap-only OCR table was added to shared migration history to eliminate the local/cloud schema difference. City seed upserts now preserve existing aliases.

Backend production release `working-7884ee10e4abb2b9` (Worker version `6f60650a-cc7a-40fc-925b-71970e4001eb`) passed public health, exact source release, planner validation/config and canonical city lookup checks. Vercel production deployment `dpl_6oppps7YwnEQrReYgwTcxQKXSCQE` reached READY at https://ai-powered-travel-planner-api.vercel.app. `.vercelignore` excludes local credentials and build artifacts; the verified upload manifest contained no `.env` or `.dev.vars` files. All 331 unit tests passed before deployment. Browser verification on the production domain confirmed the Google sign-in button and the loaded planner form, English city labels, and group-budget copy including travel, stays, meals and activities.

Follow-up on November 4, 2026: planning memory and bilingual alias migrations bring both environments to 22 matching migrations. See [planner-learning.md](./planner-learning.md#production-rollout--november-4-2026) for the latest deployment, test results and remaining preserved legacy conflicts; the November 3 snapshot above is historical.
