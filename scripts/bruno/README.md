---
type: Guide
title: "Bruno API collection"
description: "Bruno requests for the Core API and how to run them against an environment."
owner: Core owner
status: stable
generated: { by: human:miphu2804, at: 2026-11-01T11:08:28+07:00 }
stale_after: 2026-12-31T11:08:28+07:00
---
# Bruno API collection

[Bruno](https://www.usebruno.com/) requests for the Core API, grouped by controller and stored in the [OpenCollection YAML format](https://docs.usebruno.com/opencollection-yaml/overview), so it needs Bruno 3 or later. The behavior they exercise is defined in the [API contracts](../../docs/contracts/api-contracts.md). The collection has `local` and `staging` environments and deliberately no production environment, because most requests write data.

The browser-only routes `GET /api/v1/auth/zalo/callback`, the native return page and `/.well-known/assetlinks.json` are left out. The AI service `/internal/v1/*` routes are also left out because Core proxies them under the `Agent` folder.

## Use in the Bruno app

1. Open `scripts/bruno` as a collection and pick an environment.
2. Fill in the secret variables `firebaseApiKey`, `firebaseEmail` and `firebasePassword`. Bruno keeps them on your machine, outside the repository.
3. Send `Auth/Firebase login`, then `Auth/Open session`. These store `idToken` and the first `shopId` for the requests that follow.

`firebaseApiKey` is the value of `EXPO_PUBLIC_FIREBASE_API_KEY`, and the account needs a Firebase email and password sign-in. Create requests store `categoryId`, `productId`, `customerId`, `draftId`, `saleId`, `expenseId` and `conversationId`, and the list requests for debts, payments, notifications and admin users store the first `debtId`, `paymentId`, `notificationId` and `userId`. Set `memoryId` and the `zalo*` values in the environment by hand.

To sign in through the Firebase Auth Emulator, set `firebaseAuthUrl` to `http://127.0.0.1:9099/identitytoolkit.googleapis.com` and `firebaseApiKey` to any value.

## Run from the command line

The `Smoke` folder is read-only and needs no credentials:

```bash
npx @usebruno/cli@4.3.0 run Smoke --env staging
```

Run this from `scripts/bruno`. CD runs the same command after each staging backend deploy. Do not run the whole collection against a shared environment: it voids sales and archives the shop.
