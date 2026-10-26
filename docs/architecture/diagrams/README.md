# Diagram guide

Sources live in [`src/`](src/), exports in [`images/`](images/). Reference: [`src/ci-cd.drawio`](src/ci-cd.drawio) → [`images/ci-cd.svg`](images/ci-cd.svg).

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
  drawio -x -f svg -e --embed-svg-images --svg-theme light -b ffffff -o docs/architecture/diagrams/images/<name>.svg docs/architecture/diagrams/src/<name>.drawio
  ```

- Commit the `.drawio` and its SVG together. Embed in docs as an SVG image.

## Logic flows (Mermaid)

- `flowchart LR` with the theme and palette from [`service-walkthrough/README.md`](../service-walkthrough/README.md).
- Commit the rendered SVG in `images/`; never embed raw `mermaid` blocks.
