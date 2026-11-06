---
type: Guide
title: "Diagram guide"
description: "How logical architecture diagrams are scoped, edited and checked without publishing private deployment details."
owner: Technical owner
status: stable
author: miphu2804
stale_after: 2027-01-05T22:18:48+07:00
---
# Diagram guide

Repository diagrams explain logical responsibilities, data relationships and code paths. Environment/domain mappings, deployment topology, infrastructure access and credential-flow diagrams belong to the [private operations knowledge base](https://app.notion.com/p/M-i-tr-ng-v-domain-407f1ce5c3ac80249cd0c2a28c259436); their source files and exports are not published here.

## Reading scope

| Artifact | Meaning and boundary |
|---|---|
| [Logical architecture](src/architecture.mmd) | Current component responsibilities, not network placement or deployment evidence |
| [ERD source](src/erd.dbml) | Checked-in Core/AI table structure; SQL migrations own checks, policies, triggers and partial indexes |
| [ERD layout](src/erd.dbdiagram) | Editor positions only, not a schema definition |
| [Service walkthrough](../service-walkthrough/README.md) | Source-reading and transaction diagrams with their own verification boundaries |
| [Memory decision diagram](src/agent-memory.drawio) | Supporting artifact for ADR-0002; the ADR's proposal/status remains authoritative |

The [technical design](../technical-design.md#1-scope) records source-level implementation; the [ERD description](../erd-description.md) records migration alignment. Neither a diagram nor a checked-in migration proves live deployment, runtime enablement or integrated acceptance.

## Editing

- Keep labels in English and show ownership, trust boundaries and data direction rather than environment addresses or internal hosts.
- Edit the source, not only an exported image. Keep source and export consistent when an export is maintained.
- Use the repository's draw.io skill for editable draw.io changes; Mermaid remains appropriate for simple text diagrams.
- Validate node/edge references, render the affected artifact when tooling is available, and inspect readability. Do not claim visual verification from a successful source edit alone.
- Do not embed credentials, certificate-to-environment mappings or private network identifiers in diagram metadata or compressed exports.

Product mock screenshots and design references have their own scope in [marketing](../../marketing/README.md) and [design](../../design/index.md). They are not provider, device or acceptance evidence.
