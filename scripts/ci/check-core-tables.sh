#!/usr/bin/env bash
# Fails unless the migrated database (port in PG_PORT) holds the three tables every Core feature starts from.
set -euo pipefail

table_count="$(docker run --rm --network host -e PGPASSWORD=smartledger postgres:16 \
  psql -h 127.0.0.1 -p "$PG_PORT" -U smartledger -d smartledger -Atc \
  "SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename IN ('users', 'auth_identities', 'shops')")"
test "$table_count" = "3"
