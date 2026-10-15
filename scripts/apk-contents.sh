#!/usr/bin/env bash
# Print where the size of an APK goes, as Markdown: the total, the raw and stored size of the native libraries per ABI,
# dex, resources and assets, and the 40 largest entries. Stored = the size inside the APK (compressed when deflated).
#
#   ./scripts/apk-contents.sh path/to/app.apk
#
# Used by scripts/android-local-release.sh and by step "Report the APK contents" of .github/workflows/mobile-release.yml.
set -euo pipefail

apk="${1:?usage: $0 <file.apk>}"
command -v zipinfo >/dev/null || { echo "zipinfo not found (package unzip)" >&2; exit 1; }

echo "### APK contents"
echo
wc -c <"$apk" | awk '{ printf "Total: %.1f MB\n", $1 / 1048576 }'
echo
echo '```'
zipinfo -l "$apk" | awk 'NF >= 10 && $4 ~ /^[0-9]+$/ && $10 !~ /\/$/ {
    n = $10; g = n
    if (n ~ /^lib\//) { split(n, p, "/"); g = "lib/" p[2] }
    else if (n ~ /\.dex$/) g = "dex"
    else if (n ~ /^assets\//) g = "assets"
    else if (n ~ /^res\// || n == "resources.arsc") g = "res"
    else g = "other"
    raw[g] += $4; stored[g] += $6
  }
  END { printf "%-22s %10s %10s\n", "group", "raw MB", "stored MB"
        for (g in raw) printf "%-22s %10.1f %10.1f\n", g, raw[g] / 1048576, stored[g] / 1048576 }'
echo
echo "Largest entries (stored MB, raw MB, name):"
# awk instead of head: head closes the pipe early and sort then fails under pipefail.
zipinfo -l "$apk" | awk 'NF >= 10 && $4 ~ /^[0-9]+$/ && $10 !~ /\/$/ { printf "%8.2f %8.2f  %s\n", $6 / 1048576, $4 / 1048576, $10 }' \
  | sort -rn | awk 'NR <= 40'
echo '```'
