#!/usr/bin/env bash
# Writes ai.env under ci_temp_dir: the model gateway, embeddings and model aliases of ai/staging from Dopbase, pointed
# at the throwaway database (port in DB_PORT). The HoneyHive key stays only when SYNC=true. Needs DOPBASE_URL and
# DOPBASE_TOKEN.
set -euo pipefail
. "$(dirname "$0")/lib.sh"

umask 077
dropped='POSTGRES_URL|AI_SQL_READER_URL'
[ "$SYNC" = true ] || dropped="$dropped|HH_API_KEY"
# The database URLs go first: uv keeps the first value of a key and stops reading at a line it cannot parse, so these
# survive whatever the export holds.
{
  echo "POSTGRES_URL=postgresql://smartledger:smartledger@127.0.0.1:$DB_PORT/smartledger"
  echo "AI_SQL_READER_URL=postgresql://ai_reader:ai_reader@127.0.0.1:$DB_PORT/smartledger"
  dopbase export ai/staging --stdout --format dotenv | grep -vE "^($dropped)="
} > "$(ci_temp_dir)/ai.env"
