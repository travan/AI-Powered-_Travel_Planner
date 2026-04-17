# AI-Powered Travel Planner — System Design Document

> Version: 1.0 | Date: April 10, 2026 | Author: Product & Engineering Team

---

## Table of Contents

1. [Problem Statement](#1-problem-statement)
2. [Product Overview](#2-product-overview)
3. [Functional Requirements](#3-functional-requirements)
4. [Non-Functional Requirements](#4-non-functional-requirements)
5. [Tech Stack Decisions](#5-tech-stack-decisions)
6. [System Architecture](#6-system-architecture)
7. [Data Flow & Pipeline](#7-data-flow--pipeline)
8. [AI Strategy & Token Optimization](#8-ai-strategy--token-optimization)
9. [Database Design](#9-database-design)
10. [API Design](#10-api-design)
11. [Output Schema (AI Response)](#11-output-schema-ai-response)
12. [Concurrency & Scalability](#12-concurrency--scalability)
13. [Progressive UX Strategy](#13-progressive-ux-strategy)
14. [Integrations](#14-integrations)
15. [Monetization](#15-monetization)
16. [i18n & Global Expansion](#16-i18n--global-expansion)
17. [Implementation Phases](#17-implementation-phases)
18. [Infrastructure](#18-infrastructure)

---

## 1. Problem Statement

Người dùng muốn lên kế hoạch du lịch nhưng gặp các vấn đề:

- **Quá nhiều nguồn thông tin rời rạc** — phải tự tra Google Maps, Booking, Klook, TikTok riêng lẻ
- **Khó tính toán ngân sách** — không biết 10 triệu đi Đà Lạt 5 ngày có đủ không
- **Mất thời gian lập lịch** — sắp xếp thứ tự địa điểm, di chuyển giữa nơi, thời gian hợp lý
- **Thiếu context theo mùa** — không biết tháng 6 hoàng hôn lúc mấy giờ, thời tiết thế nào
- **Multi-city phức tạp** — đi Hà Nội + Hội An + Đà Lạt, không biết sắp xếp thứ tự nào tối ưu

**Core insight:** Người dùng không cần AI *biết tất cả* — họ cần một hệ thống *tổng hợp* thông tin từ nhiều nguồn và *sắp xếp* thành lịch trình thực tế, khả thi.

---

## 2. Product Overview

**AI-Powered Travel Planner** là web/mobile app cho phép:

1. Nhập thành phố (1 hoặc nhiều) + số ngày hoặc ngày đi/về + budget (optional)
2. Hệ thống tự động generate danh sách lịch trình (overview trước), sau đó detail từng lịch
3. Lịch trình bao gồm: địa điểm, nhà hàng, khách sạn, phương tiện di chuyển, vé tham quan, gợi ý theo mùa
4. Link trực tiếp để đặt phòng (Booking, Airbnb), mua vé (Klook, Traveloka, Trip.com), đặt tour
5. Lưu, chia sẻ, export PDF lịch trình

**Target users:**
- Người đi du lịch tự túc (FIT — Free Independent Traveler)
- Nhóm bạn bè 2–10 người lên kế hoạch chung
- Digital nomad di chuyển liên tục

---

## 3. Functional Requirements

### 3.1 Core — Itinerary Generation
- [x] Nhập 1 hoặc nhiều thành phố
- [x] Nhập số ngày hoặc khoảng ngày (từ ngày X đến ngày Y)
- [x] Nhập budget bằng bất kỳ currency nào (optional — nếu không nhập, hệ thống gợi ý)
- [x] Chọn trip style: adventure / relax / culture / food / mixed
- [x] Hiển thị **danh sách lịch trình** (overview cards) trước, sau đó mới vào detail
- [x] Detail lịch trình bám sát số ngày và budget đã nhập
- [x] Multi-city: tự động sắp xếp thứ tự thành phố tối ưu theo geography

### 3.2 Itinerary Detail
- [x] Lịch trình theo từng ngày với timeline giờ cụ thể
- [x] Mỗi hoạt động có: tên, mô tả, thời gian, chi phí ước tính, category, link Google Maps
- [x] Gợi ý mua vé tham quan (Klook, Traveloka, Trip.com, web chính thức)
- [x] Di chuyển giữa các thành phố (tàu, xe bus, máy bay, thuê xe tự lái, xe máy)
- [x] Gợi ý khách sạn với link Booking.com và Airbnb
- [x] Gợi ý nhà hàng/quán ăn với link TikTok search, Instagram search
- [x] Gợi ý tour lẻ từ nhiều platform (Klook, Traveloka, Trip.com, GetYourGuide, Viator)
- [x] Budget breakdown: accommodation / food / activities / transport / contingency
- [x] Seasonal notes: thông tin mùa/tháng (hoàng hôn, bình minh, thời tiết, lễ hội)
- [x] Golden moment: lưu ý thời điểm đẹp cho từng địa điểm cụ thể

### 3.3 User Account
- [x] Đăng ký/đăng nhập bằng Google hoặc email
- [x] Lưu lịch trình đã generate
- [x] Xem lịch sử các chuyến đi
- [x] Export lịch trình ra PDF (premium)
- [x] Chia sẻ link lịch trình (public URL)

### 3.4 Integrations
- [x] Booking.com affiliate link (search theo city + dates)
- [x] Airbnb affiliate link (search theo city + dates)
- [x] Klook search link per activity
- [x] Traveloka search link per activity
- [x] Trip.com search link per activity
- [x] TikTok deep-link search per restaurant/place
- [x] Instagram deep-link search per restaurant/place
- [x] Google Maps direction link per activity

---

## 4. Non-Functional Requirements

| Requirement | Target |
|---|---|
| **Latency (first render)** | < 3s (overview phase) |
| **Latency (full detail)** | < 15s (per city, parallel) |
| **Concurrency** | 1,000 concurrent users |
| **Availability** | 99.5% uptime |
| **Cache hit rate** | > 40% (popular city combos) |
| **AI token cost** | Minimize — crawl data trước, AI chỉ orchestrate |
| **Global** | Hỗ trợ mọi quốc gia, city metadata chuẩn hóa |
| **Language** | Multilingal: EN, VI (extendable) |
| **Mobile** | iOS + Android via Expo React Native |

---

## 5. Tech Stack Decisions

### Rationale

| Layer | Choice | Lý do |
|---|---|---|
| **Monorepo** | Turborepo | Code sharing giữa web/mobile/api, pipeline caching |
| **Web** | Next.js 14 App Router | SSR/SSG, SEO, Server Actions, tích hợp tốt với Supabase |
| **Mobile** | Expo (React Native) | Code sharing với web via shared packages, OTA updates |
| **API** | Node.js + Fastify | Nhanh hơn Express, schema validation built-in, dễ scale |
| **Auth + DB** | Supabase | PostgreSQL managed, Auth (OAuth + email), Realtime, dễ tái sử dụng |
| **Search DB** | MongoDB Atlas | Flexible schema cho places/cities, full-text search, global |
| **Cache + Queue** | Redis (Upstash) | BullMQ job queue + response cache, serverless-friendly |
| **AI** | Abstract layer | Dễ swap GPT → Gemini → Claude theo cost/performance |
| **i18n Web** | next-intl | Best-in-class với Next.js App Router |
| **i18n Mobile** | i18next | Industry standard, hỗ trợ namespace |
| **PDF Export** | react-pdf | Server-side render, no puppeteer overhead |

### Monorepo Structure

```
ai-travel-planner/                  ← root (Turborepo)
├── apps/
│   ├── web/                        ← Next.js 14 App Router
│   ├── mobile/                     ← Expo React Native
│   └── api/                        ← Node.js + Fastify
├── packages/
│   ├── ui/                         ← Shared React components (web + mobile)
│   ├── ai/                         ← AI provider abstraction layer
│   ├── scrapers/                   ← Data crawlers (places, transport, tickets)
│   ├── types/                      ← Shared TypeScript types/interfaces
│   └── config/                     ← ESLint, TSConfig, Tailwind config
├── supabase/
│   └── migrations/                 ← SQL migrations
├── turbo.json
└── package.json
```

---

## 6. System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                            │
│   Next.js Web App (SSR/CSR)    │    Expo Mobile App             │
│   - /plan (input form)         │    - HomeScreen                │
│   - /itinerary (list)          │    - ItineraryListScreen        │
│   - /itinerary/[id] (detail)   │    - ItineraryDetailScreen     │
└─────────────────┬───────────────────────────┬───────────────────┘
                  │ HTTPS / SSE               │ HTTPS / SSE
                  ▼                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                      API LAYER (Fastify)                        │
│  POST /itinerary/generate  → enqueue job, return job_id         │
│  GET  /itinerary/stream/:id → SSE stream progress               │
│  GET  /itinerary/:id        → fetch saved result                │
│  POST /itinerary/save       → auth required                     │
│  GET  /cities/search        → city autocomplete                 │
└──────────────┬───────────────────────────────┬──────────────────┘
               │                              │
               ▼                              ▼
┌──────────────────────┐         ┌────────────────────────────────┐
│   Redis (Upstash)    │         │        BullMQ Workers          │
│   - Job queue        │◄───────►│  Worker A: Overview (AI)       │
│   - Response cache   │         │  Worker B: Scrape per city     │
│   - Rate limiting    │         │  Worker C: Transport           │
│   - Session cache    │         │  Worker D: Restaurants         │
└──────────────────────┘         │  Worker E: Tickets/Suggestions │
                                 └──────────────┬─────────────────┘
                                                │
               ┌────────────────────────────────┼─────────────────┐
               ▼                                ▼                 ▼
┌──────────────────────┐  ┌──────────────────────┐  ┌────────────────────┐
│  AI Provider Layer   │  │   MongoDB Atlas       │  │  Supabase          │
│  (Abstract)          │  │   - cities metadata   │  │  - PostgreSQL      │
│  - OpenAI GPT-4o     │  │   - places cache      │  │    (users, trips)  │
│  - Google Gemini     │  │   - restaurants cache  │  │  - Auth service    │
│  - Anthropic Claude  │  │   - transport cache   │  │  - Storage (PDF)   │
└──────────────────────┘  └──────────────────────┘  └────────────────────┘
               ▲
               │ (pre-fetched context)
┌──────────────────────────────────────────────────────────────────┐
│                     SCRAPER LAYER                                │
│  packages/scrapers/                                              │
│  ├── google-places.ts    → Google Places API                     │
│  ├── booking.ts          → Booking.com Affiliate API             │
│  ├── transport.ts        → 12go, Baolau, Skyscanner, VietRail    │
│  ├── tickets.ts          → Klook, Traveloka, Trip.com            │
│  ├── social.ts           → TikTok/IG search scrape               │
│  ├── astro.ts            → sunrise-sunset.org + OpenMeteo        │
│  └── video-transcript.ts → AI transcript (video only)           │
└──────────────────────────────────────────────────────────────────┘
```

---

## 7. Data Flow & Pipeline

### Request Flow

```
1. User fills form
   { cities: ["Da Nang", "Hoi An"], start_date: "2026-06-10",
     end_date: "2026-06-15", budget: 8000000, currency: "VND",
     style: "food", locale: "vi" }

2. POST /itinerary/generate
   → Check Redis cache (hash of normalized params)
   → Cache HIT: return cached result immediately
   → Cache MISS: enqueue BullMQ job → return { job_id, status: "queued" }

3. Client opens SSE: GET /itinerary/stream/{job_id}

4. BullMQ Worker — Phase 1 (Overview)
   a. Parse user input (NLP if needed)
   b. Fetch city metadata from MongoDB (lat/lon, timezone, currency)
   c. Call sunrise-sunset.org API (based on lat/lon + dates)
   d. Call OpenMeteo API (weather forecast)
   e. AI call: generate overview only
      → title, rough day plan, estimated budget breakdown
   f. Push SSE event: "overview_ready"

5. BullMQ Workers — Phase 2 (per city, parallel)
   For each city:
   a. Google Places API → attractions, restaurants (cache 7 days in MongoDB)
   b. Booking.com API → hotel options + price range
   c. Transport scraper → trains/buses/flights between cities
   d. Tickets scraper → Klook/Traveloka/Trip.com per attraction
   e. Social scraper → TikTok/IG search links per restaurant
      → if video URL found → AI video transcript
   f. Push SSE events: "city_ready", "transport_ready", "restaurants_ready"

6. BullMQ Worker — Phase 3 (AI Final Assembly)
   → All scraped data passed as context to AI
   → AI task: arrange schedule by time, write descriptions,
               apply golden_moment notes, calculate accurate costs
   → AI outputs structured JSON (see Output Schema)
   → Save to MongoDB + Supabase
   → Push SSE event: "complete"
   → Cache result in Redis (TTL: 1h for exact params)
```

### Cache Strategy

| Layer | TTL | What's cached |
|---|---|---|
| Redis — AI output | 1 hour | Same city+dates+budget params |
| Redis — city meta | 30 days | lat/lon, timezone, currency |
| MongoDB — places | 7 days | Attractions, restaurants per city |
| MongoDB — transport | 24 hours | Train/bus/flight prices |
| MongoDB — hotels | 6 hours | Booking prices (dynamic) |
| MongoDB — tickets | 24 hours | Klook/Traveloka prices |

---

## 8. AI Strategy & Token Optimization

### Core Principle

> **Crawl first, AI second.** AI chỉ làm những gì không thể crawl.

```
WITHOUT optimization:  AI generates everything → ~15,000 tokens/request
WITH optimization:     AI orchestrates pre-fetched data → ~3,000–4,000 tokens/request
Savings: ~70–75%
```

### AI Tasks (chỉ 3 việc)

| Task | Input tokens | Output tokens | Lý do cần AI |
|---|---|---|---|
| **1. Itinerary orchestration** | ~2,000 (pre-fetched data summary) | ~1,500 | Sắp xếp logic thời gian, viết mô tả tự nhiên, ghép thông tin |
| **2. Video transcript** | ~500 (video audio) | ~300 | TikTok/IG video content không có dạng text |
| **3. NLP input parsing** | ~100 | ~100 | Parse "tháng 6 đi Đà Lạt 5 ngày 5tr" → structured JSON |

### AI Provider Abstraction

```typescript
// packages/ai/src/provider.ts
interface AIProvider {
  generateItineraryOverview(input: ItineraryInput, context: CityContext): Promise<ItineraryOverview>
  generateItineraryDetail(input: ItineraryInput, data: PreFetchedData): Promise<ItineraryDetail>
  transcribeVideo(videoUrl: string): Promise<string>
  parseNaturalInput(text: string): Promise<StructuredInput>
}

// Implementations:
// packages/ai/src/providers/openai.ts   → GPT-4o
// packages/ai/src/providers/gemini.ts   → Gemini 1.5 Pro
// packages/ai/src/providers/claude.ts   → Claude 3.5 Sonnet

// Switch via environment variable: AI_PROVIDER=openai|gemini|claude
```

### Data Sources Map

| Data | Primary Source | Method | Fallback |
|---|---|---|---|
| Attractions/Places | Google Places API | REST API | TripAdvisor scrape |
| Restaurants | Google Places API + Foursquare | REST API | AI knowledge |
| Hotels | Booking.com Affiliate API | REST API | Airbnb scrape |
| Transport (train/bus) | 12go.asia, Baolau | Scrape | VietRail (Vietnam) |
| Transport (flight) | Skyscanner API | REST API | Traveloka scrape |
| Car/motorbike rental | MiCar, iCar | Scrape | AI suggest |
| Ticket activities | Klook, Traveloka, Trip.com | Scrape search pages | GetYourGuide, Viator |
| Sunrise/Sunset times | sunrise-sunset.org | Free API (lat/lon) | — |
| Weather/Seasons | OpenMeteo | Free API | — |
| TikTok/IG trending | Search page scrape | Scrape | Deep-link generation |
| Video content | — | AI transcript only | — |
| **Itinerary structure** | **AI (GPT/Gemini/Claude)** | **AI + structured prompt** | — |

### Scraper Routing by Country

Scrapers được route tự động dựa vào `city.country`:

```typescript
// packages/scrapers/transport.ts
const TRANSPORT_SOURCES = {
  VN: ['12go', 'baolau', 'vietrail', 'skyscanner'],
  JP: ['hyperdia', 'jr-pass', 'skyscanner'],
  EU: ['trainline', 'omio', 'skyscanner'],
  TH: ['12go', 'thaitrains', 'skyscanner'],
  DEFAULT: ['skyscanner', '12go'],
}

const TICKET_SOURCES = {
  VN: ['klook', 'traveloka', 'trip-com'],
  JP: ['klook', 'viator', 'getyourguide'],
  EU: ['getyourguide', 'viator', 'klook'],
  DEFAULT: ['klook', 'viator', 'getyourguide'],
}
```

---

## 9. Database Design

### Supabase PostgreSQL (Relational — Users & Trips)

```sql
-- Users (managed by Supabase Auth, extended)
CREATE TABLE users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT UNIQUE NOT NULL,
  name        TEXT,
  avatar_url  TEXT,
  plan        TEXT DEFAULT 'free' CHECK (plan IN ('free', 'premium')),
  locale      TEXT DEFAULT 'vi',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Itineraries (saved generated trips)
CREATE TABLE itineraries (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  job_id      TEXT UNIQUE,                    -- BullMQ job ID
  cities      TEXT[],                         -- ["Da Nang", "Hoi An"]
  countries   TEXT[],                         -- ["VN"]
  start_date  DATE,
  end_date    DATE,
  num_days    INTEGER,
  budget      NUMERIC,
  currency    TEXT DEFAULT 'VND',
  trip_style  TEXT,                           -- adventure/relax/culture/food
  status      TEXT DEFAULT 'generating'       -- generating/complete/failed
              CHECK (status IN ('generating', 'complete', 'failed')),
  result      JSONB,                          -- full AI output JSON
  is_public   BOOLEAN DEFAULT FALSE,
  share_token TEXT UNIQUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Saved Trips (bookmarks)
CREATE TABLE saved_trips (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES users(id) ON DELETE CASCADE,
  itinerary_id  UUID REFERENCES itineraries(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, itinerary_id)
);

-- Subscriptions
CREATE TABLE subscriptions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID REFERENCES users(id) ON DELETE CASCADE,
  stripe_customer_id TEXT,
  stripe_sub_id     TEXT,
  status            TEXT CHECK (status IN ('active', 'cancelled', 'expired')),
  plan              TEXT CHECK (plan IN ('monthly', 'yearly')),
  current_period_end TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_itineraries_user_id ON itineraries(user_id);
CREATE INDEX idx_itineraries_share_token ON itineraries(share_token);
CREATE INDEX idx_itineraries_status ON itineraries(status);
```

### MongoDB Atlas (Flexible — Places & Cache)

```javascript
// Collection: cities
{
  _id: ObjectId,
  slug: "da-nang",
  name: { en: "Da Nang", vi: "Đà Nẵng", ja: "ダナン" },
  country: "VN",
  timezone: "Asia/Ho_Chi_Minh",
  currency: "VND",
  lat: 16.0544,
  lon: 108.2022,
  scraper_sources: {
    transport: ["12go", "baolau"],
    tickets: ["klook", "traveloka"],
    places: "google_places"
  },
  popular: true,
  updatedAt: ISODate
}

// Collection: places (attractions + restaurants)
{
  _id: ObjectId,
  city_slug: "da-nang",
  type: "attraction" | "restaurant" | "hotel",
  name: "Bà Nà Hills",
  rating: 4.5,
  price_range: "$$",
  address: "...",
  lat: 15.9959,
  lon: 107.9878,
  maps_link: "https://maps.google.com/?q=...",
  categories: ["theme_park", "mountain"],
  opening_hours: { mon: "07:00-21:00", ... },
  source: "google_places",
  ttl: ISODate,  // TTL index — 7 days
}

// Collection: cached_responses
{
  _id: ObjectId,
  cache_key: "sha256_hash_of_params",
  result: { ... },  // full itinerary JSON
  ttl: ISODate,     // TTL index — 1 hour
}
```

### Redis (Upstash) — Queue & Cache

```
Keys:
  bull:itinerary:{job_id}          → BullMQ job data
  cache:itinerary:{hash}           → cached result (TTL 1h)
  cache:city_meta:{slug}           → city metadata (TTL 30d)
  ratelimit:ip:{ip}                → rate limit counter
  session:{user_id}:{job_id}       → SSE stream state
```

---

## 10. API Design

### Endpoints

```
POST   /api/itinerary/generate
GET    /api/itinerary/stream/:job_id     (SSE)
GET    /api/itinerary/:id
POST   /api/itinerary/:id/save           (auth required)
DELETE /api/itinerary/:id                (auth required, owner only)
PATCH  /api/itinerary/:id/share          (auth required — toggle public)
GET    /api/itinerary/shared/:share_token (public)

GET    /api/cities/search?q=danang       (autocomplete)
GET    /api/cities/:slug                 (metadata)

GET    /api/user/me                      (auth required)
GET    /api/user/saved-trips             (auth required)
GET    /api/user/history                 (auth required)

POST   /api/billing/checkout             (premium — Stripe)
POST   /api/billing/webhook              (Stripe webhook)
POST   /api/export/pdf/:itinerary_id     (premium — auth required)
```

### POST /api/itinerary/generate

**Request:**
```json
{
  "cities": ["Da Nang", "Hoi An"],
  "start_date": "2026-06-10",
  "end_date": "2026-06-15",
  "budget": 8000000,
  "currency": "VND",
  "trip_style": "food",
  "locale": "vi",
  "num_travelers": 2
}
```

**Response (immediate — job queued):**
```json
{
  "job_id": "itinerary_abc123",
  "status": "queued",
  "stream_url": "/api/itinerary/stream/itinerary_abc123",
  "estimated_wait_seconds": 8
}
```

### SSE Events — GET /api/itinerary/stream/:job_id

```
event: queued
data: { "status": "queued", "position": 3 }

event: processing
data: { "status": "processing", "step": "fetching_city_data" }

event: overview_ready
data: {
  "title": "5 Ngày Ẩm Thực Đà Nẵng - Hội An",
  "overview": "...",
  "cities": ["Da Nang", "Hoi An"],
  "total_days": 5,
  "estimated_budget": { "min": 7200000, "max": 9500000, "currency": "VND" },
  "day_plan": ["Đà Nẵng (3 ngày)", "Hội An (2 ngày)"]
}

event: city_ready
data: { "city": "Da Nang", "days": [{ ... detailed day ... }] }

event: transport_ready
data: { "transport_summary": [{ ... }] }

event: restaurants_ready
data: { "restaurants": { "Da Nang": [...], "Hoi An": [...] } }

event: complete
data: { "itinerary_id": "uuid", "status": "complete" }

event: error
data: { "message": "...", "code": "GENERATION_FAILED" }
```

---

## 11. Output Schema (AI Response)

Full TypeScript schema cho itinerary JSON:

```typescript
interface ItineraryOutput {
  itineraries: Itinerary[]
}

interface Itinerary {
  title: string
  overview: string
  total_cost: number
  currency: string
  num_days: number
  num_travelers: number

  // Gợi ý theo mùa/tháng từ travel dates
  seasonal_notes: {
    travel_month: string           // "Tháng 6"
    daylight_hours: string         // "~13 tiếng/ngày"
    sunrise_time: string           // "05:18"
    sunset_time: string            // "18:52"
    weather_note: string
    highlights: string[]
    warnings: string[]
  }

  // Tóm tắt di chuyển giữa các thành phố
  transport_summary: TransportSegment[]

  // Lịch trình từng ngày
  days: Day[]

  hotels: Hotel[]
  restaurants: Restaurant[]

  // Gợi ý tour/experience từ nhiều platform
  suggestions: Suggestion[]

  // Budget breakdown
  budget_breakdown: {
    accommodation: number
    food: number
    activities: number
    transport: number
    contingency: number
    total: number
    currency: string
    per_person: number
    per_day: number
  }
}

interface Day {
  day_number: number
  date: string                     // "2026-06-10"
  city: string
  title: string                    // "Khám phá Đà Nẵng — Ẩm thực phố cổ"

  // Di chuyển đầu ngày (nếu đổi city)
  transport?: TransportSegment

  activities: Activity[]
  daily_cost_estimate: number
}

interface Activity {
  time: string                     // "08:00"
  name: string
  description: string
  duration: string                 // "2 tiếng"
  cost: number
  currency: string
  category: 'attraction' | 'food' | 'transport' | 'accommodation' | 'leisure' | 'shopping'
  maps_link: string
  booking_link?: string            // Official site nếu có

  // Gợi ý mua vé/đặt chỗ từ nhiều platform
  ticket_activities?: TicketOption[]

  // Lưu ý thời điểm đặc biệt
  golden_moment?: {
    type: 'sunrise' | 'sunset' | 'golden_hour' | 'blue_hour' | 'night_view' | 'crowd_avoid'
    best_time: string             // "18:30–19:00"
    tip: string
  }
}

interface TicketOption {
  platform: 'Klook' | 'Traveloka' | 'Trip.com' | 'GetYourGuide' | 'Viator' | 'Official' | string
  url: string
  price_from?: string            // "từ 150.000đ"
  note?: string
}

interface TransportSegment {
  segment: string                  // "Đà Nẵng → Hội An"
  from: string
  to: string
  recommended_mode: 'train' | 'flight' | 'bus' | 'car' | 'self_drive' | 'taxi' | 'motorbike'
  options: TransportOption[]
}

interface TransportOption {
  provider: string                 // "VietRail", "Vietnam Airlines", "Grab"
  type: 'train' | 'flight' | 'bus' | 'car_rental' | 'self_drive' | 'motorbike_rental' | 'taxi'
  departure?: string               // "06:00"
  arrival?: string                 // "10:30"
  duration?: string                // "4h30m"
  price_range: string              // "350k–600k/người"
  booking_url: string
  note?: string
}

interface Hotel {
  name: string
  stars?: number
  price_per_night: string
  price_range: string
  booking_url: string
  airbnb_url: string
  address: string
  maps_link: string
  note?: string
}

interface Restaurant {
  name: string
  cuisine: string
  price_range: string              // "$" | "$$" | "$$$"
  price_per_person?: string        // "50k–100k/người"
  address: string
  maps_link: string
  tiktok_search_link: string       // deep-link to TikTok search
  ig_search_link: string           // deep-link to Instagram search
  note?: string
  golden_moment?: {                // e.g. "Best at sunset — sea view"
    best_time: string
    tip: string
  }
}

interface Suggestion {
  name: string
  description?: string
  type: 'tour' | 'activity' | 'experience' | 'transport' | 'combo'
  platform: 'Klook' | 'Traveloka' | 'Trip.com' | 'GetYourGuide' | 'Viator' | 'Official' | string
  url: string
  price_from?: string
  duration?: string
  note?: string
}
```

---

## 12. Concurrency & Scalability

### Problem: 1,000 Concurrent Users

Nếu 1,000 users gửi request đồng thời:
- 1,000 AI calls song song → bị rate limit, tốn $$$, timeout
- **Solution:** Queue + Cache-first

### Queue Architecture (BullMQ)

```
1000 requests → Redis BullMQ Queue
                        │
              ┌─────────┼─────────┐
           Worker1   Worker2  ...WorkerN   (auto-scale 10–50)
              │
         Phase 1 (Overview) ~2-3s
              │
         Phase 2 (Detail, per city, parallel) ~5-10s
```

**Estimated response times tại load:**

| Scenario | Latency |
|---|---|
| Cache hit (same params, popular queries) | < 200ms |
| Phase 1 overview (first meaningful render) | 2–4s |
| Phase 2 full detail (1 city) | 8–12s |
| Phase 2 full detail (3 cities, parallel) | 10–18s |
| Queue wait (peak 1000 users, 50 workers) | +5–20s |
| **P95 total (cold, 1 city)** | **~15s** |
| **P95 total (cold, 3 cities)** | **~20–25s** |

### Cache-First Flow

```typescript
async function handleGenerate(input: ItineraryInput) {
  const cacheKey = hashParams(input)

  // 1. Check Redis cache
  const cached = await redis.get(`cache:itinerary:${cacheKey}`)
  if (cached) return { status: 'cached', result: JSON.parse(cached) }

  // 2. Check MongoDB (longer TTL)
  const stored = await mongodb.cached_responses.findOne({ cache_key: cacheKey })
  if (stored) {
    await redis.setex(`cache:itinerary:${cacheKey}`, 3600, JSON.stringify(stored.result))
    return { status: 'cached', result: stored.result }
  }

  // 3. Enqueue job
  const job = await itineraryQueue.add('generate', { input, cacheKey })
  return { job_id: job.id, status: 'queued', stream_url: `/api/itinerary/stream/${job.id}` }
}
```

### Horizontal Scaling

```
Load Balancer (Cloudflare)
        │
  ┌─────┼─────┐
API  API  API       ← stateless Fastify instances (Docker)
  └─────┼─────┘
        │
  Redis Cluster ← shared queue + cache
        │
  ┌─────┼─────┐
WRK  WRK  WRK       ← BullMQ workers (scale independently)
```

Workers có thể scale riêng với API servers — khi queue lớn, chỉ cần thêm workers.

---

## 13. Progressive UX Strategy

### Two-Phase Generation UI

**Phase 1 — Overview (2–4s sau submit):**
- Show skeleton → fade in overview card
- Hiển thị: title, số ngày, city breakdown, estimated budget range
- User có thể đọc overview, scroll, trong khi Phase 2 load tiếp

**Phase 2 — Detail (fill dần khi events arrive):**
- Day timeline điền dần từng activity (có animation slide-in)
- "Đà Nẵng đã sẵn sàng ✓" → "Hội An đang tải..."
- Transport section appear khi transport_ready event
- Restaurants section appear khi restaurants_ready event

```
┌──────────────────────────────────────────┐
│  5 Ngày Ẩm Thực Đà Nẵng - Hội An  ←Phase 1 (2s)
│  Est. 7.2M – 9.5M VND                   │
│  ────────────────────────────────────    │
│  Ngày 1 – Đà Nẵng        ←Phase 2 (8s) │
│  ● 08:00 Bún mẹ... [loading shimmer]    │
│  ● 10:00 [shimmer]                      │
│  Ngày 2 – Đà Nẵng        [loading...]  │
└──────────────────────────────────────────┘
```

### UX States

| State | UI |
|---|---|
| `queued` | Skeleton + spinner + "Đang chuẩn bị hành trình của bạn..." |
| `overview_ready` | Overview card fade in, skeleton below |
| `city_ready` | Day-by-day timeline animates in per city |
| `transport_ready` | Transport section slides in |
| `restaurants_ready` | Restaurant cards appear |
| `complete` | All content + export/save buttons active |
| `error` | Error card + retry button |

---

## 14. Integrations

### Booking Links

```typescript
// Booking.com affiliate
function buildBookingUrl(city: string, checkIn: string, checkOut: string) {
  return `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(city)}&checkin=${checkIn}&checkout=${checkOut}&aid={AFFILIATE_ID}`
}

// Airbnb affiliate
function buildAirbnbUrl(city: string, checkIn: string, checkOut: string) {
  return `https://www.airbnb.com/s/${encodeURIComponent(city)}/homes?checkin=${checkIn}&checkout=${checkOut}`
}

// Klook
function buildKlookUrl(activityName: string, city: string) {
  return `https://www.klook.com/search/?query=${encodeURIComponent(`${activityName} ${city}`)}`
}

// Traveloka
function buildTravelokaUrl(activityName: string) {
  return `https://www.traveloka.com/en-vn/activities/search?keyword=${encodeURIComponent(activityName)}`
}

// Trip.com
function buildTripUrl(activityName: string) {
  return `https://www.trip.com/travel-guide/attraction/search/?keyword=${encodeURIComponent(activityName)}`
}

// TikTok search deep-link
function buildTikTokSearchUrl(query: string) {
  return `https://www.tiktok.com/search?q=${encodeURIComponent(query)}`
}

// Instagram search deep-link
function buildInstagramSearchUrl(query: string) {
  return `https://www.instagram.com/explore/tags/${encodeURIComponent(query.replace(/ /g, ''))}/`
}
```

### Social Link Strategy

Không scrape TikTok/IG data trực tiếp (rate limit, legal risk). Thay vào đó:
1. AI generate restaurant/place tên dựa trên pre-fetched Google Places data
2. Build TikTok/IG search URL → user click → tự tìm content
3. Nếu có video URL (do user paste hoặc từ scrape hợp lệ) → AI transcript

---

## 15. Monetization

### Free Plan
- Generate tối đa 3 itineraries/ngày
- Lưu tối đa 5 chuyến đi
- Xem overview + full detail
- Tất cả affiliate links
- Share public link

### Premium Plan (~99k–199k VND/tháng)
- Unlimited generation
- Unlimited saved trips
- Export PDF (react-pdf — server rendered)
- Priority queue (jobs được xử lý trước)
- AI re-generate với custom preferences
- Gợi ý "theo phong cách TikTok trending"

### Affiliate Revenue
- Booking.com: 25–40% commission trên booking
- Airbnb: affiliate program
- Klook: 3–5% per booking
- Traveloka: affiliate program

### Freemium Gating Middleware (Fastify)

```typescript
async function premiumGate(request: FastifyRequest, reply: FastifyReply) {
  const user = await getUser(request)
  if (!user) return reply.unauthorized()

  const feature = request.routeOptions.config?.premium_feature
  if (feature && user.plan === 'free') {
    return reply.paymentRequired({ feature, upgrade_url: '/pricing' })
  }
}
```

---

## 16. i18n & Global Expansion

### Language Support

| Language | Code | Status |
|---|---|---|
| Tiếng Việt | `vi` | Phase 1 |
| English | `en` | Phase 1 |
| 日本語 | `ja` | Phase 2 |
| 中文 | `zh` | Phase 2 |
| Français | `fr` | Phase 3 |

**Web (next-intl):**
```
apps/web/messages/
├── en.json
├── vi.json
└── ja.json
```

**Mobile (i18next):**
```
apps/mobile/locales/
├── en/common.json
└── vi/common.json
```

### Global City Support

City metadata database (MongoDB) seeded với ~500 popular cities worldwide:
- Latitude/Longitude → sunrise/sunset tính globally (không hardcode timezone)
- Currency per country → hiển thị đúng budget
- Scraper sources per country → transport/ticket routes đúng
- Name localization → hiển thị tên thành phố theo ngôn ngữ user

### AI Prompt Localization

```typescript
const systemPrompt = locale === 'vi'
  ? 'Bạn là chuyên gia lập kế hoạch du lịch. Trả lời bằng tiếng Việt...'
  : 'You are an expert travel planner. Respond in English...'
```

---

## 17. Implementation Phases

### Phase 1 — Foundation (Week 1–2)
- [ ] Turborepo monorepo init + workspace structure
- [ ] `packages/types` — all shared TypeScript interfaces
- [ ] `packages/config` — ESLint, TSConfig, Tailwind shared config
- [ ] `packages/ui` — base component scaffold (Button, Card, Input, Skeleton)
- [ ] Supabase project setup + SQL migrations (users, itineraries, saved_trips, subscriptions)
- [ ] Redis Upstash setup + connection utility
- [ ] MongoDB Atlas setup + city metadata seeder (~500 cities)
- [ ] Fastify API scaffold (env validation via Zod, health check, error handler)
- [ ] `packages/ai` — AIProvider interface + OpenAI implementation

### Phase 2 — Data Pipeline (Week 2–3)
- [ ] `packages/scrapers/astro.ts` — sunrise-sunset.org + OpenMeteo API
- [ ] `packages/scrapers/google-places.ts` — Google Places API (places + restaurants)
- [ ] `packages/scrapers/booking.ts` — Booking.com Affiliate API
- [ ] `packages/scrapers/transport.ts` — 12go + Baolau + Skyscanner
- [ ] `packages/scrapers/tickets.ts` — Klook + Traveloka + Trip.com
- [ ] `packages/scrapers/social.ts` — TikTok/IG search link builder
- [ ] MongoDB TTL indexes + caching layer

### Phase 2b — Queue & Streaming (Week 3)
- [ ] BullMQ setup trong Fastify (itinerary queue)
- [ ] `POST /api/itinerary/generate` — enqueue + return job_id
- [ ] SSE endpoint `GET /api/itinerary/stream/:job_id`
- [ ] Worker Phase 1: overview generation
- [ ] Worker Phase 2: per-city parallel detail generation
- [ ] Cache-first middleware

### Phase 3 — Web App (Week 4–5)
- [ ] Supabase Auth (Google OAuth + email) in Next.js
- [ ] Home page — city autocomplete, date picker, budget input, style selector
- [ ] Itinerary list page — overview cards
- [ ] Itinerary detail page — day timeline, SSE progressive loading
- [ ] Budget breakdown component (visual chart)
- [ ] Save/share functionality
- [ ] Seasonal notes + golden moment UI components

### Phase 4 — Integrations (Week 5–6, parallel với Phase 3)
- [ ] Affiliate link builders (Booking, Airbnb, Klook, Traveloka, Trip.com)
- [ ] Transport booking link generation
- [ ] TikTok/IG search deep-links
- [ ] Ticket options UI (per activity)
- [ ] Suggestions section UI

### Phase 5 — Mobile App (Week 6–7)
- [ ] Expo Router setup + tab/stack navigation
- [ ] Reuse `packages/ui` shared components
- [ ] HomeScreen — input form
- [ ] ItineraryListScreen — SSE + progressive loading
- [ ] ItineraryDetailScreen — day timeline
- [ ] ProfileScreen — saved trips, settings

### Phase 6 — Monetization (Week 7–8)
- [ ] Freemium gating middleware
- [ ] PDF export (react-pdf, premium)
- [ ] Stripe integration (checkout + webhook)
- [ ] Pricing page

### Phase 7 — i18n + Polish (Week 8–9)
- [ ] next-intl setup (web) + i18next (mobile)
- [ ] EN + VI translation files
- [ ] Next.js SEO metadata + Open Graph
- [ ] Redis cache tuning
- [ ] Rate limiting per IP
- [ ] Monitoring: Sentry + Bullboard queue monitor

---

## 18. Infrastructure

### Development

```bash
# Local development
pnpm install
pnpm dev              # starts web + api + mobile concurrently
pnpm dev --filter web # only web
pnpm dev --filter api # only api
```

### Production Deployment

```
Cloudflare (CDN + DDoS protection + edge cache)
        │
        │ HTTPS
        ▼
Railway / Render
├── fastify-api (auto-scale, stateless)
├── bullmq-workers (scale to 50 workers at peak)
└── next-web (or Vercel)

External Services:
├── Supabase (managed PostgreSQL + Auth)
├── MongoDB Atlas (M10+ cluster, global)
├── Redis Upstash (serverless Redis)
├── OpenAI API (+ Gemini/Claude fallback)
└── Cloudflare R2 (PDF storage)
```

### Environment Variables

```bash
# AI Providers
AI_PROVIDER=openai                         # openai | gemini | claude
OPENAI_API_KEY=sk-...
GEMINI_API_KEY=...
ANTHROPIC_API_KEY=...

# Databases
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=...
MONGODB_URI=mongodb+srv://...
REDIS_URL=rediss://...

# Scrapers / APIs
GOOGLE_PLACES_API_KEY=...
SKYSCANNER_API_KEY=...
BOOKING_AFFILIATE_ID=...

# App
NEXT_PUBLIC_APP_URL=https://travel.yourapp.com
JWT_SECRET=...
STRIPE_SECRET_KEY=...
STRIPE_WEBHOOK_SECRET=...
```

### Monitoring & Observability

| Tool | Purpose |
|---|---|
| **Sentry** | Error tracking (API + Web + Mobile) |
| **Bullboard** | BullMQ queue dashboard (internal) |
| **Supabase Dashboard** | DB + Auth monitoring |
| **Upstash Console** | Redis metrics |
| **Cloudflare Analytics** | Traffic + CDN stats |
| **OpenAI Usage** | Token cost monitoring |

---

*Document last updated: April 10, 2026*
