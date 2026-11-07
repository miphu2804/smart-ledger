# Credential map

Environment-specific credential inventories and connection maps belong to the private operations knowledge base. Generated staging/production snapshots are not published in this repository.

Code declarations and `.env.example` files document the settings a developer needs, not the live credential assignment. Do not regenerate or commit environment snapshots as part of a repository change; use the authorized private maintenance process instead. The maintenance script [`scripts/secrets/credential_map.py`](../../../scripts/secrets/credential_map.py) writes its pages to `~/.smartledger/credential-map/`, outside the repository, and `.gitignore` blocks HTML snapshots in this folder. No live credential values or private-knowledge-base contents were inspected by this documentation cleanup.
