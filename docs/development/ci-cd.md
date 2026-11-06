---
type: Runbook
title: "CI/CD"
description: "Repository delivery workflows, validation gates and links to private operational procedures."
owner: Technical owner
status: stable
author: miphu2804
stale_after: 2027-01-05T22:18:48+07:00
---
# CI/CD

This guide explains repository-controlled delivery behavior. Environment addresses, domains, infrastructure topology, credential inventories and deployment access procedures belong to the [private operations knowledge base](https://app.notion.com/p/M-i-tr-ng-v-domain-407f1ce5c3ac80249cd0c2a28c259436), not this repository.

Branch and review rules are in [CONTRIBUTING](../../CONTRIBUTING.md). Workflow definitions are implementation evidence, not proof of a successful deployment or product acceptance.

## Workflows

| Workflow | Responsibility |
|---|---|
| [`ci.yml`](../../.github/workflows/ci.yml) | Selects changed areas, runs checks and invokes delivery after an eligible branch push |
| [`cd.yml`](../../.github/workflows/cd.yml) | Rechecks the commit and CI result, invokes service delivery and runs the configured staging smoke gate |
| [`deploy-backend.yml`](../../.github/workflows/deploy-backend.yml) | Builds and delivers backend artifacts |
| [`deploy-web.yml`](../../.github/workflows/deploy-web.yml) | Builds and delivers the Mobile web application |
| [`deploy-landing.yml`](../../.github/workflows/deploy-landing.yml) | Builds and delivers the web application |
| [`mobile-release.yml`](../../.github/workflows/mobile-release.yml) | Manually triggered Android build and optional publication |
| [`infra.yml`](../../.github/workflows/infra.yml) | Validates and applies infrastructure through the authorized operations workflow |
| [`eval-regression.yml`](../../.github/workflows/eval-regression.yml) | Runs the explicitly requested Agent evaluation and reports its result |
| [`honeyhive-sync.yml`](../../.github/workflows/honeyhive-sync.yml), [`honeyhive-dashboards.yml`](../../.github/workflows/honeyhive-dashboards.yml) | Apply matching observability configuration changes on eligible pushes or manual dispatch |
| [`release-policy.yml`](../../.github/workflows/release-policy.yml) | Checks the permitted production release source |

## Steps

1. Submit the change to `staging` through a pull request and required review.
2. Inspect the checks for the exact commit; a skipped area check does not mean its tests ran.
3. For a delivery, use the workflow result and resulting artifact/build identity as evidence.
4. Record [Bruno smoke-check](../../scripts/bruno/README.md) and UAT results separately; a deployment does not establish `AC-*` acceptance.
5. Use the private operations knowledge base for environment access, migration windows, rollout and recovery. Production approval is not bypassed by these instructions.

## Path filtering

Area checks are selected by paths in the workflows. Read the definitions when changing dependencies or shared files; do not infer coverage from the PR's overall green status. The required-check policy is in [CONTRIBUTING](../../CONTRIBUTING.md#required-checks-and-deployment).

## Service variables

Code defaults and required variable names belong to each service's `.env.example` and service guide. Actual environment values, domain/origin allowlists, credential ownership and access grants are maintained only in the private operations knowledge base and the authorized secret store. Public-prefixed frontend variables are shipped in the application and must never contain secrets.

## Monitoring

Monitoring definitions exist in the repository; their existence does not verify live provisioning, alert delivery or access controls. The private operations knowledge base owns endpoints, topology, retention/access configuration and incident procedures. AI data exposure and redaction limits remain documented in the [AI architecture](../../backend/ai/docs/architecture.md#observability).

## Mobile web on Vercel

The delivery workflow builds environment-specific frontend artifacts. Public-prefixed values are build-time configuration, so changing them requires a new build. PR preview deployment is disabled; current workflow triggers, not historical preview instructions, define behavior. Deployment domains and authentication origin mappings are private operational information.

## Android build

Use the manually triggered Android workflow for a configured build. Local development and native verification are in the [Mobile guide](../../frontend/mobile/README.md) and [operations guide](../../frontend/mobile/docs/operations.md). A successful build does not verify sign-in, recognition or install/update behavior on a device.

### Release signing

Signing keys, backups, certificate-to-environment mappings and publication credentials are managed through the private operations knowledge base. Never commit a keystore or its encoded contents, include secret values in shell arguments, or print them in logs. Verify the intended build identity and signing certificate before an authorized release.

### Publish the APK for the landing page

Publication is a separate, explicit workflow option. Follow the private operations procedure for access, destination, validation and rollback; a merged pull request does not itself prove that a signed APK was published or accepted.

## Eval regression

The [evaluation guide](../../backend/ai/evaluation/README.md) owns suites, commands and interpretation. Live model calls and external evaluation publication require intentional authorization and configured credentials; do not infer product acceptance from a mock or offline result.
