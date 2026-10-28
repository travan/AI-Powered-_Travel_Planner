# Unified planner and English / Vietnamese

## Implementation checkpoint

The web app now uses one planner at `/plan`: `UnifiedPlanner` and the shared
`planner-model.ts` adapter/builder. `JourneyWizard` is only a compatibility export;
it has no separate state or submit implementation. Only the route is initially expanded; duration/dates and adults are prefilled in a collapsed section with a visible summary. The optional accordion
contains children/pace/accessibility, budget/style, transport, accommodation and
dining/experiences.
The desktop summary remains alongside the form. Mobile has bottom padding for navigation.

Preserved options include ordered multiple cities, catalog/manual search, popular
suggestions, exact dates or day count, all seven existing travel styles, currencies,
group budget, travelers, cached generation and `force_refresh`. Structured criteria
and the existing durable job queue handle new submissions. The old API contract
remains accepted for other clients.

Drafts use `horizon.planner.draft.v3`; wizard v2 drafts and login intents migrate into
that model. Legacy preferences embedded in `prompt_text` are read without deleting
original notes. Missing origins remain blank, and invalid restored requests return
to the editable form instead of automatically generating. Automatic drafts omit
browser coordinates; explicit Save draft can retain them.

## Language behavior

`LanguageProvider` wraps the existing next-intl provider. Cookie `locale` takes
precedence; missing or invalid values resolve to `en`. User selection lasts one year.
The selector is available across app and auth pages. It updates the provider and
`html.lang` without navigation or remounting form components.

Catalogs are `apps/web/messages/en.json` and `vi.json`, with matching keys and ICU
parameters checked by tests. Existing named namespaces remain; `ui` contains stable
IDs for app-owned labels, `issues` maps business codes and parameters, and
`translations` contains translation controls. `ui-sources.json` maps app-owned
literal labels to their catalog IDs. User names, place names, entered notes, booking
references and saved AI content are rendered directly.

Currency is independent of language: VND is the new-form default, and changing
language never converts entered amounts. Dates and numbers use the interface locale;
planning remains in `Asia/Ho_Chi_Minh`.

New itineraries save `locale` and `trip_style`. Partial regeneration uses those
metadata fields. A legacy itinerary with no language metadata displays Unknown and
requires a new structured itinerary before AI section regeneration; restore remains
available. Interface language never infers or rewrites an old itinerary's language.

## Explicit translations

- `GET/POST /api/itinerary/:id/translations`
- `GET /api/itinerary/:id/translations/:locale`
- `GET/POST /api/trips/:tripId/planning/translations`
- `GET /api/trips/:tripId/planning/translations/:locale`

POST accepts `{target_locale: "en" | "vi", source_version: "<sha256>"}`. GET returns
source metadata, the authorized source snapshot, and stored translations with stale
flags. POST returns an existing cache entry or a durable job ID. Poll the existing
`GET /api/itinerary/jobs/:jobId` route. Reloading or changing UI language only reads
stored translations; it does not enqueue AI work.

Translations are separate rows keyed by source, content/version hash and target
language. Explicit descriptive-text paths are the only editable fields. Names,
booking data, IDs, coordinates, prices, dates, links and locks remain in the source
snapshot. Embedded names, links and numeric tokens are masked before provider calls;
responses must contain exactly the requested keys and invariant tokens. The server
checks access and the current source hash before processing and again before saving.
The UI applies translated text to the matching authorized snapshot and ignores late
responses after a source change. Stale translations cannot be selected.

OpenAI, Claude, Gemini, Ollama and Cloudflare implement text-only translation calls.
Mock mode intentionally does not pretend to translate arbitrary content: it returns
an unsupported-provider error. Integration tests install a deterministic translation
fixture inside their isolated process to verify contracts, retries and permissions.
Those tests do not establish real-provider linguistic quality.

## Migration and deployment

Apply these additive migrations after the existing journey migrations:

1. `20261027090000_itinerary_translations.sql`
2. `20261027090100_job_error_details.sql`

Translations have RLS enabled and no browser-role grants. The local PostgreSQL
bootstrap grants the dedicated backend role its policy; the Cloudflare bootstrap
uses its existing backend policies. All API access checks remain necessary.

Deploy schema first, then server/worker, then web. Keep `JOURNEY_MVP_ENABLED` enabled
for the unified form. Setting it false stops structured generation and queue work;
it does not switch the web UI to a second legacy form. Cloudflare deployments need
the existing scheduled handler to process the queue. HTTP responses do not spawn
untracked background tasks. Do not apply the local test database command to production.

The public sample is `/demo/journey`; the actual form is `/plan`. Sample content is
labeled and has no booking/account side effects. Booking continues at external
providers. Production deployment and live AI-provider quality checks require the
target environment configuration and have not been performed by this local change.

## Verification

```sh
node node_modules/typescript/bin/tsc -p apps/server/tsconfig.json
node node_modules/typescript/bin/tsc --noEmit -p apps/web/tsconfig.json
node node_modules/vitest/vitest.mjs run
```

From `apps/web`, run `node node_modules/eslint/bin/eslint.js . --quiet` and
`node node_modules/next/dist/bin/next build`.

After building the server and migrating an isolated localhost database:

```sh
JOURNEY_TEST_DATABASE_URL=postgresql://<test-role>@127.0.0.1:<port>/<test-db> \
  node --import ./apps/server/node_modules/tsx/dist/loader.mjs \
  e2e/regression/complete-journey.mts
```

The regression creates and removes disposable test fixtures. It covers the three
journey scenarios, EN/VI generation cache isolation, stay totals, locks, revisions,
restore, translation cache/deduplication, failed/retried jobs, stale sources, revoked
membership and server-only translation table grants. UI tests cover retained form
data across language changes and late translation responses.

## Latest local verification checkpoint

- 198 unit tests passed across 43 files; web/server TypeScript passed.
- Production web build and web lint passed.
- PostgreSQL API regression passed for the three journey scenarios, locale cache
  separation, translations, retries, stale sources, revoked access and RLS grants.
- Browser checks passed at 1440×1000 and 390×844. Switching EN→VI retained Hà Nội,
  Đà Nẵng and USD. Mobile content width matched 390px, and the submit button ended
  above the bottom navigation.
- Live-provider translation quality and production deployment remain environment
  validation steps; local regression used mock/fixture AI only.

## Minimal-input planner

Only origin and at least one selected destination need new input. They are marked
with an asterisk and accessible required attributes. Duration defaults to 3 days,
travelers to 2 adults, return to origin is enabled, room count is 1 for overnight
stays, pace is balanced, style is mixed and currency is VND. Budgets, transport,
room pricing and café preferences can remain unspecified for suggestions.
Existing saved preferences are preserved; collapsing a group never resets them.

Exact dates become required only when selected, a different endpoint when the
return-to-origin option is disabled, and provider/travel times when tickets are
confirmed. An already-booked stay requires its name. Validation opens the optional
section containing missing required information. Dietary needs/allergies have a
visible shortcut into the optional dining section; empty allergies mean undeclared,
not confirmed absence of allergies.

Conflicting or invalid unconfirmed transport times remain in the editable draft,
but the request omits both times and the UI explicitly says suitable times will
be suggested. Valid optional times and all confirmed ticket times are preserved.
Confirmed conflicting times still block generation. Blocking errors and optional
notices are displayed separately; accommodation suggestions never require a
selection before generation.

The primary generate action appears immediately after route and the collapsed
date/group summary. Recommended settings and advisory issues are collapsed;
unconfirmed-time explanations appear inside Transport. Required-field errors
open the appropriate section and focus the first missing required input.

For a local web demo on port 3107 proxied to the API on 4107, include
`http://localhost:3107,http://127.0.0.1:3107` in the API process's `CORS_ORIGINS`
(append to existing allowed origins). Otherwise browser POST requests can fail
with `Origin not allowed`, even though server-to-server smoke checks succeed.
The local demo runtime was updated accordingly; production origins stay explicit.

## UI review refinements

At desktop widths the planner uses two equal columns: essential route/generate
actions and optional preferences. Below 1024px those panels stack in order.
Inputs use a stronger border, white background, and conversational bilingual
placeholders. Auth placeholders read from the auth catalog, not legacy UI keys.
Select controls reserve arrow padding and retain a native high-contrast fallback.

Schedule has a Cancel editing action that clears unsaved activity drafts and
the custom-entry form, then returns to the saved itinerary preview. Per-activity
Discard unsaved changes restores that activity's persisted fields. Neither action
undoes already saved edits or deletes previously imported schedule entries.
Revision previews may be dismissed locally without applying them.

## Reference-style primary planner

The latest design follows the user's rounded single-card reference. Time and
group budget/currency are visible together in two columns on medium/large
screens and stack on phones. Style is an accessible pressed-button group;
adult count has bounded increment/decrement controls. The generate button is
full-width below these inputs. Detailed journey preferences remain collapsed.
There is only one budget, currency, style and adult-count control; all use the
shared draft/request model. Budget stays optional, refers to the entire group,
and changing currency never converts or resets the entered amount.

## Planner calendar

Exact dates use React DayPicker v9 with English/Vietnamese locales in a native
modal dialog (Escape/close restores focus). Date-only values remain YYYY-MM-DD;
formatting never shifts them through UTC. Return-date options through the
departure day are disabled. Choosing departure fills a missing return or advances
a conflicting return to the following day, with an inline notice; a later valid
return is preserved. API validation also rejects equal/reversed exact dates.
Duration-based one-day trips remain supported.
