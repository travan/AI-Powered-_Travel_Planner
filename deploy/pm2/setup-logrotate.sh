#!/usr/bin/env bash
set -euo pipefail

APP_NAME="ai-travel-planner-unified"
MAX_SIZE="10M"
RETAIN="7"
COMPRESS="true"
DATE_FORMAT="YYYY-MM-DD_HH-mm-ss"
ROTATE_INTERVAL="0 0 * * *"

if ! command -v pm2 >/dev/null 2>&1; then
  echo "pm2 is not installed or not in PATH"
  exit 1
fi

if ! pm2 jlist >/dev/null 2>&1; then
  echo "pm2 daemon is not running. Start PM2 first."
  exit 1
fi

pm2 install pm2-logrotate || true
pm2 set pm2-logrotate:max_size "$MAX_SIZE"
pm2 set pm2-logrotate:retain "$RETAIN"
pm2 set pm2-logrotate:compress "$COMPRESS"
pm2 set pm2-logrotate:dateFormat "$DATE_FORMAT"
pm2 set pm2-logrotate:rotateInterval "$ROTATE_INTERVAL"
pm2 set pm2-logrotate:workerInterval "30"
pm2 set pm2-logrotate:rotateModule "true"
pm2 set pm2-logrotate:TZ "UTC"

# Limit logrotate to this app when possible
pm2 set pm2-logrotate:pm2 true || true

pm2 save

echo "pm2-logrotate configured for $APP_NAME"
