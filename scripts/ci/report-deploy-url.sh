#!/usr/bin/env bash
# Usage: report-deploy-url.sh <label>
# Adds "<label>: <URL>" to the run summary.
set -euo pipefail
. "$(dirname "$0")/lib.sh"

echo "${1:?usage: report-deploy-url.sh <label>}: $URL" | ci_summary
