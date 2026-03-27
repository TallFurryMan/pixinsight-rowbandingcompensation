# Specification Audit

## Scope

`SPECS.md` was reconciled against the current script implementation in `src/scripts/RowBandingCompensation`. The objective of this audit is not to restate every requirement, but to identify where the specification had drifted from the actual algorithm and to record the remaining intentional abstraction boundaries.

## Discrepancies Resolved

| Topic | Reconciled behavior |
| --- | --- |
| Packaging | The implementation is a PJSR script resource package with process-instance export support, not a native compiled PixInsight process module. |
| UI exposure | The script is exposed through `#feature-id` under `Utilities > RowBandingCompensation`, not through the native `Process` menu. |
| Image state | Corrections are applied iteratively to `currentImage`, initialized from `originalImage`. The algorithm does not recompute each pass from the original image. |
| Support image combinations | `starMaskView` and `starsOnlyView` now have distinct roles: the star mask defines exclusion and protection masks; the stars-only image drives star analysis when present. |
| Missing star catalog fallback | When a support image exists but no stars survive catalog filtering, `rowInfluence` is derived from row-wise protection-mask occupancy. |
| Soft background model | The support surface is built from a coarse node lattice with bilinear accumulation, neighbor fill, separable Gaussian smoothing, and bilinear reconstruction. |
| Row support policy | Rows with zero valid pixels are interpolated. Rows with some valid samples but insufficient support retain their direct estimate and are down-weighted through `rowConfidence`. |
| Convergence logic | Early stop requires both a small inter-iteration residual change and a small remaining residual amplitude, or a small correction amplitude together with a small residual amplitude. |
| Convergence floor | On the current 32-bit working-image path, selecting `convergenceEpsilon = 1e-9` suppresses early-stop convergence and leaves termination to the iteration limit. |
| Divergence guard | The engine warns on residual-RMS growth and stops after three consecutive increases to avoid runaway correction. |

## Remaining Intentional Abstraction Gaps

These points are still acceptable differences between the specification and the implementation detail level.

- `structureMask` remains a future-facing placeholder in `SPECS.md`. No runtime `structureMask` product exists in v1.
- `SPECS.md` specifies the algorithmic diagnostic products, but not every rendering detail. The present script renders diagnostic row plots as vertical strip views, with bar-style plots for `rowResidual` and `rowVisibility`.
- `SPECS.md` does not yet formalize sample precision as a configurable part of the contract. The present implementation still uses a 32-bit real working-image path.
- The specification remains process-oriented in language where that improves future portability, but the current executable target is still the PJSR package.

## Audit Conclusion

After reconciliation, `SPECS.md` is consistent with the implemented workflow at the algorithmic level. The remaining gaps are intentional: they concern future extensions, presentation details, or migration to a native process implementation.
