#!/bin/sh
# Refuses a commit that would put a bundle into git or point DVC at anything but an encrypted bundle.
# In secrets/<environment>/ only recipients.txt and the .env.age.dvc pointer belong in git; DVC stores the ciphertext in R2.
staged=$(git diff --cached --name-only --diff-filter=AMR -- secrets/)

if printf '%s\n' "$staged" | grep -E '^secrets/[^/]+/\.env' | grep -vEq '/\.env\.age\.dvc$'; then
  echo "pre-commit: bundle staged in secrets/; only <environment>/.env.age.dvc pointers belong in git" >&2
  exit 1
fi

for pointer in $(printf '%s\n' "$staged" | grep -E '\.dvc$'); do
  if ! grep -Eq 'path: \.env\.age$' "$pointer"; then
    echo "pre-commit: $pointer must track .env.age" >&2
    exit 1
  fi
done
