# Core documentation

Feature handoffs and operational verification guides for the Java Core service. The service [README](../README.md) remains the setup entry point; this index lists only direct documents.

* [Admin dashboard: daily creation counts](admin-dashboard-growth.md) - Core handoff for the ADMIN daily creation API: verification steps and history.
* [CORE-016 — Android Core integration and V18 rollout](zalo-android-preparation.md) - Core guide for Zalo Android sign-in: verification and staging activation after merge.
* [CORE-015: Zalo authentication handoff](zalo-auth-implementation-plan.md) - Implemented Zalo web sign-in boundaries, consumer handoff and dated verification evidence.
* [CORE-015 local verification evidence](zalo-auth.tdd.md) - Test-driven records and local verification evidence for Zalo web sign-in.
* [Manual Zalo login against local Core](zalo-manual-login.md) - Opt-in local test kit for trying Zalo login against a local Core.
* [SmartLedger Core — verification and regression guide](verification.md) - Disposable-database checks, feature regression commands and migration evidence boundaries for Core.
* [Independent stock decreases — CORE-021](stock-adjustments.md) - Core handoff for stock decrease adjustments: scope and how to test.
* [Daily user activity — CORE-018](user-daily-activity.md) - Core guide for recording daily user activity: limits, retention, rollback and the DAU/MAU SQL.
* [CORE-019: shared success quotas](user-rate-limits.md) - Core rollout for success quotas: V20 schema, activation and recovery.
