---
type: Guide
title: "Sổ Nghe Lời — Frontend"
description: "Overview of the two frontend projects, web and mobile, and how to run each."
owner: FE owner
status: stable
author: miphu2804
stale_after: 2027-01-05T22:18:48+07:00
---
# Sổ Nghe Lời — Frontend

The clients for SmartLedger, which runs in production. EXE201 describes the course delivery scope, not deployment status. The frontend has two independent projects, each with its own `package.json`:

| Folder | Content | Stack | Run |
| --- | --- | --- | --- |
| [`web/`](web/README.md) | Landing page and admin pages (`/admin`) | Vite, React 19, TypeScript | `cd web && npm install && npm run dev` |
| [`mobile/`](mobile/README.md) | Sales app for the OWNER | Expo SDK 57, expo-router | `cd mobile && npm install && npx expo start` |

For an offline demo, explicitly configure Mobile's required mock flags using its [service guide](mobile/README.md); there are no implicit Mobile mock defaults. Mobile uses real Core for the capabilities whose mock flags are off. Web admin mock/real mode is documented in the [web guide](web/README.md); authorized access details are not published in READMEs. Do not use mock flows as integrated acceptance evidence.

Environment variables: `web/.env.example` (`VITE_*`) and `mobile/.env.example` (`EXPO_PUBLIC_*`).
