## Summary

<!-- Release scope: N commits since the last release. Numbered list, one point per line when there are several. -->

1. 

## Changes

<!-- One row per commit in `git log --no-merges --format='%s' origin/main..origin/staging`, grouped by area. -->

| Area | Change | PR |
|---|---|---|
| core | | |
| ai | | |
| mobile | | |
| web | | |
| ci / deploy | | |
| docs | | |
| cross-area | | |

## Breaking changes

None.

## Config and migrations

<!-- New environment variables, secrets, or migrations; run migrations on staging first. -->

None.

## Validation

| Check | Command / steps | Status | Result |
|---|---|---|---|
| Required CI checks on `staging` | | | |
| Anything not checked | | Not verified | |

## Deploy

| Step | Done by | Notes |
|---|---|---|
| Merge with a merge commit (no squash) | | |
| Approve `deploy` and `deploy-web` in Review deployments | | |
| Production web smoke test passes | | |
| Dispatch `mobile-release.yml` with `android-production` (only if an APK must ship) | | |
| Tag the release | | |

<!-- Details: docs/development/ci-cd.md#steps -->

## Risks and rollback

| Risk | Impact | Rollback |
|---|---|---|
| | | |
