# Architecture

Technical design, data model, decisions, diagrams and service walkthroughs.

* [AI statecharts](statecharts/README.md) - TLC-checked Core quota, AI chat, durable-turn receipt/cancellation and memory models, with diagrams and separate runtime verification boundaries.
* [Architecture decisions](adr/index.md) - Architecture decision records, one decision per file.
* [Billing and AI quota — phase-two schema](billing-schema-proposal.md) - Owner-approved V21 billing/quota and AI receipt storage, scoped constraints and default-off payment, grant, receipt and Core quota/recovery writers.
* [Diagram guide](diagrams/README.md) - How logical architecture diagrams are scoped, edited and checked without publishing private deployment details.
* [SePay fee-payment design — issue #570](sepay-payment-design.md) - Default-off Core SePay payment APIs, immutable receipt transactions and schema/rollout boundaries; provider and subscription activation remain unverified.
* [Service walkthrough](service-walkthrough/README.md) - Reading notes with diagrams of Core and AI service flows; explains code, does not decide behavior.
* [SmartLedger — ERD Description](erd-description.md) - Database entities, relationships, data flows and migration alignment, paired with `diagrams/src/erd.dbml`.
* [Subscription and AI quota — phase-one design](subscription-quota-design.md) - OWNER calendar-month subscriptions, shared quota policy and default-off Core–AI admission, receipts, debit and recovery, separate from integrated acceptance.
* [Technical design — SmartLedger](technical-design.md) - Implementation status (§1), components, data, main flows and verification.
