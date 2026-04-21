#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:3001}"
TIMEOUT_SECONDS="${TIMEOUT_SECONDS:-60}"

check_with_retry() {
  local name="$1"
  local url="$2"
  local start
  start="$(date +%s)"

  while true; do
    if curl --silent --fail "$url" >/dev/null 2>&1; then
      echo "[ok] $name"
      return 0
    fi

    if (( $(date +%s) - start >= TIMEOUT_SECONDS )); then
      echo "[fail] $name -> $url"
      return 1
    fi

    sleep 2
  done
}

echo "Running smoke tests against $BASE_URL"
check_with_retry "health" "$BASE_URL/health"
check_with_retry "popular cities api" "$BASE_URL/api/cities/popular"
check_with_retry "web home" "$BASE_URL/"

echo "Smoke test passed"
