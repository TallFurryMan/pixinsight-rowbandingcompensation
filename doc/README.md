# RowBandingCompensation Documentation

This directory contains the v1 workflow documentation for the current PJSR implementation.

- [`spec-audit.md`](./spec-audit.md): reconciliation of `SPECS.md` against the implemented algorithm, including the remaining intentional abstraction gaps.
- [`workflow.md`](./workflow.md): compact process-style description of the computation, intermediate products, iteration logic, and diagnostics.
- [`assets/`](./assets): embedded SVG workflow diagrams.

The present structure is intentionally close to what a future PIDoc conversion will need:

- scope and limitations,
- mathematical model,
- execution sequence,
- diagnostics and interpretation,
- implementation notes and migration boundaries.

Displayed equations now live directly in Markdown as LaTeX math blocks. For workflow diagrams, the rendered SVG is embedded from `doc/assets`, while the corresponding D3 description is preserved as an HTML comment in [`workflow.md`](./workflow.md).
