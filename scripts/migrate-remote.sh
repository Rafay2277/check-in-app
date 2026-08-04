#!/usr/bin/env bash
# Run API migrations against DATABASE_URL (e.g. Supabase).
# Usage:
#   export DATABASE_URL='postgresql://...?sslmode=require'
#   ./scripts/migrate-remote.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/apps/api"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "Set DATABASE_URL to your Supabase (or Postgres) connection string." >&2
  exit 1
fi

export JWT_ACCESS_SECRET="${JWT_ACCESS_SECRET:-migrate-temp-access-secret}"
export JWT_REFRESH_SECRET="${JWT_REFRESH_SECRET:-migrate-temp-refresh-secret}"
export STAFF_PIN="${STAFF_PIN:-1234}"
export NODE_ENV="${NODE_ENV:-production}"

npm run build
npm run migrate
