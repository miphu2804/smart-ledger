# Core Documentation

Feature handoffs and operational verification guides for the Java Core service.

* [Admin dashboard: daily creation counts](admin-dashboard-growth.md) - Core handoff for the ADMIN daily creation API: verification steps and history.
* [AI chat quota — admission and recovery](ai-chat-quota.md) - Default-off Core chat quota admission, receipt-based debit/release, fenced restart recovery and coordinated rollout limits.
* [CORE-015 local verification evidence](zalo-auth.tdd.md) - Test-driven records and local verification evidence for Zalo web sign-in.
* [CORE-015: Zalo authentication handoff](zalo-auth-implementation-plan.md) - Implemented Zalo web sign-in boundaries, consumer handoff and dated verification evidence.
* [CORE-016 — Android Core integration and V18 rollout](zalo-android-preparation.md) - Core guide for Zalo Android sign-in: verification and staging activation after merge.
* [CORE-019: shared success quotas](user-rate-limits.md) - Core rollout for success quotas: V20 schema, activation and recovery.
* [Daily user activity — CORE-018](user-daily-activity.md) - Core guide for recording daily user activity: limits, retention, rollback and the DAU/MAU SQL.
* [Independent stock decreases — CORE-021](stock-adjustments.md) - Core handoff for stock decrease adjustments: scope and how to test.
* [Manual Zalo login against local Core](zalo-manual-login.md) - Opt-in local test kit for trying Zalo login against a local Core.
* [SePay fee payments — setup and verification](sepay-payments.md) - Default-off SePay payments and subscription fulfillment, HMAC/Test mode setup, read-only quota projections, reconciliation and rollback boundaries.
* [SmartLedger Core — verification and regression guide](verification.md) - Disposable-database checks, feature regression commands and migration evidence boundaries for Core.
