---
type: Guide
title: "SmartLedger"
description: "Repository entry point: what the product is, how the services fit together and where to start."
owner: Technical owner
author: miphu2804
status: stable
stale_after: 2027-01-05T22:18:48+07:00
---
# SmartLedger

SmartLedger (Sổ Nghe Lời) runs in production and helps small shops record sales, payments, debts and expenses. AI voice POS is the product direction: the current mobile order-entry path uses platform speech-to-text and a rule-based `parseOrder()` parser, with owner review before checkout. Bobi chat is a separate AI capability accessed through Core; speech recognition is not evidence of AI order parsing.

EXE201 MVP is a course delivery and acceptance scope, not the system's deployment status. See [product scope](docs/product/project-overview.md) and [implementation evidence](docs/architecture/technical-design.md#1-scope); checked-in features are not automatically enabled, deployed or accepted.

## Tech stack

| Layer | Stack |
|---|---|
| Core API | <img alt="Java 21" src="https://img.shields.io/badge/Java_21-ED8B00?logo=openjdk&logoColor=white"> <img alt="Spring Boot" src="https://img.shields.io/badge/Spring_Boot-6DB33F?logo=springboot&logoColor=white"> |
| AI service | <img alt="Python" src="https://img.shields.io/badge/Python-3776AB?logo=python&logoColor=white"> <img alt="FastAPI" src="https://img.shields.io/badge/FastAPI-009688?logo=fastapi&logoColor=white"> <img alt="Pydantic AI" src="https://img.shields.io/badge/Pydantic_AI-E92063?logo=pydantic&logoColor=white"> |
| Clients | <img alt="Expo" src="https://img.shields.io/badge/Expo-000020?logo=expo&logoColor=white"> <img alt="React" src="https://img.shields.io/badge/React-61DAFB?logo=react&logoColor=black"> <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white"> <img alt="Vite" src="https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white"> |
| Data and auth | <img alt="PostgreSQL" src="https://img.shields.io/badge/PostgreSQL-4169E1?logo=postgresql&logoColor=white"> <img alt="Supabase" src="https://img.shields.io/badge/Supabase-3FCF8E?logo=supabase&logoColor=white"> <img alt="Firebase Auth" src="https://img.shields.io/badge/Firebase_Auth-DD2C00?logo=firebase&logoColor=white"> |
| Delivery | <img alt="Docker" src="https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=white"> <img alt="Caddy" src="https://img.shields.io/badge/Caddy-1F88C0?logo=caddy&logoColor=white"> <img alt="GitHub Actions" src="https://img.shields.io/badge/GitHub_Actions-2088FF?logo=githubactions&logoColor=white"> <img alt="Ansible" src="https://img.shields.io/badge/Ansible-EE0000?logo=ansible&logoColor=white"> <img alt="Vercel" src="https://img.shields.io/badge/Vercel-000000?logo=vercel&logoColor=white"> |

## System boundaries

| Part | Responsibility | Service guide |
|---|---|---|
| Core | Java 21 / Spring Boot public API; authentication, shop ownership and business transactions | [Core](backend/core/README.md) |
| AI | Internal Python / FastAPI service called by Core; Agent chat, conversation history and AI capabilities | [AI](backend/ai/README.md) |
| Frontend | Expo Router OWNER app; separate Vite / React landing and ADMIN web | [Frontend](frontend/README.md) |
| Data | Supabase PostgreSQL; Core Flyway migrations and separate AI CLI migrations | [Local development](docs/development/local-development.md) |

Core verifies client identity and shop access before forwarding Agent requests with an internal token. Core owns business data; AI owns its conversation and memory storage. Runtime configuration and integrated acceptance remain separate from these code boundaries.

## System architecture

![SmartLedger system architecture](docs/architecture/diagrams/images/ci-cd.svg)

| Color | Flow |
|---|---|
| Green | Deploy pipeline: push, CI, image build, deploy to the VPS |
| Purple | VPS setup with Ansible |
| Orange | Runtime request flow from the app to Core, AI and the database |

The diagram shows the target delivery and runtime topology drawn from the tracked `deploy/` files; it does not prove that every component is enabled in an environment. [Technical design §1](docs/architecture/technical-design.md#1-scope) records implementation status, [CI/CD](docs/development/ci-cd.md) explains the pipeline and the [diagram guide](docs/architecture/diagrams/README.md) lists the other diagrams.

## Start here

- [Documentation](docs/README.md): domains, canonical sources and reading paths.
- [Local development](docs/development/local-development.md): setup, Compose and pre-PR checks.
- [CONTRIBUTING](CONTRIBUTING.md): branches, reviews and releases into `staging`, then production.
- [AGENTS](AGENTS.md): root policy and scoped instruction loading for coding agents.
- [Security policy](SECURITY.md): reporting vulnerabilities.

## Repository layout

| Path | Ownership |
|---|---|
| `backend/` | Core and AI services, with their own operational guides |
| `frontend/` | Mobile and web clients |
| `docs/` | Product requirements, contracts, architecture, design and operations |
| `deploy/`, `.github/` | Provisioning and delivery automation; documented in [CI/CD](docs/development/ci-cd.md) |
| `scripts/` | Local DB, CI, secrets, API checks and device-release tooling; documented by the owning service or operations guide |
| `secrets/` | [Credential-file workflow](secrets/README.md); do not commit secrets |
| `supabase/` | AI schema migrations, separate from Core Flyway |

Local mock mode must be selected explicitly for Mobile; consult each service guide rather than assuming checkout defaults are deployment configuration.
