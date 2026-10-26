#!/bin/sh
# Refuses a commit that would put a decrypted or encrypted env file into git.
# In secrets/<environment>/ only recipients.txt, targets and the env.age.dvc pointer belong in git; DVC stores the ciphertext in R2.
staged=$(git diff --cached --name-only --diff-filter=AMR -- secrets/)

if printf '%s\n' "$staged" | grep -E '^secrets/[^/]+/' | grep -vEq '/(recipients\.txt|targets|env\.age\.dvc)$'; then
  echo "pre-commit: only recipients.txt, targets and env.age.dvc belong in git under secrets/<environment>/" >&2
  exit 1
fi

for pointer in $(printf '%s\n' "$staged" | grep -E '\.dvc$'); do
  if ! grep -Eq 'path: env\.age$' "$pointer"; then
    echo "pre-commit: $pointer must track env.age" >&2
    exit 1
  fi
done
