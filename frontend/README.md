---
type: Guide
title: "Sổ Nghe Lời — Frontend"
description: "Overview of the two frontend projects, web and mobile, and how to run each."
owner: FE owner
status: stable
generated: { by: human:miphu2804, at: 2026-11-06T22:18:48+07:00 }
stale_after: 2027-01-05T22:18:48+07:00
---
# Sổ Nghe Lời — Frontend

An AI sales ledger for small shops (EXE201, Team HEXA). The frontend has two independent projects, each with its own `package.json`:

| Folder | Content | Stack | Run |
| --- | --- | --- | --- |
| [`web/`](web/README.md) | Landing page and admin pages (`/admin`) | Vite, React 19, TypeScript | `cd web && npm install && npm run dev` |
| [`mobile/`](mobile/README.md) | Sales app for the OWNER | Expo SDK 57, expo-router | `cd mobile && npm install && npx expo start` |

Both run on sample (mock) data by default and need no backend. Mobile calls the real Core when mocks are off; web admin has a real mode described in [`web/README.md`](web/README.md).

- Admin demo: `admin@songhloi.vn` / `admin123`
- App demo: any phone number, OTP `123456`

Environment variables: `web/.env.example` (`VITE_*`) and `mobile/.env.example` (`EXPO_PUBLIC_*`).
