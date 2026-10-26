#!/bin/sh
# Encrypts secrets/<environment>/env/ for every key in recipients.txt and uploads it to that environment's R2 bucket.
# Commit the updated secrets/<environment>/env.age.dvc afterwards.
cd "$(git rev-parse --show-toplevel)" || exit 1
. scripts/secrets/lib.sh
require_environment "$1" "push.sh <environment>"
environment="secrets/$1"
[ -d "$environment/env" ] || { echo "secrets: $environment/env does not exist; run pull.sh first" >&2; exit 1; }

# Both checks stop an upload from replacing a version this env/ was not built from.
# Secret changes reach staging first (see CONTRIBUTING.md), so origin/staging holds the newest pointer.
git fetch -q origin staging || exit 1
if [ -n "$(git log --oneline HEAD..origin/staging -- "$environment/env.age.dvc")" ]; then
  echo "secrets: origin/staging has a newer $environment/env.age.dvc; merge it and run pull.sh first" >&2
  exit 1
fi
if ! matches_pointer "$environment"; then
  echo "secrets: $environment/env was not pulled from the current env.age.dvc; save your edits, delete env/, run pull.sh and edit again" >&2
  exit 1
fi

rm -rf "$environment/env.age"
mkdir "$environment/env.age"
# Files at the top of env/ and one level of folders, such as github/.
for plain in "$environment"/env/.env.* "$environment"/env/*/.env.*; do
  [ -f "$plain" ] || continue
  encrypted="$environment/env.age/${plain#"$environment"/env/}.age"
  mkdir -p "$(dirname "$encrypted")"
  age -R "$environment/recipients.txt" -o "$encrypted" "$plain" || exit 1
done
# dvc add rewrites the pointer before the upload; if the upload fails, the old pointer is put back
# so env/ still matches it and running push.sh again is allowed.
saved="$(mktemp)"
cp "$environment/env.age.dvc" "$saved"
if ! { dvc add -q "$environment/env.age" && dvc push -q -r "r2-$1" "$environment/env.age.dvc"; }; then
  cp "$saved" "$environment/env.age.dvc" && git add "$environment/env.age.dvc"
  rm -f "$saved"
  echo "secrets: upload failed; $environment/env.age.dvc is unchanged, run push.sh again" >&2
  exit 1
fi
rm -f "$saved"
record_state "$environment"
echo "secrets: pushed $environment; commit $environment/env.age.dvc"
