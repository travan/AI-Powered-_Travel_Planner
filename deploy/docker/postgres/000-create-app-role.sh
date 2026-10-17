#!/usr/bin/env bash
set -Eeuo pipefail

app_user="${POSTGRES_APP_USER:-travel_planner}"
app_password="${POSTGRES_APP_PASSWORD:-travel_planner}"

if [[ -z "$app_user" || -z "$app_password" ]]; then
  echo "POSTGRES_APP_USER and POSTGRES_APP_PASSWORD must be non-empty." >&2
  exit 1
fi

if [[ "$app_user" == "${POSTGRES_USER:-postgres}" ]]; then
  echo "POSTGRES_APP_USER must differ from the PostgreSQL bootstrap superuser." >&2
  exit 1
fi

psql \
  --set=ON_ERROR_STOP=1 \
  --username "${POSTGRES_USER:-postgres}" \
  --dbname "${POSTGRES_DB:-postgres}" \
  --set="app_user=$app_user" \
  --set="app_password=$app_password" <<'SQL'
SELECT format(
  'CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT',
  :'app_user',
  :'app_password'
)
WHERE NOT EXISTS (
  SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = :'app_user'
)
\gexec

SELECT format(
  'ALTER ROLE %I WITH LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT',
  :'app_user',
  :'app_password'
)
\gexec
SQL
