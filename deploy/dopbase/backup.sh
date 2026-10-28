#!/bin/sh
# Off-site copy of the dopbase_data volume, which holds Dopbase's SQLite database and its master key and is
# otherwise the only copy of every team secret. Runs on the VPS from cron (deploy/ansible/playbook.yml), as the
# deploy user, from /opt/dopbase. Reads its settings from /opt/dopbase/.env.backup, written by the playbook.
#
# Dopbase is stopped for the few seconds of the copy: SQLite keeps a write-ahead log, so a tar of a running
# database can catch a torn write, and stopping is the only snapshot that needs no knowledge of its file names.
# The archive is encrypted for DOPBASE_BACKUP_RECIPIENT before it leaves the machine, so the bucket holds
# nothing readable and the private key never sits next to the backups. Old archives are removed by a lifecycle
# rule on the bucket, not from here, so this script needs no delete permission.
set -eu
cd "$(dirname "$0")"

# shellcheck disable=SC1091 # written on the VPS by the playbook, not in the repository.
. ./.env.backup
: "${DOPBASE_BACKUP_BUCKET:?.env.backup must set DOPBASE_BACKUP_BUCKET}"
: "${DOPBASE_BACKUP_ENDPOINT:?.env.backup must set DOPBASE_BACKUP_ENDPOINT}"
: "${DOPBASE_BACKUP_RECIPIENT:?.env.backup must set DOPBASE_BACKUP_RECIPIENT}"
: "${DOPBASE_BACKUP_KEY_ID:?.env.backup must set DOPBASE_BACKUP_KEY_ID}"
: "${DOPBASE_BACKUP_SECRET:?.env.backup must set DOPBASE_BACKUP_SECRET}"

# rclone takes its whole remote from the environment, so the credentials never reach a config file on disk.
export RCLONE_CONFIG_R2_TYPE=s3
export RCLONE_CONFIG_R2_PROVIDER=Cloudflare
export RCLONE_CONFIG_R2_REGION=auto
export RCLONE_CONFIG_R2_ENDPOINT="$DOPBASE_BACKUP_ENDPOINT"
export RCLONE_CONFIG_R2_ACCESS_KEY_ID="$DOPBASE_BACKUP_KEY_ID"
export RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$DOPBASE_BACKUP_SECRET"

work="$(mktemp -d)"
# Dopbase comes back up even when the copy fails, and the plaintext archive lives only inside this directory.
trap 'docker compose start >/dev/null 2>&1 || true; rm -rf "$work"' EXIT

archive="dopbase-$(date -u +%Y-%m-%dT%H-%M-%SZ).tar.gz.age"
docker compose stop >/dev/null
# `docker run` silently creates an empty volume for a name that does not exist, so a wrong name here would
# upload a valid but empty backup.
docker volume inspect dopbase_data >/dev/null
docker run --rm -v dopbase_data:/data:ro -v "$work":/out alpine:3.21 \
  tar -czf /out/data.tar.gz -C /data .
docker compose start >/dev/null

# A readable archive holding the database is the only proof the copy worked; age would happily encrypt nothing.
tar -tzf "$work/data.tar.gz" >/dev/null
[ "$(stat -c %s "$work/data.tar.gz")" -ge 4096 ] || { echo "dopbase-backup: archive is too small to be the database" >&2; exit 1; }

age -r "$DOPBASE_BACKUP_RECIPIENT" -o "$work/$archive" "$work/data.tar.gz"
rclone copyto "$work/$archive" "r2:$DOPBASE_BACKUP_BUCKET/$archive"
echo "dopbase-backup: uploaded $archive ($(du -h "$work/$archive" | cut -f1))"
