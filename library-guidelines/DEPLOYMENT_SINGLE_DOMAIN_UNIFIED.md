# DEPLOYMENT GUIDE: SINGLE DOMAIN + UNIFIED RUNTIME

This guide summarizes the production setup implemented in this repository to support:
- A single public domain for both frontend (Next.js) and backend (Fastify API).
- Mobile client access through the same API path pattern at /api/*.
- Two deployment models:
  1) Same-domain proxy (two services)
  2) Single-artifact unified runtime (one process)

## 1) Architecture Overview

### A. Same-domain proxy (two services)
- Web app in apps/web runs as a dedicated service.
- API app in apps/api runs as a dedicated service.
- Next.js rewrites /api/* and /health to an internal API target.
- Web clients call /api/* on the same domain.
- Mobile clients call https://your-domain/api/*.

### B. Single-artifact unified runtime (one process)
- One Node.js process runs from apps/api.
- The API process mounts a Next.js request handler for web routes.
- API routes under /api/* continue to be handled by Fastify.
- Web and API are served on the same host and port.

## 2) Implemented Code Changes

- apps/web/next.config.ts
  - Rewrites configured:
    - /api/:path* -> API_PROXY_TARGET/api/:path*
    - /health -> API_PROXY_TARGET/health

- apps/web/lib/api.ts
  - API calls default to same-origin /api/* when NEXT_PUBLIC_API_URL is empty.

- apps/web/hooks/useSSE.ts
  - SSE stream defaults to same-origin /api/itinerary/stream/:jobId.

- apps/web/app/(app)/plan/page.tsx
  - API_URL fallback is empty for same-origin mode.

- apps/api/src/env.ts
  - Added SERVE_WEB, WEB_APP_DIR, and CORS_ORIGINS.

- apps/api/src/app.ts
  - Dynamic CORS allow-list from NEXT_PUBLIC_APP_URL + CORS_ORIGINS.

- apps/api/src/index.ts
  - Unified runtime support: when SERVE_WEB=true, Next.js serves web routes.

- apps/api/package.json
  - Added scripts:
    - dev:unified
    - start:unified
  - Added next as a runtime dependency.

## 3) Recommended Environment Configuration

### Web environment (apps/web/.env.local)
- NEXT_PUBLIC_API_URL=
- API_PROXY_TARGET=http://127.0.0.1:3001

Behavior:
- Empty NEXT_PUBLIC_API_URL means the web app calls same-origin /api/*.
- API_PROXY_TARGET is used by the two-service rewrite model.

### API environment (root .env or runtime environment)
- PORT=3001
- NEXT_PUBLIC_APP_URL=http://localhost:3000
- CORS_ORIGINS=http://localhost:3000,http://localhost:8081
- SERVE_WEB=false for two-service mode
- SERVE_WEB=true for unified mode
- WEB_APP_DIR=../web

## 4) Local Run Modes

### Mode A: Same-domain proxy (two services)
1. Start API:
  - pnpm --dir apps/api dev
2. Start Web:
  - pnpm --dir apps/web dev
3. Access:
  - Web: http://localhost:3000
  - API through web domain: http://localhost:3000/api/*

### Mode B: Unified runtime (one process)
1. Build web and API:
  - pnpm --dir apps/web build
  - pnpm --dir apps/api build
2. Start unified server:
  - pnpm --dir apps/api start:unified
3. Access web and API through the same API process host and port.

Fast development in unified mode:
- pnpm --dir apps/api dev:unified

## 5) Recommended Production Strategy

### If operational stability and independent scaling are the priority
- Use Mode A (two services) behind reverse proxy (Nginx, ALB, Ingress).
- Route /api/* to API service and all other routes to Web service.

### If single artifact and single process are the priority
- Use Mode B (unified runtime).
- Ensure web build artifacts (.next) exist in apps/web before start.
- Horizontal scaling is done by replicating the unified process.

## 6) Pre-Deployment Checklist

- All required API environment variables are set (Supabase, MongoDB, Redis, JWT, etc.).
- Web build is completed before unified start (Mode B).
- API health endpoint is validated:
  - GET /health
- At least one API endpoint is validated:
  - GET /api/cities/popular
- End-to-end itinerary generation and SSE stream are validated.
- Mobile client can access https://your-domain/api/*.

## 7) Common Issues and Resolution

1. WEB_APP_DIR does not exist
- Verify process working directory and WEB_APP_DIR value.
- Current default is ../web from apps/api.

2. Web loads but API returns CORS 403
- Add exact web and mobile origins to CORS_ORIGINS.
- Ensure protocol, host, and port match exactly.

3. Unified mode starts but web routes return 404
- Confirm apps/web has been built.
- Confirm NEXT_PUBLIC_API_URL is empty for same-origin calls.

4. SSE disconnects unexpectedly
- Ensure reverse proxy allows streaming and keep-alive.
- Check load balancer idle timeout values.

## 8) Summary

The current setup provides:
- One domain for both web and API.
- Mobile API access through the same domain.
- Flexible deployment choice between two-service proxy and one-process unified runtime.

## 9) Added Production Manager Templates

The repository now includes ready-to-use production templates:
- PM2: deploy/pm2/ecosystem.config.cjs
- systemd: deploy/systemd/ai-travel-planner-unified.service
- Dockerfile: deploy/docker/Dockerfile.unified
- Docker Compose: deploy/docker/docker-compose.unified.yml
- Docker ignore: .dockerignore

## 10) PM2 Deployment

### Prerequisites
1. Create a production .env file on the server (do not commit).
2. Install Node.js 20+, pnpm, and PM2.

### Recommended commands
1. Build:
  - pnpm build:unified
2. Start:
  - pm2 start deploy/pm2/ecosystem.config.cjs --env production
3. Save PM2 process list:
  - pm2 save
4. Enable startup on reboot:
  - pm2 startup

### PM2 log rotation setup
1. Install and configure PM2 logrotate module:
  - pnpm deploy:pm2:logrotate
2. Default profile in this repository:
  - Max file size: 10M
  - Retention: 7 files
  - Compression: enabled
  - Rotation schedule: daily (UTC)

### Zero-downtime release flow
Use the built-in release script:
- pnpm deploy:pm2:release

The script performs:
1. Unified build.
2. PM2 startOrReload using ecosystem config.
3. Health check validation on /health.
4. PM2 state save on success.

If health checks fail, the script now restores previously backed-up build artifacts and reloads PM2.

### Rolling update
- pnpm build:unified
- pm2 reload deploy/pm2/ecosystem.config.cjs --env production

### Built-in PM2 reliability tuning
- min_uptime and max_restarts configured to avoid restart storms.
- Exponential backoff restart delay enabled.
- Memory-based restart threshold configured.
- Timestamped merged logs configured in ./logs.

## 11) systemd Deployment

### Prerequisites
1. Copy the project to the target path, for example /opt/ai-travel-planner.
2. Create log directory:
  - /var/log/ai-travel-planner
3. Create environment file:
  - /etc/ai-travel-planner/ai-travel-planner.env

### Install service
1. Copy the service template:
  - deploy/systemd/ai-travel-planner-unified.service -> /etc/systemd/system/ai-travel-planner-unified.service
2. Reload systemd:
  - sudo systemctl daemon-reload
3. Enable and start:
  - sudo systemctl enable --now ai-travel-planner-unified

### Automated install and uninstall scripts
Use these scripts to provision service user, directories, permissions, env file, and service registration:
- Install:
  - pnpm deploy:systemd:install
- Uninstall:
  - pnpm deploy:systemd:uninstall

### Atomic release with rollback for systemd
Use the symlink-based atomic release script:
- pnpm deploy:systemd:release

Flow:
1. Create timestamped release under /opt/ai-travel-planner/releases.
2. Sync source code to that release directory.
3. Install dependencies and run unified build in the new release.
4. Switch current symlink to new release and restart service.
5. If health checks fail, relink to previous release and restart.

Installer defaults:
- User/group: ai-travel
- Install path: /opt/ai-travel-planner
- Log path: /var/log/ai-travel-planner
- Environment file: /etc/ai-travel-planner/ai-travel-planner.env

### Operations
- Check service status:
  - sudo systemctl status ai-travel-planner-unified
- Stream logs:
  - sudo journalctl -u ai-travel-planner-unified -f

### Built-in systemd hardening
- NoNewPrivileges enabled.
- Filesystem and home protection enabled.
- Namespace and SUID/SGID restrictions enabled.
- Capability bounding disabled by default.
- Explicit writable path limited to /var/log/ai-travel-planner.

## 12) Docker and Docker Compose Deployment

### Build image
- docker build -f deploy/docker/Dockerfile.unified -t ai-travel-planner:unified .

### Run container
- docker run -d --name ai-travel-planner-unified -p 3001:3001 --env-file .env ai-travel-planner:unified

### Run with Compose
- docker compose -f deploy/docker/docker-compose.unified.yml up -d --build

### Run with environment profiles
- Staging profile:
  - pnpm deploy:docker:up:staging
- Production profile:
  - pnpm deploy:docker:up:production

Profile file:
- deploy/docker/docker-compose.profiles.yml

### Health validation
- curl http://127.0.0.1:3001/health

### Built-in Docker optimizations
- Multi-stage build with workspace-focused dependency installation.
- Docker cache mount for pnpm store to speed up rebuilds.
- Production-only dependency pruning before runtime stage.
- Runtime container runs as non-root user.
- Compose healthcheck configured.
- Compose log rotation configured (size and file count caps).
- Graceful shutdown window configured via stop_grace_period.

## 13) Root Scripts Added for Fast Deployment

Added in package.json:
- build:unified
- start:unified
- deploy:pm2:start
- deploy:pm2:reload
- deploy:pm2:logrotate
- deploy:pm2:release
- deploy:systemd:install
- deploy:systemd:uninstall
- deploy:systemd:release
- deploy:docker:build
- deploy:docker:up
- deploy:docker:up:staging
- deploy:docker:up:production

Goal: reduce operational mistakes during production release.

## 14) Post-Deploy Verification

Run this quick validation after each release:
1. Health check:
  - GET /health returns 200.
2. API check:
  - GET /api/cities/popular returns data.
3. Web check:
  - Home page renders correctly.
4. Unified route check:
  - Web and API are both reachable from the same domain.
5. SSE check:
  - Itinerary generation stream events are received without disconnect loops.

## 15) GitHub Actions Pipeline (Test-Gated Deploy)

Workflow file:
- .github/workflows/pipeline-unified-deploy.yml
- .github/workflows/staging-deploy.yml

Pipeline behavior:
1. Always run quality gates first:
   - lint
   - type-check
   - unit tests (coverage)
   - e2e tests (enabled by default)
2. Build unified artifacts only if all tests pass.
3. Deploy only after successful test and build stages.

Deploy target selection:
- Manual trigger (workflow_dispatch) input: deploy_target
  - none | pm2 | systemd | docker
- For automatic deploy on push to main:
  - set repository variable DEPLOY_TARGET to pm2/systemd/docker

Required self-hosted runner:
- Labels: self-hosted, linux
- Needed for pm2/systemd/docker deployment jobs.

Recommended repository variables:
- DEPLOY_TARGET
- BASE_URL (for smoke tests)
- HEALTH_URL (for release scripts)
- SYSTEMD_APP_ROOT (for systemd atomic release)
- KEEP_RELEASES (for release pruning)

If deploy target is none:
- Workflow still runs full CI and build gates.
- No deployment step is executed.

## 16) Branch Deployment Strategy

Recommended branch-to-environment mapping:
- develop -> staging
- main -> production

Implemented workflows:
1. Staging pipeline:
  - File: .github/workflows/staging-deploy.yml
  - Trigger: push on develop or manual dispatch
  - Gate: lint + type-check + unit test + e2e + build
  - Deploy action: docker staging profile (deploy:docker:up:staging)

2. Production pipeline:
  - File: .github/workflows/pipeline-unified-deploy.yml
  - Trigger: push on main or manual dispatch
  - Gate: full quality and test stages before deployment
  - Deploy target: pm2/systemd/docker (input or DEPLOY_TARGET variable)

Recommended repository variables:
- STAGING_BASE_URL (example: http://127.0.0.1:3101)
- BASE_URL
- HEALTH_URL
- DEPLOY_TARGET
- SYSTEMD_APP_ROOT
- KEEP_RELEASES
