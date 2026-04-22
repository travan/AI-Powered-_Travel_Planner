#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${APP_ROOT:-/opt/ai-travel-planner}"
RELEASES_DIR="$APP_ROOT/releases"
CURRENT_LINK="$APP_ROOT/current"
KEEP_RELEASES="${KEEP_RELEASES:-5}"

if [[ ! -d "$RELEASES_DIR" ]]; then
  echo "Releases directory does not exist: $RELEASES_DIR"
  exit 0
fi

CURRENT_TARGET=""
if [[ -L "$CURRENT_LINK" ]]; then
  CURRENT_TARGET="$(readlink -f "$CURRENT_LINK")"
fi

mapfile -t RELEASES < <(find "$RELEASES_DIR" -mindepth 1 -maxdepth 1 -type d | sort)
COUNT="${#RELEASES[@]}"

if (( COUNT <= KEEP_RELEASES )); then
  echo "No pruning needed. Releases: $COUNT, keep: $KEEP_RELEASES"
  exit 0
fi

TO_DELETE=$((COUNT - KEEP_RELEASES))
DELETED=0

for release in "${RELEASES[@]}"; do
  if (( DELETED >= TO_DELETE )); then
    break
  fi

  if [[ -n "$CURRENT_TARGET" && "$(readlink -f "$release")" == "$CURRENT_TARGET" ]]; then
    continue
  fi

  echo "Removing old release: $release"
  rm -rf "$release"
  DELETED=$((DELETED + 1))
done

echo "Pruned $DELETED old release(s)"
