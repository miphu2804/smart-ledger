#!/bin/sh
# Runs deploy/ansible/playbook.yml for one environment with its env files fresh from Dopbase, so the run never
# depends on what this machine last pulled. The files live in a private temporary directory for the run only and
# are removed afterwards; it asks for your Dopbase password once.
#   scripts/secrets/vps-playbook.sh <environment> [ansible-playbook options]
cd "$(git rev-parse --show-toplevel)" || exit 1
. scripts/secrets/lib.sh
usage="vps-playbook.sh <environment> [ansible-playbook options]"
require_environment "$1" "$usage"
environment="$1"
shift

dir="$(mktemp -d)"
trap 'rm -rf "$dir"' EXIT INT TERM
chmod 700 "$dir"
# A service without a Dopbase environment yet (bifrost on production, say) is left out, as a missing pulled file was.
for service in core ai bifrost vps monitor; do
  dopbase env show "$service/$environment" >/dev/null 2>&1 || continue
  dopbase_export "$service/$environment" "$dir/.env.$service" || exit 1
done
set -a
# shellcheck source=/dev/null
. "$dir/.env.vps"
# The product dashboards' read-only Supabase login (GRAFANA_PG_*) comes from the monitor group.
# shellcheck source=/dev/null
[ -f "$dir/.env.monitor" ] && . "$dir/.env.monitor"
set +a
ansible-playbook -i deploy/ansible/inventory.ini deploy/ansible/playbook.yml --limit "$environment" \
  -e "env_dir=$dir" "$@"
