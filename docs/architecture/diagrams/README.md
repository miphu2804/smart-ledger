# Diagram guide

Sources live in [`src/`](src/), exports in [`images/`](images/). Reference: [`src/ci-cd.drawio`](src/ci-cd.drawio) → [`images/ci-cd.svg`](images/ci-cd.svg).

## System diagrams (draw.io)

- Create and edit with the `drawio-skill` and its `smartledger` preset. English labels only.
- Layout: horizontal dashed bands (pipeline on top, clients left, runtime, infrastructure), brand icons with the label below, numbered steps on edges (one color per flow).
- Every vertex sets an explicit font color; edge labels have a background. Connect every edge to a source and a target.
- From the repository root, export the SVG with the embedded diagram source, then check it in a light and a dark viewer:

  ```bash
  drawio -x -f svg -e --embed-svg-images --svg-theme light -b ffffff -o docs/architecture/diagrams/images/<name>.svg docs/architecture/diagrams/src/<name>.drawio
  ```

- Commit the `.drawio` and its SVG together. Embed in docs as an SVG image.

## Logic flows (Mermaid)

- `flowchart LR` with the theme and palette from [`service-walkthrough/README.md`](../service-walkthrough/README.md).
- Commit the rendered SVG in `images/`; never embed raw `mermaid` blocks.
