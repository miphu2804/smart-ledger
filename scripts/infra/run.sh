#!/bin/sh
# Plans or applies deploy/ansible on the VPS for one environment, from any machine with Ansible and the Dopbase CLI
# (the image of deploy/ansible/Dockerfile has both). It exports the environment's settings from Dopbase into a
# private temporary directory, removed on exit, and takes everything else from neutral variables:
#   SMARTLEDGER_VPS_HOST, SMARTLEDGER_VPS_USER   address and admin login (with sudo) of the VPS; required
#   SSH_PRIVATE_KEY            base64 of the login's key, held in a job-local ssh-agent; unset uses your ssh config
#   SSH_KNOWN_HOSTS            pinned host keys, required with SSH_PRIVATE_KEY
#   DOPBASE_URL                the Dopbase server
#   DOPBASE_TOKEN_<SERVICE>    runner token of <service>/<environment>, for CORE, AI, BIFROST, VPS and MONITOR. A
#                              Dopbase token reads one environment, so each group needs its own; DOPBASE_TOKEN is
#                              the fallback for a group without one. With neither, the CLI asks for your password.
# `plan` is a dry run (--check --diff) that also writes out/infra-plan-<environment>.txt; `apply` changes the VPS.
# Scope `app` writes one environment's own files (staging or production); `all` also configures the shared host and
# runs for production only (docs/development/ci-cd.md#vps).
#   scripts/infra/run.sh <plan|apply> <environment> [--scope app|all] [ansible-playbook options]
set -eu
root="$(cd "$(dirname "$0")/../.." && pwd)"
. "$root/scripts/secrets/lib.sh"
usage="run.sh <plan|apply> <environment> [--scope app|all] [ansible-playbook options]"

mode="${1:-}"
case "$mode" in plan|apply) ;; *) echo "usage: $usage" >&2; exit 1 ;; esac
require_environment "${2:-}" "$usage"
environment="$2"
shift 2
scope=app
if [ "${1:-}" = --scope ]; then
  scope="${2:-}"
  shift 2
fi
case "$scope" in app|all) ;; *) echo "usage: $usage" >&2; exit 1 ;; esac
: "${SMARTLEDGER_VPS_HOST:?SMARTLEDGER_VPS_HOST is not set}" "${SMARTLEDGER_VPS_USER:?SMARTLEDGER_VPS_USER is not set}"

dir="$(mktemp -d)"
chmod 700 "$dir"
# shellcheck disable=SC2329 # invoked by the trap
cleanup() {
  [ -z "${SSH_AGENT_PID:-}" ] || ssh-agent -k >/dev/null
  rm -rf "$dir"
}
trap cleanup EXIT INT TERM

# The key lives only in a job-local ssh-agent, and the pinned known_hosts refuses a spoofed server.
if [ -n "${SSH_PRIVATE_KEY:-}" ]; then
  : "${SSH_KNOWN_HOSTS:?SSH_KNOWN_HOSTS is not set}"
  printf '%s\n' "$SSH_KNOWN_HOSTS" > "$dir/known_hosts"
  eval "$(ssh-agent -s)" >/dev/null
  printf '%s' "$SSH_PRIVATE_KEY" | base64 -d | ssh-add -
  export ANSIBLE_SSH_COMMON_ARGS="-o UserKnownHostsFile=$dir/known_hosts -o StrictHostKeyChecking=yes -o BatchMode=yes"
fi

# Exports <service>/<environment> as dotenv to $dir/.env.<service> with the service's token, else the shared token,
# else your password. A job-local data dir keeps the machine's own Dopbase login untouched.
export_service() {
  service="$1"
  upper="$(echo "$service" | tr '[:lower:]' '[:upper:]')"
  token="$(eval "echo \"\${DOPBASE_TOKEN_$upper:-\${DOPBASE_TOKEN:-}}\"")"
  if [ -z "$token" ]; then
    dopbase_export "$service/$environment" "$dir/.env.$service"
    return
  fi
  (umask 077 && DOPBASE_TOKEN="$token" DOPBASE_DATA_DIR="$dir/dopbase" \
    dopbase export "$service/$environment" --stdout --format dotenv > "$dir/.env.$service")
}

# The monitor group may not exist for an environment; every other group is required.
for service in core ai bifrost vps monitor; do
  if ! export_service "$service"; then
    rm -f "$dir/.env.$service"
    [ "$service" = monitor ] || { echo "export of $service/$environment failed" >&2; exit 1; }
  fi
done
set -a
# shellcheck source=/dev/null
. "$dir/.env.vps"
# The product dashboards' read-only Supabase login (GRAFANA_PG_*) comes from the monitor group.
# shellcheck source=/dev/null
[ ! -f "$dir/.env.monitor" ] || . "$dir/.env.monitor"
set +a

cd "$root/deploy/ansible"
set -- -e "sl_environment=$environment" -e "sl_scope=$scope" -e "sl_env_dir=$dir" "$@"
[ "$scope" != app ] || set -- --tags app "$@"
if [ "$mode" = apply ]; then
  ansible-playbook site.yml "$@"
  exit
fi
mkdir -p "$root/out"
# tee hides ansible-playbook's exit code from the pipeline, so it travels through a file.
{ code=0; ANSIBLE_NOCOLOR=1 ansible-playbook site.yml --check --diff "$@" || code=$?; echo "$code" > "$dir/exit-code"; } 2>&1 \
  | tee "$root/out/infra-plan-$environment.txt"
exit "$(cat "$dir/exit-code")"
