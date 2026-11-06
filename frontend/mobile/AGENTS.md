# Mobile scoped instructions

Scope: changes under `frontend/mobile`.

The repository-level [`AGENTS.md`](../../AGENTS.md) is the canonical policy. Read it before working in this directory. This file is an additive mobile scope: it may narrow or clarify mobile practice, but it never overrides or repeats root policy and does not grant precedence over it. `CLAUDE.md` imports the root policy; do not create a second policy here.

## Scope and language

- State the smallest success check before editing, inspect the relevant Expo Router route, shared components, theme tokens and data path, and preserve unrelated behavior.
- Keep engineering documentation, READMEs, indexes, scoped instructions and code comments in English. Preserve exact Vietnamese UI copy and quoted business/product requirements; do not translate code identifiers, paths or API fields.
- Follow the root documentation and OKF rules. Hand-authored documentation may use `author: miphu2804`; `generated` is optional. A formatting-only edit does not justify refreshing `stale_after`; verify living facts against the checked-out source before making freshness claims.
- Keep this file scoped to mobile workflow, safety and verification. Put product scope and API ownership in the canonical product and contract documents.

## Expo Router and runtime safety

- `app/` is the Expo Router source of truth. Preserve route groups, protected-screen guards, navigation labels, accessibility labels, tab order and existing behavior unless the task explicitly changes them.
- The root stack uses `SCREEN_ANIMATION` from `src/motion.ts`; do not add per-route transition literals or platform-specific route animation defaults.
- Environment configuration is deliberately strict. `EXPO_PUBLIC_API_ENDPOINT`, `EXPO_PUBLIC_USE_MOCK`, `EXPO_PUBLIC_MOCK_CORE` and `EXPO_PUBLIC_MOCK_SHOPS` must be explicit `true`/`false` values (and the endpoint must be non-empty). `src/config.ts` fails fast when a required value is absent or invalid. Never silently add production-like defaults or commit secrets.
- `EXPO_PUBLIC_USE_MOCK=true` implies the mock Core and shop paths. Keep mock flags explicit in local, test and build configuration so a developer cannot mistake simulated data for Core data. Do not describe mock behavior as deployment or acceptance evidence.
- Core calls belong behind the existing API/session modules and the contract in [`docs/contracts/api-contracts.md`](../../docs/contracts/api-contracts.md). Do not invent endpoints or bypass auth, shop context, standard errors or idempotency handling.

## Speech and order parsing

- Android speech recognition is the native `react-native-sherpa-onnx` path in `src/lib/speech/`; web uses its supported browser path. Keep the route available on every platform and gate only the unsupported recording capability with an explicit message.
- The model files are not assumed to be in git. Follow [`assets/models/README.md`](assets/models/README.md), keep `STT_MODEL_VERSION` and model filenames in sync, and rebuild a native development client after native speech dependency or patch changes. Treat model downloads and local servers as untrusted inputs: use the documented trusted network and never place credentials in public `EXPO_PUBLIC_*` variables.
- `src/lib/parseOrder.ts` is a rule-based parser. Do not call it AI order recognition or replace its user confirmation/unknown-item behavior without an explicit product change. Update focused parser tests when parser behavior changes.

## UI and visual verification

- Reuse theme tokens, existing artwork and icon semantics. Do not add screen-specific colors, decorative effects or hardcoded physical screenshot coordinates. Keep touch targets and safe-area behavior usable on narrow and wide devices.
- For bottom-tab changes, derive geometry from measured width and shared constants; keep the bar attached to the safe area and preserve routes, labels and active-state semantics.
- For any visual change, inspect the real running UI: inspect → implement → run → capture → review → iterate. A typecheck or screenshot of a mockup is not visual evidence. If no native runtime is available, report visual verification as not performed and give the exact manual steps.
- For voice/read-order changes, check the shared `/voice` route on web and an Android native runtime, including unsupported-capability messaging, permission failure and the successful recognition path when the model is available.

## Validation

Run the narrowest relevant checks, normally from `frontend/mobile`:

```bash
npm run typecheck
npm test
npm run test:e2e
```

Use `npm run test:e2e` only when the change affects browser flows; use a configured native build or development client for native behavior. Run `git diff --check` before handoff. Report commands, runtime/platform evidence and any unverified deployment or acceptance state separately; code presence does not prove deployment or acceptance.
