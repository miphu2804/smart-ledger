# Diagram guide

Sources live in [`src/`](src/), exports in [`images/`](images/). Reference: [`src/ci-cd.drawio`](src/ci-cd.drawio) → [`images/ci-cd.svg`](images/ci-cd.svg).

## Reading scope — Core audit 2026-10-26

| Artifact | What it represents | Implementation boundary |
|---|---|---|
| `architecture.mmd`, `architecture.drawio`, `architecture.svg/png` | MVP target, including future services/infrastructure | Use [technical design §1](../technical-design.md#1-phạm-vi) for code status; the target image does not prove those services exist |
| `ci-cd.drawio/svg` | Pipeline and runtime topology | Core runs on container port 8080; Compose exposes host port 8000 by default. ADMIN can use the real Core behind its build flag; PR checks/deploy readiness depend on actual runs |
| `vps-network.drawio/svg` | Docker networks, DNS aliases and ports on the VPS | Drawn from `deploy/*/compose.yaml`, the Caddy sites the playbook writes, and `docker network inspect` on the VPS on 2026-10-29 |
| `auth-request-flow.drawio/svg` | Firebase browser sign-in, CORS and project matching | The image is not the Zalo OAuth/App Link flow; see [Zalo contract](../../contracts/api-contracts.md#zalo-core-015) and the Core service map. A permitted origin does not grant an application role |
| `service-walkthrough/README.md` and its 14 SVG exports | Core/AI reading notes with dated source reviews | The two Core overview figures include current modules; detailed transaction diagrams keep their stated review scope, not FE or staging acceptance |
| `erd.dbml` | Logical Core/AI schema and explicitly planned tables | Current branch adds V19 daily activity (CORE-018) to V1–V18; 23 Core tables. SQL owns actual RLS, checks, triggers and partial indexes that DBML cannot fully express; no shared-DB migration implied |
| `erd.dbdiagram` | dbdiagram editor layout only | It does not contain schema definitions; table positions must cover the DBML tables, including newer media/Zalo/refund tables |
| `agent-memory.drawio/svg`, `apk-release.drawio/svg` | Related AI design and mobile release pipeline | Separate from Core API implementation; retain their ADR/release ownership and dated evidence |

Product images in [marketing](../../marketing/README.md) are dated mock captures;
the [mobile reference image](../../design/mobile-ui-style-migration.md) is design
input. Neither is evidence that Core or a provider integration has passed UAT.

## System diagrams (draw.io)

- Create and edit with the `drawio-skill` in [`.agents/skills/drawio-skill`](../../../.agents/skills/drawio-skill) and its `smartledger` preset. English labels only.
- Layout: horizontal dashed bands (pipeline on top, clients left, runtime, infrastructure), brand icons with the label below, numbered steps on edges (one color per flow).
- Let the icons tell the story; keep text short:
  - Draw each tool or service as its own current logo, never a hand-drawn box: the vendor's official logo when it has one (DVC from dvc.org), else [simple-icons](https://simpleicons.org) recolored with its brand hex or [lobe-icons](https://lobehub.com/icons) in color. Draw a generic thing (a folder, a file, a key, a lock, a script) as a [Lucide](https://lucide.dev) outline icon. Embed every icon as a data URI so the SVG stands alone.
  - Draw a person who starts a flow, such as a developer, as the Lucide `user` outline icon at the start of that flow.
  - Label each node with a short name and each edge with its action: the plain step number, then the command or verb (`1. edit`, `3. dvc push`, `4. git push`), without circled digits. An edge that only carries data and is not a step is grey, with no number.
  - Show a check that stops a flow as a small red Lucide `shield-alert` icon over the edge it guards, with two or three words such as `stale env/`.
  - Keep every label on one line. Put a label above or beside its icon when an edge leaves from below, so no edge crosses text.
- Every vertex sets an explicit font color; edge labels have a background. Connect every edge to a source and a target.
- From the repository root, export the SVG with the embedded diagram source, then check it in a light and a dark viewer:

  ```bash
  drawio -x -f svg -e --embed-svg-images --svg-theme light -b 1 -o docs/architecture/diagrams/images/<name>.svg docs/architecture/diagrams/src/<name>.drawio
  ```

- Commit the `.drawio` and its SVG together. Embed in docs as an SVG image.
- `-b` is a border width in pixels, not a background colour. Set any required
  background in the source diagram. The Core audit used draw.io Desktop 28.2.5
  locally; it did not send diagram XML to an online export service.

## Logic flows (Mermaid)

- `flowchart LR` with the theme and palette from [`service-walkthrough/README.md`](../service-walkthrough/README.md).
- Commit the rendered SVG beside its source and link the exported image from
  reading docs. The Mermaid blocks in `service-walkthrough/README.md` are the
  authoring source consumed by its `export.sh`, not a second API specification.
- The 2026-10-26 Core overview exports use Mermaid CLI 11.12.0. Re-render changed
  blocks and inspect SVGs in light/dark viewers; no application dependency change
  is needed to use a renderer from an external tool cache.
