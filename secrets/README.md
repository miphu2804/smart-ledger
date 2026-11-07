# secrets

This directory contains tracked templates and local helper inputs, not a publishable environment inventory. Environment addresses, domains, credential ownership and access instructions belong to the private operations knowledge base.

## Local use

Without team access, start from each service's `.env.example` and the [local development guide](../docs/development/local-development.md). With authorized access, follow the private procedure before running these repository helpers:

```bash
scripts/secrets/dopbase-sync.sh pull dev
scripts/secrets/apply.sh dev dev
scripts/secrets/apply.sh dev dev --apply
```

The first command retrieves the authorized development source. The second previews changed keys without values; the third writes local files and keeps backups. The development source uses local database settings. Selecting staging is a deliberate shared-environment action, not the default local setup.

## Safety

Exports, generated `.env` files and `.bak` copies contain plaintext secrets. Keep them and signing keys out of Git, restrict filesystem access, and never include their values in command-line arguments or logs.

Change shared values only through the approved secret-management process. Keep tracked templates and code declarations aligned, but publish no environment-specific credential map here. See [secret handling](../docs/development/secrets-and-env.md).
