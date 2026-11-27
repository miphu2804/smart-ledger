# SmartLedger documentation

SmartLedger runs in production. These documents define scope and contracts; they do not certify that every checked-in capability is enabled, deployed or accepted. EXE201 MVP names a course delivery scope and acceptance milestone, not an undeployed prototype.

## How to read the docs

Use the [bundle index](../.okf/docs/index.md) for immediate documentation domains, then each domain's index or guide for its children.

| Task | Start here |
|---|---|
| Review SePay, subscription and quota design | [SePay BR/FR/AC](product/product-requirements.md#sepay-570--yêu-cầu-và-trạng-thái-triển-khai) and [subscription/quota requirements](product/product-requirements.md#subscription-và-quota-ai--thiết-kế-lượt-1) → [payment contract](contracts/api-contracts.md#9-sepay-fee-payments--570) / [quota contract](contracts/api-contracts.md#10-subscription-and-ai-quota) → [payment](architecture/sepay-payment-design.md) / [subscription design](architecture/subscription-quota-design.md) → [phase-two schema review](architecture/billing-schema-proposal.md); phase-three payment APIs and phase-four durable grants/subscription/quota reads are implemented with writer gates off; phase-five AI receipt/cancel/replay is implemented behind its own default-off gate; phase-six [Core admission/debit/recovery](../backend/core/docs/ai-chat-quota.md) is implemented on V21 with gates default-off; shared quota enforcement and integrated acceptance remain pending; [Core setup and Test mode](../backend/core/docs/sepay-payments.md) |
| Integrate billing and AI quota clients | [FE handoff](contracts/billing-ai-client-handoff.md) → canonical [payment](contracts/api-contracts.md#9-sepay-fee-payments--570) / [quota](contracts/api-contracts.md#10-subscription-and-ai-quota) contract; phase seven supplies local Core–AI HTTP tests and client state/retry guidance, with no FE implementation or shared activation |
| Understand product scope or acceptance | [Product requirements](../.okf/docs/product/index.md) |
| Understand implementation, data or decisions | [Architecture](../.okf/docs/architecture/index.md) |
| Build or call an endpoint | [API contracts](contracts/api-contracts.md) |
| Set up, test, deploy or operate | [Development and operations](../.okf/docs/development/index.md) |
| Work on mobile UI | [Design](../.okf/docs/design/index.md) |
| Prepare public screenshots | [Marketing captures](marketing/README.md) |

### Target versus implemented

- **Implemented** means present in code, with the evidence and limits in [technical design §1](architecture/technical-design.md#1-scope). [API contracts](contracts/api-contracts.md) owns endpoint status and consumer behavior.
- **Enabled** means runtime configuration permits a capability; **deployed** means a particular build reached an environment. Neither follows from an implementation or a default in source. Live configuration and deployment were not verified by this documentation cleanup.
- **Accepted** means the relevant `AC-*` passed on the integrated system. A local test, mock capture or deployment is not acceptance evidence.
- BRD, PRD and target diagrams describe intended scope, not a deployed-feature checklist. Preserve requirement IDs and historical decisions; a documentation cleanup cannot approve requirements or change their status.
- The EXE201 delivery goal is a working core demo, understandable UX and real feedback; see [course validation](product/mvp-demo-validation.md). Keep existing capabilities and safety controls; optional integrations are not demo prerequisites.

### Conventions

- Language follows the [repository language policy](../AGENTS.md#language): Vietnamese only for business and product documents in `docs/product/`, English for everything else, including every file and directory name. [The technical userflow guide](product/userflow/README.md) is English. Preserve exact Vietnamese UI copy, legal quotations and user-facing examples; identifiers stay unchanged.
- Human documents carry no frontmatter. Their metadata follows [Open Knowledge Format v0.2](https://github.com/GoogleCloudPlatform/open-knowledge-format/blob/main/SPEC.md) and lives in the `.okf/` bundle at the repository root, where `.okf/docs/product/business-requirements.md` describes `docs/product/business-requirements.md`. Edit the document, not its concept, except for the fields below.
- A concept requires `type` and keeps `title`, `description`, `owner` and `status`, a `resource` pointing to the document, and a plain `author: <GitHub login>` for the person who wrote it; keep that login when someone else edits the document later. `generated` is optional and normally omitted for hand-authored pages; if retained for provenance, use the standard actor notation (for example `human:<id>`). Git history records edits, so do not manufacture `generated.at` timestamps.
- After adding, renaming or retitling a document, run `python3 scripts/docs/okf_sync.py`: it sets each `title` from the document's first heading, creates a stub concept for a new document and regenerates the indexes. Replace the `description: TODO` of a new stub, then run `python3 scripts/docs/okf_sync.py --check` before pushing; CI runs the same check, which also reports frontmatter in a human document and broken relative links.
- Keep existing freshness evidence (`stale_after`) unless facts have been checked; refresh it only after a factual review, not a formatting, translation or navigation change. New living guides may use a review date 60 days after a factual audit, in Vietnam time (`+07:00`). ADRs preserve decision dates and need no expiry.
- The `index.md` files in `.okf/` are generated, have no frontmatter except `okf_version: "0.2"` at the bundle root, and list `* [Title](relative/path) - description`; do not edit them by hand. Human navigation is this README and the section READMEs.
- A README explains purpose, ownership and how to use a section; an index is a short local navigation list. Service READMEs remain independently useful for setup and tests, linking deeper verification and rollout material rather than repeating it.
- These conventions also apply to maintained service guides and operational docs outside `docs/`, whose concepts mirror their path under `.okf/`, except that a `README.md` outside `docs/` has no concept and carries no frontmatter: GitHub shows it as the folder's front page, and its first heading and paragraph serve as title and description; find them from the relevant service or [development entry point](../.okf/docs/development/index.md), not a second global catalog. Agent policies, progress/blocker logs and PR templates have their own formats.
- Requirement IDs are stable and never reused: `BO-*`, `BR-*`, `FR-*`, `NFR-*`, `AC-*`, `OQ-*`; invoice items use `-INV-`. Keep `BO/BR → FR/NFR → AC` traceability.
- [PROGRESS](../PROGRESS.md) is a newest-first log (at most 200 lines); [BLOCKERS](../BLOCKERS.md) records unresolved dependencies and clearly labelled resolved history. Neither defines scope.

## Document map

Documentation follows business capabilities and accountable owners, not a mechanical mirror of code packages. Core is predominantly layered Java with capability packages; AI groups Python capabilities; Mobile uses Expo Router, not Next.js. This taxonomy does not authorize a code reorganization.

Canonical contracts and implementation evidence stay in `docs/`. Core and AI setup, service-specific tests and rollout runbooks stay beside their services; deployment and cross-service operations stay in `docs/development/`. [Local development](development/local-development.md) links the service guides, [CI/CD](development/ci-cd.md) owns delivery behavior, and [Secrets and env files](development/secrets-and-env.md) owns credential handling. The [AI service guide](../backend/ai/README.md) separates the architecture overview from its detailed runtime reference; do not copy configuration tables or trace schemas into overview pages.

Environment/domain mappings, infrastructure topology, credential inventories and access/rotation procedures belong to the private operations knowledge base, not repository docs or diagram metadata. Keep local setup, logical boundaries and privacy safeguards here; do not remove redaction or external-data-exposure warnings to make a document appear safer.

## Which document to update

| Change | Canonical owner |
|---|---|
| Business scope or rule | [BRD](product/business-requirements.md), then the PRD rows it hands off to |
| Product behavior | [PRD](product/product-requirements.md) and its acceptance criteria |
| Endpoint, request or response | [API contracts](contracts/api-contracts.md), including endpoint status |
| Database schema | [ERD description](architecture/erd-description.md) and [`erd.dbml`](architecture/diagrams/src/erd.dbml) |
| Implementation status | [Technical design §1](architecture/technical-design.md#1-scope); link endpoint semantics to the contract |
| Architectural decision | An ADR in [architecture decisions](../.okf/docs/architecture/adr/index.md) |
| Service commands, configuration, tests or feature rollout | Affected service README and its linked service-owned guide; link, do not duplicate |
| Compose, migrations, release or cross-service setup | [Local development](development/local-development.md) and [CI/CD](development/ci-cd.md) |

Update the owning document and affected local navigation in the same PR as a code change. Check claims against the exact `staging` revision, even when metadata appears fresh; expired metadata is a review trigger, not proof of incorrect content. When a document and code disagree, fix the document or route a behavior/scope decision through the product requirements; do not silently change the contract.

Repository contribution and release policy is in [CONTRIBUTING](../CONTRIBUTING.md). Root and scoped agent-instruction loading is defined in [AGENTS](../AGENTS.md).
