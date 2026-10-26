#!/bin/sh
# Pulls the encrypted secrets this checkout points at and decrypts the ones this machine's age key can open.
# A .dvc file whose bucket this machine cannot read (for example production on a dev laptop) is skipped.
KEY="${SMARTLEDGER_AGE_KEY:-$HOME/.config/smartledger/age.key}"
cd "$(git rev-parse --show-toplevel)" || exit 0

for pointer in secrets/*.env.age.dvc; do
  [ -f "$pointer" ] || continue
  encrypted="${pointer%.dvc}"
  plain="${encrypted%.age}"
  dvc pull -q "$pointer" 2>/dev/null || { echo "secrets: skipped $encrypted (no access)" >&2; continue; }
  (umask 077 && age -d -i "$KEY" -o "$plain" "$encrypted") \
    || echo "secrets: $KEY cannot decrypt $encrypted" >&2
done
