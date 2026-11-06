---
type: Guide
title: "Sổ Nghe Lời — Frontend"
description: "Overview of the two frontend projects, web and mobile, and how to run each."
owner: FE owner
status: stable
generated: { by: human:miphu2804, at: 2026-11-07T02:08:00+07:00 }
stale_after: 2027-01-06T02:08:00+07:00
---
# Sổ Nghe Lời — Frontend

An AI sales ledger for small shops (EXE201, Team HEXA). The frontend has two independent projects, each with its own `package.json`:

| Folder | Content | Stack | Run |
| --- | --- | --- | --- |
| [`web/`](web/README.md) | Landing page and admin pages (`/admin`) | Vite, React 19, TypeScript | `cd web && npm install && npm run dev` |
| [`mobile/`](mobile/README.md) | Sales app for the OWNER | Expo SDK 57, expo-router | `cd mobile && npm install && npx expo start` |

Web runs on sample (mock) data by default and needs no backend. Mobile has no default mode: copy `mobile/.env.example` to `.env` and set `EXPO_PUBLIC_API_ENDPOINT`, `EXPO_PUBLIC_USE_MOCK`, `EXPO_PUBLIC_MOCK_CORE` and `EXPO_PUBLIC_MOCK_SHOPS` (the three flags `true` for sample data without a backend). Web admin has a real mode described in [`web/README.md`](web/README.md).

- Admin demo: `admin@songhloi.vn` / `admin123`
- App demo (mock mode): any email and a password of 6 characters or more, then **Tôi đã xác minh** (see [`mobile/README.md`](mobile/README.md#try-it-with-sample-data))

Environment variables: `web/.env.example` (`VITE_*`) and `mobile/.env.example` (`EXPO_PUBLIC_*`).
