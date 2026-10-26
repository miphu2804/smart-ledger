#!/bin/sh
# Encrypts secrets/<environment>/env/ for every key in recipients.txt and uploads it to that environment's R2 bucket.
# Commit the updated secrets/<environment>/env.age.dvc afterwards.
cd "$(git rev-parse --show-toplevel)" || exit 1
environment="secrets/${1:?usage: push.sh <environment>}"
[ -d "$environment/env" ] || { echo "secrets: $environment/env does not exist; run pull.sh first" >&2; exit 1; }

rm -rf "$environment/env.age"
mkdir "$environment/env.age"
# Files at the top of env/ and one level of folders, such as github/.
for plain in "$environment"/env/.env.* "$environment"/env/*/.env.*; do
  [ -f "$plain" ] || continue
  encrypted="$environment/env.age/${plain#"$environment"/env/}.age"
  mkdir -p "$(dirname "$encrypted")"
  age -R "$environment/recipients.txt" -o "$encrypted" "$plain" || exit 1
done
dvc add -q "$environment/env.age" && dvc push -q -r "r2-$1" "$environment/env.age.dvc" || exit 1
echo "secrets: pushed $environment; commit $environment/env.age.dvc"
