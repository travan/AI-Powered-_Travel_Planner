#!/usr/bin/env bash
set -Eeuo pipefail

APP_ROOT="${APP_ROOT:-/opt/ai-travel-planner}"
RELEASES_DIR="$APP_ROOT/releases"
CURRENT_LINK="$APP_ROOT/current"
SOURCE_DIR="${SOURCE_DIR:-$PWD}"
SERVICE_NAME="${SERVICE_NAME:-ai-travel-planner-unified}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3001/health}"
KEEP_RELEASES="${KEEP_RELEASES:-5}"
SWITCHED=0

rollback_release() {
  if [[ "$SWITCHED" -eq 1 && -n "$PREVIOUS_RELEASE" && -d "$PREVIOUS_RELEASE" ]]; then
    echo "Rolling back to previous release: $PREVIOUS_RELEASE"
    ln -sfn "$PREVIOUS_RELEASE" "$CURRENT_LINK"
    sudo systemctl restart "$SERVICE_NAME" || true
  fi
}

on_error() {
  local exit_code=$?
  echo "Release failed with exit code $exit_code"
  rollback_release
  exit "$exit_code"
}

trap on_error ERR

if ! command -v rsync >/dev/null 2>&1; then
  echo "rsync is required for atomic release"
  exit 1
fi

if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm is required for atomic release"
  exit 1
fi

TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
NEW_RELEASE="$RELEASES_DIR/$TIMESTAMP"
PREVIOUS_RELEASE=""

mkdir -p "$RELEASES_DIR"

if [[ -L "$CURRENT_LINK" ]]; then
  PREVIOUS_RELEASE="$(readlink -f "$CURRENT_LINK")"
fi

echo "Creating release directory: $NEW_RELEASE"
mkdir -p "$NEW_RELEASE"

rsync -a --delete \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='logs' \
  --exclude='coverage' \
  --exclude='playwright-report' \
  --exclude='test-results' \
  --exclude='.env' \
  --exclude='.env.*' \
  "$SOURCE_DIR/" "$NEW_RELEASE/"

pushd "$NEW_RELEASE" >/dev/null
pnpm install --frozen-lockfile
pnpm build:unified
popd >/dev/null

echo "Switching current symlink to new release"
ln -sfn "$NEW_RELEASE" "$CURRENT_LINK"
SWITCHED=1

echo "Restarting service: $SERVICE_NAME"
sudo systemctl restart "$SERVICE_NAME"

for i in $(seq 1 20); do
  if curl --silent --fail "$HEALTH_URL" >/dev/null 2>&1; then
    echo "Release healthy: $NEW_RELEASE"
    BASE_URL="${HEALTH_URL%/health}" bash "$SOURCE_DIR/deploy/smoke-test.sh"
    APP_ROOT="$APP_ROOT" KEEP_RELEASES="$KEEP_RELEASES" bash "$SOURCE_DIR/deploy/systemd/prune-old-releases.sh"
    exit 0
  fi
  sleep 2
done

echo "Health check failed for new release"
false
