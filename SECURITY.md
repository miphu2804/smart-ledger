# Security policy

## Reporting a vulnerability

Report a suspected vulnerability privately through GitHub: open the repository's **Security** tab and choose **Report a vulnerability**. Do not open a public issue, pull request or discussion for it, because this repository is public.

Include the affected component (Core, AI, mobile, web, CI/CD or the VPS), the steps to reproduce, and the impact you expect. Do not access, change or delete data that is not yours while testing, and do not test against the production environment.

The project owner acknowledges the report and keeps the reporter informed until the fix is released.

## Supported versions

Only the code deployed from `main` (production) and `staging` receives security fixes.

## Scope

In scope: the code in this repository, its GitHub Actions workflows and the deployment configuration under `deploy/`.

Out of scope: third-party services the project uses (Supabase, Vercel, HoneyHive, model providers); report those to their vendors.
