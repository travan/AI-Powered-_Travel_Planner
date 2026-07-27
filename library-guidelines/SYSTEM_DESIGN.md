# System Design

Last verified against the repository: 2026-07-27.

This document describes the implementation that exists in the repository. It is
not a target-state proposal.

## Product scope

The product supports:

- destination search and itinerary generation;
- guest search intent that resumes after authentication;
- saved trips and trip detail;
- group membership with host, co-host, contributor, and viewer roles;
- invite tokens and self-join share links;
- activity planning and participant selection;
- transport booking records;
- bill capture, expenses, participant-based splitting, and settlement views;
- host review, audit history, and recommendation/data-quality views;
- web and Expo clients with isolated web/mobile E2E coverage.

The collaboration workspace is currently web-first. Mobile supports auth,
planning, saved trips, and itinerary viewing, but does not yet expose every web
workspace capability.

## Monorepo

```text
apps/
  server/       active API and optional unified web host
  web/          browser application
  mobile/       Expo application
  api/          legacy scripts/reference; not a pnpm workspace app
packages/
  ai/           provider-neutral itinerary generation
  config/       shared lint/TypeScript configuration
  hooks/        shared React hooks
  scrapers/     data acquisition utilities
  types/        contracts and shared domain types
  ui/           shared UI primitives
e2e/            mock API, global setup, Playwright product contracts
deploy/         Docker, PM2, systemd, and smoke-test assets
```

`pnpm-workspace.yaml` is the source of truth for active workspaces.

## Technology

| Layer | Current implementation |
| --- | --- |
| Web | Next.js 15.5.x, React 19, next-intl 4, Tailwind CSS 4 |
| Mobile | Expo 53, Expo Router 5, React Native 0.79, React 19 |
| Server | NestJS 11, Express 5, TypeScript |
| Relational data | PostgreSQL through `pg`; local/self-hosted by default |
| Document data | MongoDB |
| Optional hosted integration | Supabase database/API/Auth |
| Tests | Vitest 3 and Playwright |
| Build | pnpm 10.15.0, Turbo 2, Node 22 |

## Runtime topologies

### Development

The web (`3000`) and server (`3001`) run independently. Next rewrites `/api/*`
and `/health` to `API_PROXY_TARGET`, which defaults to the server.

### Unified production

With `SERVE_WEB=true`, `apps/server` initializes Next and serves API and web from
one public origin. The production build command is:

```bash
pnpm build:unified
```

The runtime command is:

```bash
pnpm start:unified
```

### Split containers

The current Docker staging/production profiles run a web container and server
container separately. Browser requests remain same-origin through the web
proxy.

## Server modules

`apps/server/src/modules` contains the active application modules:

| Module | Responsibility |
| --- | --- |
| `auth` | local account registration, login, JWT session, current user |
| `cities` | destination search and popular city data |
| `search-drafts` | guest planning draft creation and authenticated claim |
| `itinerary` | generation, lookup, and persistence |
| `trips` | trip list/detail, members, roles, invites, share links, audit |
| `activities` | catalog, itinerary activities, edits, participants |
| `transport` | trip transport booking records |
| `bills` | capture/update and bill analysis |
| `expenses` | expense records and split data |
| `review` | host review queue, submissions, and data-quality signals |
| `recommendations` | trusted places and transport-price recommendations |
| `users` | profile and user history |

## HTTP surface

All application endpoints are served under `/api` except `/health`.

### Auth

```text
POST /api/auth/account-exists
POST /api/auth/register
POST /api/auth/session
GET  /api/auth/me
POST /api/auth/logout
```

### Discovery and planning

```text
GET  /api/cities/search
GET  /api/cities/popular
GET  /api/cities/:slug
POST /api/search-drafts
POST /api/search-drafts/:id/claim
POST /api/itinerary/generate
POST /api/itinerary/save
GET  /api/itinerary/:id
```

### Trips and collaboration

```text
GET/PATCH trip detail and list routes under /api/trips
GET/PATCH trip membership and member routes
POST invite and share-link routes
POST /api/trips/join
GET trip audit routes
```

### Workspace records

Activity, participant, transport, bill, expense, review, and recommendation
routes are nested under the selected trip or exposed by their corresponding
module controller. Shared TypeScript contracts in `packages/types` are preferred
over manually duplicated client shapes.

## Data ownership

PostgreSQL is the primary store for relational product state. Current migrations
live under:

```text
apps/server/src/database/migrations/
```

Migrations `003` through `007` cover the current collaboration-era schema.
Deployment must apply the active migration set before new server code receives
traffic.

MongoDB configuration is still required by the server for document-oriented
data. `MONGODB_URI` and `MONGODB_DB_NAME` are runtime configuration.

Supabase can host PostgreSQL and can provide Auth/API integration, but neither is
the default requirement. Database provider selection and auth provider selection
are independent.

## Authentication modes

### Web local mode

This is the default. The web calls the Nest auth endpoints, receives an API JWT,
and stores a browser session. No Supabase public variables are needed.

### Web Supabase mode

This is opt-in and requires explicit provider flags plus a Supabase public URL
and anon/publishable key. Google OAuth is available in this mode.

### E2E mock mode

Playwright forces mock auth and points both clients at the in-memory mock API.
Remote databases and third-party auth are intentionally excluded.

### Mobile

Real Expo auth currently uses Supabase; mobile-web E2E uses mock auth. This is a
known difference from the web’s default local-auth implementation.

## Authorization model

Membership is scoped per trip.

| Capability | Host | Co-host | Contributor | Viewer |
| --- | :---: | :---: | :---: | :---: |
| View trip workspace | Yes | Yes | Yes | Yes |
| View members | Yes | Yes | Yes | Limited/read-only |
| Add/edit collaborative records | Yes | Yes | Yes | No |
| Invite and manage non-host members | Yes | Yes | No | No |
| Review submissions and quality signals | Yes | Yes | No | No |
| View audit history | Yes | Yes | No | No |
| Change/remove host | No automatic transfer | No | No | No |

The API enforces authorization. Client-side navigation and disabled controls are
usability layers, not security boundaries.

Member responses should include a display name and email when available. UUIDs
remain identifiers but must not be the primary user-facing label.

## Main flows

### Plan and save

```text
Guest enters search
  -> search draft is stored
  -> login/signup if needed
  -> draft is claimed
  -> itinerary is generated
  -> user reviews itinerary
  -> Save Trip creates a collaboration trip
  -> saved trip opens at /trips/:id
```

The itinerary route is `/itinerary/:id`; saved collaboration details use
`/trips/:id`. The client must not construct one route with the other resource
identifier.

### Invite and join

```text
Host/co-host creates invite or share link
  -> another signed-in user opens /trips/join?token=...&type=...
  -> API validates token, expiry, status, intended email, and current identity
  -> membership is created with the configured role
  -> user enters /trips/:id/workspace
```

An invite belongs to the stored backend record. A client-generated or stale
token cannot be joined.

### Expense split

An expense records the payer, amount, split strategy, and selected trip
participants. The participant set must be explicit because not every traveler
necessarily joins every bill. Equal split uses only selected participants; other
strategies retain their configured allocation data.

## Web routes

Current route groups include:

- public planning and authentication pages;
- `/dashboard`, `/profile`, `/saved`, and `/guides`;
- `/plan`;
- `/itinerary`, `/itinerary/generating`, `/itinerary/comparison`, and
  `/itinerary/[id]`;
- `/trips`, `/trips/[id]`, `/trips/[id]/workspace`, and `/trips/join`.

## Testing architecture

Playwright starts:

```text
mock API  http://127.0.0.1:3301
web       http://127.0.0.1:3200
mobile    http://127.0.0.1:8281
```

The test suite includes auth contracts, error contracts, web business flows,
web/mobile full flows, trip workspace UI, navigation, saved trips, and
responsive coverage. Shared mutable mock fixtures require serial workers.

Important commands:

```bash
pnpm test:coverage
pnpm test:e2e:auth
pnpm test:e2e:full-flow
pnpm test:e2e
pnpm build:unified
```

Passing E2E means the isolated mock-backed product contract passed. It does not
prove that an arbitrary remote Supabase project, OAuth callback, or production
database is configured.

## Configuration validation

The server expects:

- `DATABASE_PROVIDER=postgres|supabase`;
- a matching PostgreSQL URL;
- `MONGODB_URI`;
- `JWT_SECRET` with at least 32 characters;
- optional provider/API variables for AI and Supabase features.

The web defaults both auth provider flags to `local`. If Supabase is selected,
the public URL and one supported public key become required for that mode.

## Build and release invariants

- Active server source and output are `apps/server` and `apps/server/dist`.
- CI and deployment must never package or start `apps/api`.
- Node 22 and pnpm 10.15.0 are authoritative.
- Supabase is not required for a local-auth production build.
- Production artifacts include `apps/server/dist` and `apps/web/.next`.
- A deployment is successful only after `/health` passes.
- Secrets enter at runtime and are not archived with build artifacts.

## Known gaps

- Native mobile does not yet match the full web collaboration workspace.
- Real mobile auth is Supabase-based while web also supports first-party local
  auth.
- Legacy local database bootstrap utilities remain under `apps/api`; they should
  be migrated into the active server workspace before that directory can be
  removed completely.
- Docker split profiles and unified process deployment are both present, so
  operators must use the matching runbook rather than mixing their environment
  assumptions.
