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

This is a monorepo project using Turbo for build orchestration:

```
apps/
├── api/          # Backend API (Node.js/TypeScript)
├── web/          # Frontend Web App (Next.js)
└── mobile/       # Mobile App (Expo/React Native)

packages/
├── ai/           # AI processing utilities
├── config/       # Shared configuration
├── hooks/        # React hooks
├── scrapers/     # Data scraping utilities
├── types/        # TypeScript type definitions
└── ui/           # Shared UI components
```

## 🛠️ Tech Stack

- **Frontend**: Next.js, React, TypeScript, Tailwind CSS
- **Mobile**: Expo, React Native
- **Backend**: Node.js, TypeScript
- **Database**: Supabase (PostgreSQL)
- **AI**: Custom AI integration for itinerary generation
- **Testing**: Vitest (unit), Playwright (E2E)
- **Build Tools**: Turbo, pnpm
- **Deployment**: Configurable for Vercel, Expo, etc.

## 📋 Prerequisites

- Node.js >= 20.0.0
- pnpm >= 9.0.0
- Supabase account (for database)

## 🚀 Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-username/ai-travel-planner.git
   cd ai-travel-planner
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   ```

3. **Set up Supabase**
   - Create a new project at [supabase.com](https://supabase.com)
   - Copy your project URL and API keys
   - Create a `.env` file in the root directory:
     ```env
     SUPABASE_URL=your-supabase-url
     SUPABASE_SERVICE_KEY=your-service-role-key
     NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
     NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
     ```

4. **Run database migrations**
   ```bash
   pnpm supabase:verify-setup
   ```

## 🏃‍♂️ Running the Application

### Development
```bash
# Start all apps in development mode
pnpm dev

# Or run specific apps
pnpm --dir apps/web dev      # Web app only
pnpm --dir apps/mobile start # Mobile app only
pnpm --dir apps/api dev      # API only
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
   pnpm --dir apps/api dev
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
   pnpm --dir apps/api build
   ```

2. Start unified server:
   ```bash
   pnpm --dir apps/api start:unified
   ```

   Note:
   - `start` and `start:unified` now read environment variables directly from runtime.
   - For local `.env` loading in manual runs, use:
     ```bash
     pnpm --dir apps/api start:unified:dotenv
     ```

3. For local development in unified mode:
   ```bash
   pnpm --dir apps/api dev:unified
   ```

4. Optional environment variables (API process):
   - `SERVE_WEB=true`
   - `WEB_APP_DIR=../web` (default; relative to `apps/api` working directory)

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
```

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