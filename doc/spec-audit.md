# Specification Audit

## Scope

`SPECS.md` was reconciled against the current script implementation in `src/scripts/RowBandingCompensation`. The objective of this audit is not to restate every requirement, but to identify where the specification had drifted from the actual algorithm and to record how those discrepancies were resolved.

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

None at the current algorithmic and packaging level. The previous gaps for `structureMask`, diagnostic rendering semantics, 32-bit working precision, and script-versus-process wording have now been incorporated into `SPECS.md`.

## Audit Conclusion

After reconciliation, `SPECS.md` is now consistent with the implemented workflow and current PJSR packaging model. This audit should now be read as a historical reconciliation record. Future drift should be treated as a real documentation bug rather than an accepted abstraction gap.
