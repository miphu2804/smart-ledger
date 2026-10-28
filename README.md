# SmartLedger

**AI voice POS for small shops (So Nghe Loi).** Say one sentence and the AI records the items, quantities, and prices.

<p>
  <img alt="Java 21" src="https://img.shields.io/badge/Java_21-ED8B00?logo=openjdk&logoColor=white">
  <img alt="Spring Boot" src="https://img.shields.io/badge/Spring_Boot-6DB33F?logo=springboot&logoColor=white">
  <img alt="Python" src="https://img.shields.io/badge/Python-3776AB?logo=python&logoColor=white">
  <img alt="FastAPI" src="https://img.shields.io/badge/FastAPI-009688?logo=fastapi&logoColor=white">
  <img alt="Pydantic AI" src="https://img.shields.io/badge/Pydantic_AI-E92063?logo=pydantic&logoColor=white">
  <img alt="Expo" src="https://img.shields.io/badge/Expo-000020?logo=expo&logoColor=white">
  <img alt="React" src="https://img.shields.io/badge/React-61DAFB?logo=react&logoColor=black">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white">
  <img alt="Vite" src="https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white">
  <img alt="PostgreSQL" src="https://img.shields.io/badge/PostgreSQL-4169E1?logo=postgresql&logoColor=white">
  <img alt="Supabase" src="https://img.shields.io/badge/Supabase-3FCF8E?logo=supabase&logoColor=white">
  <img alt="Redis" src="https://img.shields.io/badge/Redis-FF4438?logo=redis&logoColor=white">
  <img alt="Firebase" src="https://img.shields.io/badge/Firebase_Auth-DD2C00?logo=firebase&logoColor=white">
  <img alt="Docker" src="https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=white">
  <img alt="Caddy" src="https://img.shields.io/badge/Caddy-1F88C0?logo=caddy&logoColor=white">
  <img alt="GitHub Actions" src="https://img.shields.io/badge/GitHub_Actions-2088FF?logo=githubactions&logoColor=white">
  <img alt="Ansible" src="https://img.shields.io/badge/Ansible-EE0000?logo=ansible&logoColor=white">
  <img alt="Vercel" src="https://img.shields.io/badge/Vercel-000000?logo=vercel&logoColor=white">
</p>

A shop owner speaks to the mobile app. Core, the Java API, authenticates the owner, owns the data, and passes each chat to an internal AI service that turns speech into ledger entries with typed, validated output. Product overview: [docs/product/project-overview.md](docs/product/project-overview.md).

## Highlights

- **Voice to ledger:** one spoken sentence becomes items, quantities, and prices.
- **Two services, one boundary:** Core is the only public API and the only database owner; AI is reachable only from Core, with a shared internal token.
- **Reviewed releases:** every push to `staging` deploys automatically; `main` deploys to production only after a reviewer approves each environment.
- **Reproducible hosting:** both backends ship as container images built in CI, pushed to GitHub Container Registry and started behind Caddy with HTTPS; the VPS is provisioned with Ansible.
- **Encrypted configuration:** environment files are versioned per environment, encrypted with age, and synced from a single command.

## System architecture

![SmartLedger system architecture](docs/architecture/diagrams/images/ci-cd.svg)

Green is the deploy pipeline, purple the one-time VPS setup, and orange the runtime request flow. Implementation status per component: [Technical design §1](docs/architecture/technical-design.md#1-phạm-vi). Design rationale: [ADRs](docs/architecture/adr/). Pipeline details: [CI/CD](docs/development/ci-cd.md).

| Part | Path | Runs on | Role |
|---|---|---|---|
| Core | [`backend/core`](backend/core/README.md) | VPS (Docker) | Java public API for the clients; owns the database |
| AI | [`backend/ai`](backend/ai/README.md) | VPS (Docker) | Python FastAPI internal API; only Core calls it |
| Mobile | [`frontend/mobile`](frontend/mobile/README.md) | Android build, web on Vercel | Expo app for the shop OWNER |
| Web | [`frontend/web`](frontend/web/README.md) | Vercel | Landing page and ADMIN dashboard |
| AI schema | [`supabase/`](supabase/) | Supabase | CLI migrations for the AI tables |

## Getting started

Setup, run and pre-PR checks per service: [Local development](docs/development/local-development.md). Branches, commits and pull requests: [CONTRIBUTING](CONTRIBUTING.md).

## Repository layout

```text
smart-ledger/
├── README.md
├── AGENTS.md            # instructions for coding agents
├── CLAUDE.md            # imports AGENTS.md
├── CONTRIBUTING.md      # branches, commits, pull requests, releases
├── PROGRESS.md          # recent progress log
├── BLOCKERS.md          # open blockers
├── compose.yaml         # Core + AI (Supabase + Redis Cloud)
├── .github/             # CI/CD workflows, PR templates, CI helper scripts
├── scripts/             # local database, secrets sync, Android and iOS release
├── secrets/             # encrypted env files per environment (DVC + age + R2)
├── tools/secrets-cli/   # `sl`, a menu over scripts/secrets
├── supabase/            # AI schema migrations (Supabase CLI)
├── docs/                # source of truth; start at docs/README.md
│   ├── product/         # product description, BRD, PRD
│   ├── architecture/    # technical design, ERD, ADRs, diagrams, service walkthrough
│   ├── contracts/       # HTTP/wire contracts
│   ├── design/          # mobile UI direction and wording
│   ├── development/     # local development, secrets, CI/CD, release runbooks
│   └── marketing/       # app screenshots per product flow
├── frontend/
│   ├── mobile/          # Expo app for the OWNER; mock data by default
│   └── web/             # landing page + ADMIN dashboard at /admin
└── backend/
    ├── core/            # Core public API (Java), DB owner
    └── ai/              # internal AI API (Python FastAPI)
```

## Documentation

Start at the [documentation index](docs/README.md): it maps every document and says which one owns each fact.
