# RowBandingCompensation Documentation

This directory contains the v1 workflow documentation for the current PJSR implementation.

- [`spec-audit.md`](./spec-audit.md): reconciliation of `SPECS.md` against the implemented algorithm, including the remaining intentional abstraction gaps.
- [`workflow.md`](./workflow.md): compact process-style description of the computation, intermediate products, iteration logic, and diagnostics.
- [`assets/`](./assets): raster figures used by the workflow document.
- [`tools/generate_assets.py`](./tools/generate_assets.py): local generator for the formula and diagram PNG assets.

The present structure is intentionally close to what a future PIDoc conversion will need:

- scope and limitations,
- mathematical model,
- execution sequence,
- diagnostics and interpretation,
- implementation notes and migration boundaries.
