#!/usr/bin/env bash
set -euo pipefail

APP_NAME="ai-travel-planner-unified"
ECOSYSTEM_FILE="deploy/pm2/ecosystem.config.cjs"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3001/health}"
BACKUP_ROOT=".deploy-backups"
BACKUP_DIR="$BACKUP_ROOT/pm2-release-$(date +%Y%m%d-%H%M%S)"

rollback() {
  echo "Starting rollback from $BACKUP_DIR"

  if [[ -d "$BACKUP_DIR/apps-server-dist" ]]; then
    rm -rf apps/server/dist
    cp -a "$BACKUP_DIR/apps-server-dist" apps/server/dist
  fi

  if [[ -d "$BACKUP_DIR/apps-web-next" ]]; then
    rm -rf apps/web/.next
    cp -a "$BACKUP_DIR/apps-web-next" apps/web/.next
  fi

  pm2 startOrReload "$ECOSYSTEM_FILE" --env production || true
  pm2 status "$APP_NAME" || true
}

if ! command -v pm2 >/dev/null 2>&1; then
  echo "pm2 is not installed or not in PATH"
  exit 1
fi

if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm is not installed or not in PATH"
  exit 1
fi

mkdir -p "$BACKUP_DIR"

if [[ -d "apps/server/dist" ]]; then
  cp -a apps/server/dist "$BACKUP_DIR/apps-server-dist"
fi

if [[ -d "apps/web/.next" ]]; then
  cp -a apps/web/.next "$BACKUP_DIR/apps-web-next"
fi

echo "Building unified artifacts..."
pnpm build:unified

echo "Reloading PM2 process with zero downtime..."
pm2 startOrReload "$ECOSYSTEM_FILE" --env production

# Give the process a short window before health checks
sleep 2

echo "Waiting for health endpoint: $HEALTH_URL"
for i in $(seq 1 20); do
  if curl --silent --fail "$HEALTH_URL" >/dev/null 2>&1; then
    echo "Health check passed"
    pm2 save
    pm2 status "$APP_NAME"
    exit 0
  fi
  sleep 2
done

echo "Health check failed after reload; initiating rollback"
rollback
exit 1
