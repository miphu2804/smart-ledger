#!/usr/bin/env bash
# Writes the SSH config (SSH_CONFIG) and pinned known hosts for the VPS and starts a job-local ssh-agent holding the
# deploy key; sets SSH_AUTH_SOCK and SSH_AGENT_PID for the later steps. Reads VPS_HOST, VPS_SSH_KEY (base64 on one line,
# so it fits a one-line Dopbase value) and VPS_KNOWN_HOSTS, loaded from Dopbase vps/<environment> by load-dopbase.sh;
# VPS_USER defaults to deploy. The private key lives only in
# the agent; the known hosts pin the VPS host key, so a spoofed server is refused instead of trusted on first use.
set -euo pipefail
. "$(dirname "$0")/lib.sh"

: "${SSH_CONFIG:?run isolate-deploy-config.sh first}"
ssh_dir="$(dirname "$SSH_CONFIG")"
mkdir -p "$ssh_dir" && chmod 700 "$ssh_dir"
printf '%s\n' "$VPS_KNOWN_HOSTS" > "$ssh_dir/known_hosts"
cat > "$SSH_CONFIG" << EOF
Host vps
  HostName $VPS_HOST
  User ${VPS_USER:-deploy}
  UserKnownHostsFile $ssh_dir/known_hosts
  StrictHostKeyChecking yes
  BatchMode yes
EOF
eval "$(ssh-agent -s)" > /dev/null
printf '%s' "$VPS_SSH_KEY" | base64 -d | ssh-add -
ci_env SSH_AUTH_SOCK "$SSH_AUTH_SOCK"
ci_env SSH_AGENT_PID "$SSH_AGENT_PID"
