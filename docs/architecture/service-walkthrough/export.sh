#!/usr/bin/env bash
# Render every walkthrough Mermaid source (*/*.mmd) and the logical architecture
# diagram to SVG on a white background, so the diagrams stay readable in light and
# dark Markdown viewers.
# Set MMDC to a local mermaid-cli binary to skip the npx download.
set -euo pipefail
cd "$(dirname "$0")"

MMDC=${MMDC:-"npx -y -p @mermaid-js/mermaid-cli mmdc"}

count=0
for src in */*.mmd; do
  $MMDC -i "$src" -o "${src%.mmd}.svg" -b white -c mermaid.json -q
  count=$((count + 1))
done
$MMDC -i ../diagrams/src/logical-architecture.mmd -o ../diagrams/images/logical-architecture.svg -b white -q
# Preserve spaces between Mermaid's adjacent SVG text spans in non-browser renderers.
python3 - <<'PY'
from pathlib import Path

path = Path('../diagrams/images/logical-architecture.svg')
svg = path.read_text()
if '<svg ' not in svg:
    raise SystemExit('Missing SVG root')
path.write_text(svg.replace('<svg ', '<svg xml:space="preserve" ', 1))
PY
count=$((count + 1))
echo "Exported $count diagrams."
