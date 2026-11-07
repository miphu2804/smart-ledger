#!/usr/bin/env bash
# Render every Mermaid source (*/*.mmd) to an SVG beside it, on a white background
# so the diagrams stay readable in light and dark Markdown viewers.
# Set MMDC to a local mermaid-cli binary to skip the npx download.
set -euo pipefail
cd "$(dirname "$0")"

MMDC=${MMDC:-"npx -y -p @mermaid-js/mermaid-cli mmdc"}

count=0
for src in */*.mmd; do
  $MMDC -i "$src" -o "${src%.mmd}.svg" -b white -c mermaid.json -q
  count=$((count + 1))
done
echo "Exported $count diagrams."
