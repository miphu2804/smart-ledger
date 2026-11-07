#!/usr/bin/env bash
# Applies .honeyhive/charts and .honeyhive/alerts to every project in
# .honeyhive/projects.yaml: charts are created or updated by name, alerts only
# created when missing, because the CLI has no alert update.
# Follows https://docs.honeyhive.ai/v2/cli-reference/config-as-code-charts-alerts
# Usage, from the repo root: HH_DATA_PLANE_API_KEY=... HH_CONTROL_PLANE_API_KEY=... bash scripts/honeyhive/sync-dashboards.sh
set -euo pipefail
shopt -s nullglob  # Skip an empty charts/ or alerts/ folder.

with_project() {
  # Copy the file and add project_id. Keep .yaml so the CLI parses it.
  local tmp
  tmp="$(mktemp -d)/definition.yaml"
  yq ".project_id = \"$1\"" "$2" > "$tmp"
  echo "$tmp"
}

failed=0
for project_id in $(yq '.projects[].id' .honeyhive/projects.yaml); do
  echo "Project $project_id"

  charts=$(honeyhive charts list --project-id "$project_id")
  for file in .honeyhive/charts/*.yaml; do
    name=$(yq '.name' "$file")
    chart_id=$(jq -r --arg n "$name" '[.data[] | select(.name == $n)][0].id // ""' <<< "$charts")
    tmp=$(with_project "$project_id" "$file")
    if [ -n "$chart_id" ]; then
      yq -i ".chart_id = \"$chart_id\"" "$tmp"
      action=update
    else
      action=create
    fi
    if honeyhive charts "$action" --filename "$tmp" > /dev/null; then
      echo "  ${action}d chart: $name"
    else
      echo "  FAILED chart: $name" >&2
      failed=1
    fi
    rm -rf "$(dirname "$tmp")"
  done

  alerts=$(honeyhive alerts list --project-id "$project_id" --limit 100)
  for file in .honeyhive/alerts/*.yaml; do
    name=$(yq '.name' "$file")
    if jq -e --arg n "$name" 'any(.data[]; .name == $n)' <<< "$alerts" > /dev/null; then
      echo "  alert exists, skipped: $name"
      continue
    fi
    tmp=$(with_project "$project_id" "$file")
    if honeyhive alerts create --filename "$tmp" > /dev/null; then
      echo "  created alert: $name"
    else
      echo "  FAILED alert: $name" >&2
      failed=1
    fi
    rm -rf "$(dirname "$tmp")"
  done
done

exit "$failed"
