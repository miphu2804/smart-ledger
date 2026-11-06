---
type: Reference
title: "User flows"
description: "Technical map of the mobile screen flows, generated from Expo Router calls and linked to source files and product requirements."
owner: Product owner
author: miphu2804
status: stable
---
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
