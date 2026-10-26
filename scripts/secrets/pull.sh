#!/bin/sh
# Pulls the encrypted env files this checkout points at and decrypts them into secrets/<environment>/env/.
# An environment with no R2 token on this machine (for example production on a dev laptop) is skipped,
# and so is one whose env/ holds edits not pushed yet, because rebuilding env/ would erase them.
KEY="${SMARTLEDGER_AGE_KEY:-$HOME/.config/smartledger/age.key}"
cd "$(git rev-parse --show-toplevel)" || exit 0
. scripts/secrets/lib.sh

main() {
  for pointer in secrets/*/env.age.dvc; do
    [ -f "$pointer" ] || continue
    environment="$(dirname "$pointer")"
    if has_unpushed_edits "$environment"; then
      echo "secrets: skipped $environment; env/ has edits not pushed yet (run push.sh, or delete env/ to discard them)" >&2
      continue
    fi
    matches_pointer "$environment" && continue
    # No token for this bucket is the normal case for production on a dev laptop, so it is skipped quietly;
    # any other dvc failure (network, wrong token, missing object) is printed as dvc reports it.
    remote="r2-$(basename "$environment")"
    if [ -z "$(dvc config --local "remote.$remote.access_key_id" 2>/dev/null)" ]; then
      echo "secrets: skipped $environment (no $remote token in .dvc/config.local)" >&2
      continue
    fi
    # -f replaces a leftover env.age/ from an interrupted run instead of stopping on it.
    # dvc -q would hide its errors too, so its output is kept and shown only when it fails.
    if ! output="$(dvc pull -f -r "$remote" "$pointer" 2>&1)"; then
      echo "$output" >&2
      echo "secrets: skipped $environment; dvc pull failed" >&2
      continue
    fi
    decrypt "$environment"
  done
}

# Decrypts into env.tmp/ and swaps it in only when every file decrypts, so a key missing from
# recipients.txt leaves the old env/ in place instead of an empty one.
decrypt() {
  rm -rf "$1/env.tmp"
  (umask 077 && mkdir "$1/env.tmp")
  # env.age/ mirrors env/: files at the top and one level of folders, such as github/.
  for encrypted in "$1"/env.age/.env.*.age "$1"/env.age/*/.env.*.age; do
    [ -f "$encrypted" ] || continue
    plain="$1/env.tmp/${encrypted#"$1"/env.age/}"
    plain="${plain%.age}"
    if ! (umask 077 && mkdir -p "$(dirname "$plain")" && age -d -i "$KEY" -o "$plain" "$encrypted"); then
      echo "secrets: $KEY cannot decrypt $encrypted; kept $1/env as it was" >&2
      rm -rf "$1/env.tmp"
      return 1
    fi
  done
  # Rebuilding env/ makes a file deleted upstream disappear here too.
  rm -rf "$1/env" && mv "$1/env.tmp" "$1/env"
  record_state "$1"
}

main
