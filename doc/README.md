# RowBandingCompensation Documentation

This directory contains the v1 workflow documentation for the current PJSR implementation.

- [`spec-audit.md`](./spec-audit.md): reconciliation of `SPECS.md` against the implemented algorithm, including the remaining intentional abstraction gaps.
- [`workflow.md`](./workflow.md): compact process-style description of the computation, intermediate products, iteration logic, and diagnostics.
- [`assets/`](./assets): embedded SVG workflow diagrams.
- [`diagram-data/`](./diagram-data): JSON source data for the SVG workflow diagrams.
- [`tools/d3-svg-renderer/`](./tools/d3-svg-renderer): Dockerized D3 renderer based on Node, Playwright, and Chromium.

The present structure is intentionally close to what a future PIDoc conversion will need:

- scope and limitations,
- mathematical model,
- execution sequence,
- diagnostics and interpretation,
- implementation notes and migration boundaries.

Displayed equations now live directly in Markdown as LaTeX math blocks. For workflow diagrams, the rendered SVG is embedded from `doc/assets`, while the corresponding D3 description is preserved as an HTML comment in [`workflow.md`](./workflow.md).

## Diagram Regeneration

Build the renderer image from the repository root:

```bash
docker build -t rbc-d3-svg-renderer -f doc/tools/d3-svg-renderer/Dockerfile .
```

Render both workflow diagrams from their JSON data:

```bash
docker run --rm \
  -v "$PWD:/workspace" \
  -w /workspace \
  rbc-d3-svg-renderer \
  /workspace/doc/diagram-data/pipeline_overview.json /workspace/doc/assets/pipeline_overview.svg \
  /workspace/doc/diagram-data/convergence_logic.json /workspace/doc/assets/convergence_logic.svg
```

The container entrypoint is the renderer itself, so additional input/output pairs can be appended to the same command if more diagrams are added later.
