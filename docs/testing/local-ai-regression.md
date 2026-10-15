# Local AI, database migrations and regression checks

## Findings and fixes

- Adding an unknown city failed before inference: PostgreSQL could not infer `$2` inside `jsonb_build_object`. Explicit `text` casts fix the write. The real-API test now exercises city creation, Unicode search and duplicate reuse.
- Next.js proxy requests defaulted to 30 seconds, while Ollama inference allows 180 seconds. The web proxy now allows 210 seconds. This addresses premature proxy termination; it does not guarantee a model finishes within its own timeout.
- AI failures were only logged. They now create a private `itineraries` row with `status = 'failed'` and bounded diagnostics in `result.error`. Failed rows cannot be saved as trips. If PostgreSQL itself is unavailable, logging remains the fallback; database persistence cannot be guaranteed during a database outage.
- Responsive bills/expenses grids could expand a 393px mobile viewport to 410px and misalign clicks under fixed navigation. Explicit single-column grids prevent overflow; the existing mobile expense flow now asserts that the document fits the viewport.
- Local Node/tsx could not read a named runtime export from the CommonJS types barrel. The two city modules now handle both CommonJS and bundler module namespaces without changing frontend package resolution.

## Migrations

All Compose entrypoints (`stack`, `local-data`, `unified`, `profiles`) use a one-shot `migrate` service. It mounts the **whole migrations directory**, waits for PostgreSQL health, and runs the same initializer as `db:local:init`. API services depend on `service_completed_successfully`.

Previously, SQL mounts under `/docker-entrypoint-initdb.d` only initialized a new PostgreSQL volume. Restarting an existing volume did not apply later SQL files. All existing SQL files through `011` were mounted; the problem was upgrade execution, not a missing file in that list.

The runner:

1. Takes a session advisory lock, so cooperating runners cannot apply migrations simultaneously.
2. Discovers numbered `.sql` files in lexical order.
3. Applies each pending migration and records its SHA-256 checksum in `schema_migrations` in the same transaction.
4. Rolls back a failed migration and fails startup. Previously committed migrations remain applied.
5. Skips applied migrations and rejects edits to their contents. Add a new migration instead of editing an applied one.

Verified on a fresh database, on a repeated run (no pending migrations), and on an existing populated database without a ledger (10 migration records restored and city rows preserved).

Existing installations without a ledger replay the repository's legacy idempotent migrations once to establish history. Back up a deployment before an upgrade. Future migration files should not contain transaction control; the runner owns the transaction. The existing outer `begin`/`commit` wrappers are supported.

Run `pnpm docker:stack:up` to build and start the stack with the migration gate. For local application development, `pnpm db:local:up` waits for database readiness, initializes migrations, then seeds cities. Docker container images were not built during this check because the Docker daemon was unavailable.

## Tests

Validation on 2026-10-14: 144 unit tests passed (19 added); all 9 newly added real-API/PostgreSQL E2E tests passed; all 59 existing browser/mobile/responsive E2E tests passed in the final full run. The server TypeScript build and all Compose configurations validated. The responsive expense flow initially failed, exposed the horizontal-overflow bug described above, and passed after the layout fix and added regression assertion.

```sh
pnpm test
pnpm test:e2e
```

The default Playwright suite uses a mock API and covers browser/mobile UI contracts. The additional suite uses the compiled Nest application and real PostgreSQL; only the Ollama HTTP server is a deterministic fixture:

```sh
# Use a dedicated local test database and application role.
POSTGRES_URL=postgres://travel_test:travel_test@127.0.0.1:5433/travel_e2e \
POSTGRES_ADMIN_URL=postgres://postgres:postgres@127.0.0.1:5433/postgres \
node apps/server/scripts/init-local-postgres.mjs

E2E_POSTGRES_URL=postgres://travel_test:travel_test@127.0.0.1:5433/travel_e2e \
pnpm test:e2e:server
```

Ports 3348 and 3349 must be free. The suite creates temporary accounts, itineraries, trips and catalog entries. Account/trip data is cleaned up; generated catalog entries can remain in the dedicated test database. It uses a compiled server to preserve Nest decorator metadata for validation and DTO defaults.

| Area | Added coverage |
| --- | --- |
| Ollama | HTTP errors, malformed/non-object JSON, empty/truncated output, timeout propagation |
| Generation persistence | Normalized output stored exactly, catalog job completion, failure diagnostics, failed-save rejection |
| Saved trips | Save, repeated save, reopen stored itinerary |
| Cities | New Unicode city, duplicate reuse, search and detail |
| Search drafts | Guest creation, authenticated claim, original payload retained |
| Workspace | Activity create/update/participation, transport create/update/list, bill create/update/get, expense create/update/split settlement/list |
| Collaboration | Invite acceptance, share-link join/disable, member role update, contributor submission and host approval |
| Read flows | Membership, trip lists/detail, review queue, data-quality signals, audit, activity/place catalogs |
| Unit regressions | Migration ordering/checksums/rollback/lock release, failure persistence fallback, JWT tampering/expiry/malformed input |

These tests do not prove every possible combination is covered. Live Qwen inference, MongoDB-backed prompt history, external OAuth, image OCR providers and live third-party travel APIs require their own available services. The Qwen endpoint on localhost:11434 and Docker daemon were not available during this check. PostgreSQL integration was tested with the locally installed PostgreSQL 14; Compose targets PostgreSQL 16.

References: [Ollama chat API](https://docs.ollama.com/api/chat), [Compose startup order](https://docs.docker.com/compose/how-tos/startup-order/).
