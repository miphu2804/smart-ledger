#!/bin/sh
# Checks deploy/ansible without a host or secrets: the syntax of both scopes and ansible-lint. Needs only uv, which
# fetches the pinned ansible-core and ansible-lint; the collections go to a temporary directory, not ~/.ansible.
# Shell scripts and workflows are linted by the shellcheck job of ci.yml, provider coupling by check-provider-coupling.sh.
#   scripts/infra/lint.sh
set -eu
cd "$(dirname "$0")/../../deploy/ansible"
collections="$(mktemp -d)"
trap 'rm -rf "$collections"' EXIT INT TERM
export ANSIBLE_COLLECTIONS_PATH="$collections"
# The inventory reads these; any value parses.
export SMARTLEDGER_VPS_HOST=203.0.113.1 SMARTLEDGER_VPS_USER=root

core="ansible-core==2.21.5"
uvx --from "$core" ansible-galaxy collection install -r requirements.yml
uvx --from "$core" ansible-playbook --syntax-check site.yml -e sl_environment=production -e sl_scope=all -e sl_env_dir=/tmp/env
uvx --from "$core" ansible-playbook --syntax-check site.yml -e sl_environment=staging -e sl_scope=app -e sl_env_dir=/tmp/env
uvx --from ansible-lint==26.10.1 --with "$core" ansible-lint .
