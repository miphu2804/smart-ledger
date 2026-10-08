#!/usr/bin/env bash
# Render every Mermaid block in README.md to SVG, grouped by topic folder.
# Order of NAMES must match the order of ```mermaid blocks in README.md.
set -euo pipefail
cd "$(dirname "$0")"

NAMES=(
  01-overview/request-resolution
  01-overview/core-services
  02-access/shop-access-guard
  02-access/auth-open-session
  03-sales/state-sale-draft
  03-sales/state-sale-debt
  03-sales/sale-draft-validate
  03-sales/sale-draft-confirm
  04-money/idempotency-execute
  04-money/debt-repay
  04-money/sale-void
  05-report/report-summary
  06-ai/ai-components
  06-ai/ai-chat-sequence
)

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
cp README.md mermaid.json "$TMP"/

npx -y -p @mermaid-js/mermaid-cli mmdc -i "$TMP/README.md" -o "$TMP/out.md" \
  -e svg -b white -c "$TMP/mermaid.json" >/dev/null

count=$(ls "$TMP"/out-*.svg | wc -l | tr -d ' ')
if [ "$count" -ne "${#NAMES[@]}" ]; then
  echo "README.md has $count diagrams but NAMES lists ${#NAMES[@]}; update NAMES" >&2
  exit 1
fi

for i in "${!NAMES[@]}"; do
  name=${NAMES[$i]}
  mkdir -p "$(dirname "$name")"
  cp "$TMP/out-$((i + 1)).svg" "$name.svg"
done
echo "Exported $count diagrams."
