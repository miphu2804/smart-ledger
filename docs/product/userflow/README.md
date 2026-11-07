# User flows

This directory contains a generated map of the mobile screen flows. It is a navigation aid, not the source of runtime behavior: route code under `frontend/mobile/app`, shared logic under `frontend/mobile/src`, and the product requirements in [`../product-requirements.md`](../product-requirements.md) remain authoritative.

Open [`index.html`](index.html) in a browser. It needs no server or install. Use the title menu to choose a flow, drag to pan, use Ctrl/Cmd + scroll or `+`/`-` to zoom, and `0` to fit. Select a node to inspect its linked screenshot, source path, `FR-*` traceability and next hops. The generated page is designed for desktop screens.

The source currently lives in `frontend/web/src/userflow`: `flows.ts` defines nodes, edges, coordinates, captions and notes from the router calls in `frontend/mobile/app`. The map groups sign-in and shop setup, selling and checkout, orders and reports, the Bobi assistant, management, and quick navigation with shop switching. Keep the map aligned with the actual route tree; do not use it to infer deployment or acceptance status.

## Rebuild

After changing the source, run from `frontend/web`:

```bash
npm run userflow
```

The command writes a self-contained `index.html` here with the script, styles and font inlined so it works from `file://`. Commit the generated page with its source change. Add `-- --watch` to rebuild while editing node positions.

## Screenshots

Files under `screens/` are illustrative captures attached to flow nodes. Their test data, viewport and capture environment are not a behavior contract. When a screen changes, retake the affected capture from the intended environment, record the capture context, replace the image and rebuild the page. A screenshot does not verify that the corresponding feature is deployed or accepted.

Capture manifest for the current files (test accounts, environment addresses and test data stay in the private operations knowledge base):

| Screens | Captured | Frame and export | Added in | App state |
|---|---|---|---|---|
| `welcome`, `email-login`, `invoices`, `chat-tro-ly-ai`, `chat-dat-cau-hoi`, `chat-tra-loi`, `ai-ask-sheet` | 2026-11-04, staging | 390 × 844 at 2× (`chat-tra-loi` about 1×), Pillow to 720 px WebP, quality 78 | `f446267b` | After #491, #499, #505, #513 and #514 |
| All other files in `screens/` | 2026-11-02, staging | 390 × 844, `cwebp -q 78 -resize 720 0` | `fc2df5d8` (#472) | Staging on the capture date |

Barcode scanning, email verification, shop setup and stock-in have no screenshot and stay as step nodes with a note.
