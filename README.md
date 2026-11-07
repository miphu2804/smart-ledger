# SmartLedger

SmartLedger (Sổ Nghe Lời) is a bookkeeping app for small shops in Vietnam. Shop owners record sales, payments, debts and expenses by voice or by tap, and ask Bobi, the AI assistant, about their business. It runs in production on Android and the web.

Voice orders use the platform speech-to-text and the rule-based `parseOrder()` parser, and the owner reviews each order before checkout. Bobi chat is served by the AI service through Core.

## Tech stack

| Layer | Stack |
|---|---|
| Core API | <img alt="Java 21" src="https://img.shields.io/badge/Java_21-ED8B00?logo=openjdk&logoColor=white"> <img alt="Spring Boot" src="https://img.shields.io/badge/Spring_Boot-6DB33F?logo=springboot&logoColor=white"> |
| AI service | <img alt="Python" src="https://img.shields.io/badge/Python-3776AB?logo=python&logoColor=white"> <img alt="FastAPI" src="https://img.shields.io/badge/FastAPI-009688?logo=fastapi&logoColor=white"> <img alt="Pydantic AI" src="https://img.shields.io/badge/Pydantic_AI-E92063?logo=pydantic&logoColor=white"> |
| Clients | <img alt="Expo" src="https://img.shields.io/badge/Expo-000020?logo=expo&logoColor=white"> <img alt="React" src="https://img.shields.io/badge/React-61DAFB?logo=react&logoColor=black"> <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white"> <img alt="Vite" src="https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white"> |
| Data and auth | <img alt="PostgreSQL" src="https://img.shields.io/badge/PostgreSQL-4169E1?logo=postgresql&logoColor=white"> <img alt="Supabase" src="https://img.shields.io/badge/Supabase-3FCF8E?logo=supabase&logoColor=white"> <img alt="Firebase Auth" src="https://img.shields.io/badge/Firebase_Auth-DD2C00?logo=firebase&logoColor=white"> |
| Delivery | <img alt="Docker" src="https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=white"> <img alt="Caddy" src="https://img.shields.io/badge/Caddy-1F88C0?logo=caddy&logoColor=white"> <img alt="GitHub Actions" src="https://img.shields.io/badge/GitHub_Actions-2088FF?logo=githubactions&logoColor=white"> <img alt="Ansible" src="https://img.shields.io/badge/Ansible-EE0000?logo=ansible&logoColor=white"> <img alt="Vercel" src="https://img.shields.io/badge/Vercel-000000?logo=vercel&logoColor=white"> |

## System boundaries

| Part | Responsibility | Runs on | Service guide |
|---|---|---|---|
| Core | Java 21 / Spring Boot public API; authentication, shop ownership and business transactions; owns the business database | VPS (Docker) | [Core](backend/core/README.md) |
| AI | Internal Python / FastAPI service called only by Core; Agent chat, conversation history and memory | VPS (Docker) | [AI](backend/ai/README.md) |
| Mobile | Expo Router app for the shop OWNER | Android build, web on Vercel | [Mobile](frontend/mobile/README.md) |
| Web | Vite / React landing page and ADMIN dashboard | Vercel | [Web](frontend/web/README.md) |
| Data | Supabase PostgreSQL; Core Flyway migrations and separate AI CLI migrations | Supabase | [Local development](docs/development/local-development.md) |

Core verifies client identity and shop access before forwarding Agent requests with an internal token. Core owns business data; AI owns its conversation and memory storage.

## System architecture

![SmartLedger system architecture](docs/architecture/diagrams/images/ci-cd.svg)

| Color | Flow |
|---|---|
| Green | Deploy pipeline: push, CI, image build, deploy to the VPS |
| Purple | VPS setup with Ansible |
| Orange | Runtime request flow from the app to Core, AI and the database |

[Technical design §1](docs/architecture/technical-design.md#1-scope) records the status of each component, [CI/CD](docs/development/ci-cd.md) explains the pipeline and the [diagram guide](docs/architecture/diagrams/README.md) lists the other diagrams.

## Getting started

| Task | Where |
|---|---|
| Find the document that owns a fact | [Documentation](docs/README.md) |
| Set up, run and check each service before a PR | [Local development](docs/development/local-development.md) |
| Branches, commits, pull requests and releases | [CONTRIBUTING](CONTRIBUTING.md) |
| Deploy pipeline and environments | [CI/CD](docs/development/ci-cd.md) |
| Instructions for coding agents | [AGENTS](AGENTS.md) |
| Report a vulnerability | [Security policy](SECURITY.md) |

## Repository layout

```text
smart-ledger/
├── README.md
├── AGENTS.md            # instructions for coding agents
├── CLAUDE.md            # imports AGENTS.md
├── CONTRIBUTING.md      # branches, commits, pull requests, releases
├── SECURITY.md          # vulnerability reporting
├── PROGRESS.md          # recent progress log
├── BLOCKERS.md          # open blockers
├── compose.yaml         # local Core + AI stack
├── .agents/             # shared agent skills
├── .github/             # CI/CD workflows, PR templates, CI helper scripts
├── .honeyhive/          # HoneyHive evaluators, charts and alerts for Bobi
├── deploy/
│   ├── ansible/         # VPS provisioning
│   ├── vps/             # Compose stack and deploy script for the VPS
│   ├── edge/            # Caddy reverse proxy
│   ├── monitoring/      # Prometheus, Loki and Grafana
│   └── dopbase/         # self-hosted secrets manager
├── scripts/             # local database, CI, secrets, Bruno API collection, Android and iOS release
├── secrets/             # env file templates per environment, pulled from Dopbase
├── supabase/            # AI schema migrations (Supabase CLI)
├── docs/                # source of truth; start at docs/README.md
│   ├── product/         # product overview, BRD, PRD and user flows
│   ├── architecture/    # technical design, data model, ADRs, diagrams, service walkthrough
│   ├── contracts/       # HTTP and wire contracts
│   ├── design/          # mobile UI direction and wording
│   ├── development/     # local development, secrets, CI/CD, release runbooks
│   └── marketing/       # app screenshots per product flow
├── frontend/
│   ├── mobile/          # Expo app for the shop OWNER
│   └── web/             # landing page and ADMIN dashboard at /admin
└── backend/
    ├── core/            # Core public API (Java), owns the business database
    └── ai/              # internal AI API (Python FastAPI)
```
