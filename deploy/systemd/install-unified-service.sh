#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Please run as root (sudo)."
  exit 1
fi

APP_USER="${APP_USER:-ai-travel}"
APP_GROUP="${APP_GROUP:-ai-travel}"
INSTALL_DIR="${INSTALL_DIR:-/opt/ai-travel-planner}"
RELEASES_DIR="$INSTALL_DIR/releases"
CURRENT_LINK="$INSTALL_DIR/current"
LOG_DIR="${LOG_DIR:-/var/log/ai-travel-planner}"
ENV_DIR="${ENV_DIR:-/etc/ai-travel-planner}"
ENV_FILE="$ENV_DIR/ai-travel-planner.env"
SERVICE_NAME="ai-travel-planner-unified"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_TEMPLATE="$SCRIPT_DIR/ai-travel-planner-unified.service"
SERVICE_DEST="/etc/systemd/system/${SERVICE_NAME}.service"

if [[ ! -f "$SERVICE_TEMPLATE" ]]; then
  echo "Service template not found: $SERVICE_TEMPLATE"
  exit 1
fi

if ! getent group "$APP_GROUP" >/dev/null 2>&1; then
  groupadd --system "$APP_GROUP"
fi

if ! id -u "$APP_USER" >/dev/null 2>&1; then
  useradd --system --gid "$APP_GROUP" --home-dir "$INSTALL_DIR" --shell /usr/sbin/nologin "$APP_USER"
fi

mkdir -p "$INSTALL_DIR" "$RELEASES_DIR" "$LOG_DIR" "$ENV_DIR"
chown -R "$APP_USER":"$APP_GROUP" "$INSTALL_DIR" "$LOG_DIR"
chmod 750 "$LOG_DIR"

if [[ ! -L "$CURRENT_LINK" && ! -e "$CURRENT_LINK" ]]; then
  ln -s "$INSTALL_DIR" "$CURRENT_LINK"
  chown -h "$APP_USER":"$APP_GROUP" "$CURRENT_LINK"
fi

if [[ ! -f "$ENV_FILE" ]]; then
  cat > "$ENV_FILE" <<'EOF'
NODE_ENV=production
PORT=3001
SERVE_WEB=true
WEB_APP_DIR=../web
# Add app secrets below:
DATABASE_PROVIDER=postgres
# POSTGRES_URL=postgres://user:password@host:5432/travel_planner
# MONGODB_URI=mongodb://host:27017/travel_planner
# JWT_SECRET=replace-with-at-least-32-random-characters
AUTH_PROVIDER=local
NEXT_PUBLIC_AUTH_PROVIDER=local
# Optional Supabase API/Auth:
# SUPABASE_URL=
# SUPABASE_SERVICE_KEY=
# NEXT_PUBLIC_SUPABASE_URL=
# NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
EOF
  chmod 640 "$ENV_FILE"
fi

sed \
  -e "s|^User=.*$|User=$APP_USER|" \
  -e "s|^WorkingDirectory=.*$|WorkingDirectory=$INSTALL_DIR/current|" \
  -e "s|^EnvironmentFile=.*$|EnvironmentFile=-$ENV_FILE|" \
  -e "s|^ReadWritePaths=.*$|ReadWritePaths=$LOG_DIR|" \
  -e "s|^StandardOutput=.*$|StandardOutput=append:$LOG_DIR/out.log|" \
  -e "s|^StandardError=.*$|StandardError=append:$LOG_DIR/error.log|" \
  "$SERVICE_TEMPLATE" > "$SERVICE_DEST"

chmod 644 "$SERVICE_DEST"

systemctl daemon-reload
systemctl enable "$SERVICE_NAME"

echo "Service installed and enabled: $SERVICE_NAME"
echo "Service is not started automatically until the first atomic release is deployed."
echo "Environment file: $ENV_FILE"
echo "Logs directory: $LOG_DIR"
