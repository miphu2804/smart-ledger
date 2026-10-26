#!/bin/sh
# Refuses a commit that would put a decrypted secret into git or point DVC at one.
staged=$(git diff --cached --name-only --diff-filter=AM -- secrets/)

if printf '%s\n' "$staged" | grep -Eq '\.env$'; then
  echo "pre-commit: decrypted secret staged in secrets/; encrypt it with age first" >&2
  exit 1
fi

for pointer in $(printf '%s\n' "$staged" | grep -E '\.dvc$'); do
  if ! grep -Eq 'path: [^ ]+\.env\.age$' "$pointer"; then
    echo "pre-commit: $pointer must track an .env.age file" >&2
    exit 1
  fi
done
