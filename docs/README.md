---
type: Guide
title: "SmartLedger documentation"
description: "Reading paths by task, source-of-truth rules and which document to update for each kind of change."
owner: Technical owner
author: miphu2804
status: stable
stale_after: 2027-01-05T22:20:06+07:00
---
# SmartLedger documentation

SmartLedger runs in production. These documents define scope and contracts; they do not certify that every checked-in capability is enabled, deployed or accepted. EXE201 MVP names a course delivery scope and acceptance milestone, not an undeployed prototype.

## How to read the docs

Use the [bundle index](index.md) for immediate documentation domains, then each domain's local index or guide for its children.

| Task | Start here |
|---|---|
| Understand product scope or acceptance | [Product requirements](product/index.md) |
| Understand implementation, data or decisions | [Architecture](architecture/index.md) |
| Build or call an endpoint | [API contracts](contracts/api-contracts.md) |
| Set up, test, deploy or operate | [Development and operations](development/index.md) |
| Work on mobile UI | [Design](design/index.md) |
| Prepare public screenshots | [Marketing captures](marketing/README.md) |

### Target versus implemented

- **Implemented** means present in code, with the evidence and limits in [technical design §1](architecture/technical-design.md#1-scope). [API contracts](contracts/api-contracts.md) owns endpoint status and consumer behavior.
- **Enabled** means runtime configuration permits a capability; **deployed** means a particular build reached an environment. Neither follows from an implementation or a default in source. Live configuration and deployment were not verified by this documentation cleanup.
- **Accepted** means the relevant `AC-*` passed on the integrated system. A local test, mock capture or deployment is not acceptance evidence.
- BRD, PRD and target diagrams describe intended scope, not a deployed-feature checklist. Preserve requirement IDs and historical decisions; a documentation cleanup cannot approve requirements or change their status.
- The EXE201 delivery goal is a working core demo, understandable UX and real feedback; see [course validation](product/mvp-demo-validation.md). Keep existing capabilities and safety controls; optional integrations are not demo prerequisites.

### Conventions

- English is the default for engineering documentation, READMEs, indexes, architecture, ADRs, contracts, operations, agent instructions and code comments. Vietnamese is reserved for business/product requirements, scope, acceptance and related product decisions/audits. Apply this by purpose, not directory: [the technical userflow guide](product/userflow/README.md) is English. Preserve exact Vietnamese UI copy, legal quotations and user-facing examples; identifiers stay unchanged.
- Use [Open Knowledge Format v0.2](https://github.com/GoogleCloudPlatform/open-knowledge-format/blob/main/SPEC.md). Only `type` is required for concept frontmatter by OKF; our maintained guides also keep useful `title`, `description`, `owner` and `status`. Use a plain `author: <GitHub login>` for the person who wrote the document; keep that login when someone else edits it later. Git history records the last editor, and `owner` names the accountable role, so neither replaces `author`. Do not rewrite untouched documents just to normalize metadata or erase genuine machine provenance.
- `generated` is optional and normally omitted for hand-authored pages. If retained for provenance, use the standard actor notation (for example `human:<id>`), not an unprefixed person's name. Git history records edits; do not manufacture `generated.at` timestamps.
- Keep existing freshness evidence unless facts have been checked. Refresh `stale_after` only after a factual review, not a formatting, translation or navigation change; record the source revision and verification boundary in the text where useful. New living guides may use a review date 60 days after a factual audit, in Vietnam time (`+07:00`). ADRs preserve decision dates and need no expiry.
- `index.md` is optional under OKF and has no frontmatter, except optional `okf_version: "0.2"` at the bundle root. Keep useful local indexes: list immediate documents and immediate subdirectory entry points only, as `* [Title](relative/path) - description`; match a document's frontmatter title and description. Do not recursively catalog all repository leaves. A tiny section need not gain an index solely for ceremony.
- A README explains purpose, ownership and how to use a section; an index is a short local navigation list. Service READMEs remain independently useful for setup and tests, linking deeper verification and rollout material rather than repeating it.
- These conventions also apply to maintained service guides and operational docs outside `docs/`; find them from the relevant service or [development entry point](development/index.md), not a second global catalog. Agent policies, progress/blocker logs and PR templates have their own formats.
- Requirement IDs are stable and never reused: `BO-*`, `BR-*`, `FR-*`, `NFR-*`, `AC-*`, `OQ-*`; invoice items use `-INV-`. Keep `BO/BR → FR/NFR → AC` traceability.
- [PROGRESS](../PROGRESS.md) is a newest-first log (at most 200 lines); [BLOCKERS](../BLOCKERS.md) records unresolved dependencies and clearly labelled resolved history. Neither defines scope.

## Document map

Documentation follows business capabilities and accountable owners, not a mechanical mirror of code packages. Core is predominantly layered Java with capability packages; AI groups Python capabilities; Mobile uses Expo Router, not Next.js. This taxonomy does not authorize a code reorganization.

Canonical contracts and implementation evidence stay in `docs/`. Core and AI setup, service-specific tests and rollout runbooks stay beside their services; deployment and cross-service operations stay in `docs/development/`. [Local development](development/local-development.md) links the service guides, [CI/CD](development/ci-cd.md) owns delivery behavior, and [Secrets and env files](development/secrets-and-env.md) owns credential handling. The [AI service guide](../backend/ai/README.md) separates the architecture overview from its detailed runtime reference; do not copy configuration tables or trace schemas into overview pages.

Environment/domain mappings, infrastructure topology, credential inventories and access/rotation procedures belong to the [private operations knowledge base](https://app.notion.com/p/M-i-tr-ng-v-domain-407f1ce5c3ac80249cd0c2a28c259436), not repository docs or diagram metadata. Keep local setup, logical boundaries and privacy safeguards here; do not remove redaction or external-data-exposure warnings to make a document appear safer.

## Which document to update

| Change | Canonical owner |
|---|---|
| Business scope or rule | [BRD](product/business-requirements.md), then the PRD rows it hands off to |
| Product behavior | [PRD](product/product-requirements.md) and its acceptance criteria |
| Endpoint, request or response | [API contracts](contracts/api-contracts.md), including endpoint status |
| Database schema | [ERD description](architecture/erd-description.md) and [`erd.dbml`](architecture/diagrams/src/erd.dbml) |
| Implementation status | [Technical design §1](architecture/technical-design.md#1-scope); link endpoint semantics to the contract |
| Architectural decision | An ADR in [architecture decisions](architecture/adr/index.md) |
| Service commands, configuration, tests or feature rollout | Affected service README and its linked service-owned guide; link, do not duplicate |
| Compose, migrations, release or cross-service setup | [Local development](development/local-development.md) and [CI/CD](development/ci-cd.md) |

Update the owning document and affected local navigation in the same PR as a code change. Check claims against the exact `staging` revision, even when metadata appears fresh; expired metadata is a review trigger, not proof of incorrect content. When a document and code disagree, fix the document or route a behavior/scope decision through the product requirements; do not silently change the contract.

Repository contribution and release policy is in [CONTRIBUTING](../CONTRIBUTING.md). Root and scoped agent-instruction loading is defined in [AGENTS](../AGENTS.md).
