#!/usr/bin/env bash
# Smoke test for the local lakehouse (SeaweedFS + Iceberg REST + Trino).
# Run from the repository root: bash infra/lakehouse/smoke.sh
# Creates lake.smoke, writes one row, restarts the catalog to prove it is persistent
# (decision D3), and always drops the schema on exit. Any mismatch exits non-zero.
set -euo pipefail

SERVICES=(seaweedfs lakehouse-init iceberg-rest trino)

trino_sql() {
  docker compose exec -T trino trino --execute "$1"
}

# Prints the row count of lake.smoke.events as a bare number.
count_rows() {
  trino_sql 'SELECT count(*) FROM lake.smoke.events' | tr -d '"[:space:]'
}

expect_one() {
  local label="$1" got
  got="$(count_rows)"
  echo "count(*) ${label}: ${got}"
  if [ "${got}" != "1" ]; then
    echo "FAIL: expected count(*) = 1 ${label}, got '${got}'" >&2
    exit 1
  fi
}

cleanup() {
  local status=$?
  echo "Cleaning up lake.smoke"
  trino_sql 'DROP TABLE IF EXISTS lake.smoke.events' >/dev/null 2>&1 || true
  trino_sql 'DROP SCHEMA IF EXISTS lake.smoke' >/dev/null 2>&1 || true
  if [ "${status}" -ne 0 ]; then
    echo "Smoke test FAILED (exit ${status})" >&2
  fi
  exit "${status}"
}
trap cleanup EXIT

echo "Starting ${SERVICES[*]}"
docker compose up -d --wait "${SERVICES[@]}"

# Trino reports healthy before the catalog is guaranteed to answer, so retry briefly.
for attempt in $(seq 1 30); do
  if trino_sql 'SHOW SCHEMAS FROM lake' >/dev/null 2>&1; then
    break
  fi
  if [ "${attempt}" -eq 30 ]; then
    echo "FAIL: Trino catalog 'lake' did not answer" >&2
    exit 1
  fi
  sleep 2
done

# Start from a clean schema in case a previous run was interrupted hard.
trino_sql 'DROP TABLE IF EXISTS lake.smoke.events' >/dev/null 2>&1 || true
trino_sql 'DROP SCHEMA IF EXISTS lake.smoke' >/dev/null 2>&1 || true

trino_sql 'CREATE SCHEMA lake.smoke' >/dev/null
trino_sql 'CREATE TABLE lake.smoke.events (id integer, name varchar)' >/dev/null
trino_sql "INSERT INTO lake.smoke.events VALUES (1, 'smoke')" >/dev/null
expect_one 'after insert'

echo "Restarting iceberg-rest"
docker compose restart iceberg-rest >/dev/null
docker compose up -d --wait iceberg-rest >/dev/null
expect_one 'after catalog restart'

echo "Smoke test passed"
