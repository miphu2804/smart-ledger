#!/bin/sh
# Encrypts secrets/<environment>/env/ for every key in recipients.txt and uploads it to that environment's R2 bucket.
# Commit the updated secrets/<environment>/env.age.dvc afterwards.
cd "$(git rev-parse --show-toplevel)" || exit 1
environment="secrets/${1:?usage: push.sh <environment>}"
[ -d "$environment/env" ] || { echo "secrets: $environment/env does not exist; run pull.sh first" >&2; exit 1; }

rm -rf "$environment/env.age"
mkdir "$environment/env.age"
for plain in "$environment"/env/.env.*; do
  age -R "$environment/recipients.txt" -o "$environment/env.age/$(basename "$plain").age" "$plain" || exit 1
done
dvc add -q "$environment/env.age" && dvc push -q -r "r2-$1" "$environment/env.age.dvc" || exit 1
echo "secrets: pushed $environment; commit $environment/env.age.dvc"
