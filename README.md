# AI-Powered Travel Planner

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen)](https://nodejs.org/)
[![pnpm Version](https://img.shields.io/badge/pnpm-%3E%3D9.0.0-orange)](https://pnpm.io/)

An intelligent travel planning application that leverages AI to generate personalized, comprehensive itineraries. Built with modern web technologies and powered by Supabase for seamless data management.

## 🚀 Features

### Core Functionality
- **Multi-City Itinerary Generation**: Input one or multiple cities, dates, and budget to get optimized travel plans
- **AI-Powered Planning**: Intelligent suggestions based on trip style (adventure, relax, culture, food, mixed)
- **Detailed Daily Schedules**: Hour-by-hour timelines with activities, transportation, and dining
- **Budget Breakdown**: Comprehensive cost estimation for accommodation, food, activities, and transport
- **Seasonal Insights**: Weather, sunset/sunrise times, festivals, and golden moments for each location

### Integrations
- **Booking Platforms**: Direct links to Booking.com, Airbnb for accommodations
- **Activity Booking**: Klook, Traveloka, Trip.com, GetYourGuide, Viator for tours and tickets
- **Social Discovery**: TikTok and Instagram deep-links for restaurant and place recommendations
- **Navigation**: Google Maps integration for directions and location details

### User Experience
- **Progressive UX**: Overview cards first, then detailed itineraries
- **Cross-Platform**: Web app (Next.js) and mobile app (Expo/React Native)
- **User Accounts**: Google/email authentication, save and share itineraries
- **Export Options**: PDF export for premium users
- **Internationalization**: Multi-language support for global users

## 🏗️ Architecture

This is a pnpm/Turbo monorepo. `apps/server` is the live NestJS API; `apps/api` contains legacy API modules and tests and is not the API process started by the current Docker stack.

The Vercel project is rooted at `apps/web` and builds the Next.js client. It does not deploy the live NestJS API in `apps/server`; deploy that API with Docker.

```
apps/
├── server/       # NestJS API, database adapters, migrations, local DB bootstrap
├── web/          # Next.js web client
├── mobile/       # Expo / React Native client
└── api/          # Legacy API modules and tests; not the deployed server entrypoint

packages/
├── api-client/   # Shared web/mobile API URL resolution
├── design-tokens/# Shared color, type, spacing, and radius tokens
├── types/        # Shared contracts and domain types
├── ui/           # Web UI components
├── hooks/        # Shared React hooks
├── ai/           # AI provider and prompt code
└── scrapers/     # External data scraping

e2e/
├── specs/        # Browser full-flow tests using deterministic mock services
└── regression/   # Checks against a running local API and PostgreSQL
```

## 🛠️ Tech Stack

- **Frontend**: Next.js, React, TypeScript, Tailwind CSS
- **Mobile**: Expo, React Native
- **Backend**: Node.js, TypeScript
- **Database**: PostgreSQL; local PostgreSQL and Supabase PostgreSQL use the same server SQL adapter
- **AI**: Custom AI integration for itinerary generation
- **Testing**: Vitest (unit), Playwright (E2E)
- **Build Tools**: Turbo, pnpm
- **Deployment**: Configurable for Vercel, Expo, etc.

## 📋 Local setup

- Node.js >= 22
- pnpm 10.15
- Docker Desktop or another Docker-compatible runtime for local PostgreSQL and MongoDB

1. **Install dependencies and create local configuration**
   ```bash
   pnpm install
   cp .env.example .env
   ```

2. **Start the local databases and initialize the schema**
   ```bash
   pnpm db:local:up
   ```
   This starts PostgreSQL and MongoDB, provisions the least-privilege `travel_planner` role, applies the local schema, and seeds supported Vietnamese cities. It also repairs an existing Docker volume where initialization scripts were skipped. Use `pnpm db:local:init` only when bootstrapping the PostgreSQL instance configured directly in `.env`.

3. **Start the API and web app**
   ```bash
   pnpm dev:server
   pnpm --dir apps/web dev
   ```
   Start the mobile app separately with `pnpm --dir apps/mobile start`. Mobile auth defaults to `EXPO_PUBLIC_AUTH_PROVIDER=local` and uses the same server/PostgreSQL auth endpoints as web. Android Emulator uses `10.0.2.2` by default; for a physical device, set `EXPO_PUBLIC_API_URL` to the machine's LAN address. Set the provider to `supabase` and configure its public URL/key to use Supabase Auth instead. Local password recovery stays disabled until the server has an email sender and recovery endpoint; Supabase recovery links work only for Supabase Auth accounts.

### Local Database Ports and Docker Modes

The Compose PostgreSQL container publishes host port `5433` as container port `5432`. Connect database GUI tools on the Mac to host `127.0.0.1`, port `5433`, database `travel_planner`; use `travel_planner` with `POSTGRES_APP_PASSWORD` from `.env`, or `postgres` with `POSTGRES_PASSWORD`. The application containers connect to the same database volume through Compose DNS at `postgres:5432`. A container's `127.0.0.1` points to that container, not to the Mac.

### Local Ollama Models

The server can use Ollama's OpenAI-compatible API. Set `AI_PROVIDER=ollama` in `.env`; by default, `gemma4:latest` generates itinerary overviews and `qwen3.5:9b` generates itinerary details. Override the models with `OLLAMA_OVERVIEW_MODEL` and `OLLAMA_DETAIL_MODEL`. For local Docker stacks with slower models, set `NEXT_PUBLIC_API_URL=http://localhost:3001` so long generation requests go directly from the browser to the API instead of through the web proxy.

For the Docker stack, the server reaches Ollama on the Mac through `http://host.docker.internal:11434/v1` (`OLLAMA_DOCKER_BASE_URL`). For a server started directly on the Mac, set `OLLAMA_BASE_URL=http://127.0.0.1:11434/v1`. Start Ollama and make sure both configured models are available before generating an itinerary.

Choose one app runtime at a time because both modes use ports 3000 and 3001:

- Local development: run `pnpm db:local:up`, then `pnpm dev:server` and `pnpm --dir apps/web dev` in separate terminals.
- Docker with automatic source updates: run `pnpm docker:dev` and keep the terminal open. Web edits hot reload; API edits compile and restart the API service automatically. See [Docker development](docs/testing/docker-development.md) for configuration, migrations, and switching modes.
- Full Docker stack: run `REDIS_PORT=6380 pnpm docker:stack:up`, then open `http://localhost:3000`. The API is on `http://localhost:3001`; database GUI tools still use `127.0.0.1:5433`.
- Stop the full stack with `REDIS_PORT=6380 pnpm docker:stack:down`. This preserves the database volume; do not add `-v` if you want to keep its data.

## 🏃‍♂️ Running the Application

### Development
```bash
# Start all apps in development mode
pnpm dev

# Or run specific apps
pnpm --dir apps/web dev      # Web app only
pnpm --dir apps/mobile start # Mobile app only
pnpm dev:server              # API only
```

### Single-Domain Mode (Web + API)

To expose both frontend and backend under one domain, this project supports proxying `/api/*` and `/health` from Next.js to the API service.

1. Configure web env in `apps/web/.env.local`:
   ```env
   NEXT_PUBLIC_API_URL=
   API_PROXY_TARGET=http://127.0.0.1:3001
   ```
   - Leave `NEXT_PUBLIC_API_URL` empty so web code always calls same-domain `/api/*`.
   - Set `API_PROXY_TARGET` to your API runtime address (internal service URL in production).

2. Start services:
   ```bash
   pnpm dev:server
   pnpm --dir apps/web dev
   ```

3. Access from clients:
   - Web browser: `https://your-domain/...`
   - Mobile app API calls: `https://your-domain/api/...`

This keeps one public domain while still allowing backend access for mobile clients.

### Single-Artifact Mode (One Process)

For deployment as a single process/artifact, run the API server in unified mode so it also serves the Next.js web app.

1. Build web + api:
   ```bash
   pnpm --dir apps/web build
   pnpm build:unified
   ```

2. Start unified server:
   ```bash
   pnpm start:unified
   || docker compose --env-file .env -f deploy/docker/docker-compose.stack.yml down 
   || docker compose --env-file .env -f deploy/docker/docker-compose.stack.yml up -d
   ```

   Note:
   - `start` and `start:unified` now read environment variables directly from runtime.
   - For local `.env` loading in manual runs, use:
     ```bash
     pnpm start:unified
     ```

3. For local development in unified mode:
   ```bash
   pnpm --dir apps/server dev:unified
   ```

4. Optional environment variables (API process):
   - `SERVE_WEB=true`
   - `WEB_APP_DIR=../web` (default; relative to `apps/server` working directory)

In this mode, one Node.js process serves both web pages and API endpoints on the same domain/port, and mobile apps can call `https://your-domain/api/*`.

### Building
```bash
# Build all apps
pnpm build

# Build specific app
pnpm --dir apps/web build
```

### Testing

```bash
# Unit tests
pnpm test

# Unit tests with coverage
pnpm test:coverage

# E2E tests
pnpm test:e2e

# E2E tests for specific platforms
pnpm test:e2e:web     # Web desktop
pnpm test:e2e:mobile  # Mobile web
pnpm test:e2e:auth    # Auth contracts (flow mode + error-http mode)
pnpm test:e2e:auth:flow
pnpm test:e2e:auth:error-http

# Auth-focused E2E contracts
pnpm exec playwright test e2e/specs/web.auth.contract.spec.ts --project=web-desktop
pnpm exec playwright test e2e/specs/mobile-web.auth.contract.spec.ts --project=mobile-web
NEXT_PUBLIC_E2E_FORCE_REAL_AUTH_CLIENT=true pnpm exec playwright test e2e/specs/web.auth.error.contract.spec.ts --project=web-desktop
```

### Auth Test Modes (Playwright)

- Default mode is mock auth (fast and deterministic) for both web and mobile-web projects.
- This mode validates full login/signup UI flows, protected route redirects, and post-auth navigation without external auth dependencies.
- Auth contract suite is split into two explicit modes:
   - `pnpm test:e2e:auth:flow`: mock mode for web/mobile auth flow contracts.
   - `pnpm test:e2e:auth:error-http`: real HTTP path mode for web error-normalization intercept tests.
- `pnpm test:e2e:auth` runs both modes sequentially.
- To force Supabase auth mode in Playwright, override both flags:

```bash
ENABLE_MOCK_AUTH_SERVER=false EXPO_PUBLIC_ENABLE_MOCK_AUTH=false pnpm test:e2e
```

- When Supabase auth mode is enabled, make sure these are set before running tests:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `EXPO_PUBLIC_SUPABASE_URL`
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY`

## 📊 Demo Data

Seed demo itineraries for testing:

```bash
pnpm supabase:seed-demo
```

Query demo data:

```bash
pnpm supabase:query-demo
```

## 🤝 Contributing

We welcome contributions! Please follow these steps:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Make your changes and add tests
4. Run the test suite: `pnpm test && pnpm test:e2e`
5. Commit your changes: `git commit -m 'Add some feature'`
6. Push to the branch: `git push origin feature/your-feature`
7. Open a Pull Request

### Development Guidelines

- Use TypeScript for all new code
- Follow the existing code style (Prettier configured)
- Write tests for new features
- Update documentation as needed
- Ensure all tests pass before submitting PR

## 📝 Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start development servers for all apps |
| `pnpm build` | Build all apps for production |
| `pnpm lint` | Run linting across all apps |
| `pnpm type-check` | Run TypeScript type checking |
| `pnpm clean` | Clean build artifacts |
| `pnpm test` | Run unit tests |
| `pnpm test:coverage` | Run unit tests with coverage |
| `pnpm test:e2e` | Run end-to-end tests |
| `pnpm test:e2e:auth:flow` | Run auth flow contracts in mock mode (web + mobile-web) |
| `pnpm test:e2e:auth:error-http` | Run web auth error-normalization contracts via HTTP intercept mode |
| `pnpm test:e2e:auth` | Run both auth contract modes |
| `pnpm test:regression:local-auth` | Exercise signup, session validation, logout/revocation, and login against the local PostgreSQL-backed API |
| `pnpm supabase:seed-demo` | Seed demo data |
| `pnpm supabase:query-demo` | Query demo data |

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built with [Next.js](https://nextjs.org/)
- Database powered by [Supabase](https://supabase.com/)
- Mobile development with [Expo](https://expo.dev/)
- Testing with [Playwright](https://playwright.dev/) and [Vitest](https://vitest.dev/)

---

**Happy travels! 🌍✈️**
