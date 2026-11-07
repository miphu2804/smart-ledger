---
type: Runbook
title: "Secrets and env files"
description: "Safe local secret handling and the boundary between repository configuration and private operations."
owner: Technical owner
status: stable
author: miphu2804
stale_after: 2027-01-02T14:52:23+07:00
---
# Secrets and env files

Environment/domain mappings, credential inventories, access grants and rotation/recovery procedures belong to the private operations knowledge base. Do not copy them into repository documentation or pull requests.

## Local development

Use each service's `.env.example` to identify required settings and the [local setup guide](local-development.md) to start dependencies. For authorized team values and the local helper commands, see [secrets](../../secrets/README.md).

The default development source uses a local database; staging values require deliberate selection and authorization. Generated exports, `.env` files and backups are plaintext files, not encrypted local storage. Keep them out of Git, restrict filesystem access and follow the private procedure for cleanup.

## Handling rules

- Never put a secret value in a command-line argument, committed example, screenshot, issue, PR description or log.
- Use the authorized secret-management UI or an approved non-logging input mechanism to change values.
- Frontend public-prefixed variables are bundled into the application and cannot hold secrets.
- A service token authenticates a service caller; it is not automatically a user or tenant authorization claim.
- Documentation removal does not erase Git history or revoke a credential. Suspected exposure requires the owner's incident and rotation process.
- Shared-environment changes require explicit authorization; local setup commands do not grant deployment or migration permission.

## Configuration changes

Keep code, templates and non-secret examples consistent when a setting changes. Actual environment inventories and credential maps stay in the private knowledge base; do not commit generated environment snapshots. The [credential-map boundary](credential-map/README.md) explains the repository policy.
