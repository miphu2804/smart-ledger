#!/bin/sh
# Pulls the encrypted env files this checkout points at and decrypts them into secrets/<environment>/env/.
# An environment whose bucket this machine cannot read (for example production on a dev laptop) is skipped.
KEY="${SMARTLEDGER_AGE_KEY:-$HOME/.config/smartledger/age.key}"
cd "$(git rev-parse --show-toplevel)" || exit 0

for pointer in secrets/*/env.age.dvc; do
  [ -f "$pointer" ] || continue
  environment="$(dirname "$pointer")"
  dvc pull -q "$pointer" 2>/dev/null || { echo "secrets: skipped $environment (no access)" >&2; continue; }
  # Rebuild env/ so a file deleted upstream disappears here too.
  rm -rf "$environment/env"
  (umask 077 && mkdir "$environment/env")
  for encrypted in "$environment"/env.age/.env.*.age; do
    plain="$environment/env/$(basename "$encrypted" .age)"
    (umask 077 && age -d -i "$KEY" -o "$plain" "$encrypted") \
      || echo "secrets: $KEY cannot decrypt $encrypted" >&2
  done
done
