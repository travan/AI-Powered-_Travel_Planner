#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Please run as root (sudo)."
  exit 1
fi

SERVICE_NAME="ai-travel-planner-unified"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"

systemctl disable --now "$SERVICE_NAME" || true
rm -f "$SERVICE_FILE"
systemctl daemon-reload

systemctl reset-failed "$SERVICE_NAME" || true

echo "Service removed: $SERVICE_NAME"
