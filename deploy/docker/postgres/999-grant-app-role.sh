#!/usr/bin/env bash
set -Eeuo pipefail

app_user="${POSTGRES_APP_USER:-travel_planner}"

psql \
  --set=ON_ERROR_STOP=1 \
  --username "${POSTGRES_USER:-postgres}" \
  --dbname "${POSTGRES_DB:-postgres}" \
  --set="app_user=$app_user" <<'SQL'
SELECT format('GRANT CONNECT ON DATABASE %I TO %I', current_database(), :'app_user')
\gexec

SELECT format('GRANT USAGE ON SCHEMA public TO %I', :'app_user')
\gexec

SELECT format(
  'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO %I',
  :'app_user'
)
\gexec

SELECT format(
  'GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO %I',
  :'app_user'
)
\gexec

SELECT format('GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO %I', :'app_user')
\gexec

SELECT format(
  'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO %I',
  current_user,
  :'app_user'
)
\gexec

SELECT format(
  'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO %I',
  current_user,
  :'app_user'
)
\gexec
SQL
