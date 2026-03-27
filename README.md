# pixinsight-rowbandingcompensation

PixInsight PJSR resource package for conservative horizontal row-banding compensation on linear monochrome subframes whose residual banding is still aligned with image rows.

## What is implemented

`RowBandingCompensation` is implemented as a PixInsight JavaScript Runtime package under [`src/scripts/RowBandingCompensation`](src/scripts/RowBandingCompensation).

It includes:

- A process-like script entry point with process-instance export support
- A collapsible dialog covering the parameters described in `SPECS.md`
- Modular engine code for mask preparation, star influence, row profiling, confidence weighting, iterative correction and diagnostics
- Diagnostic view export for the main intermediate profiles and images

## Important integration note

This repository now contains a PJSR script package, not a native compiled PixInsight module.

That means:

- It is suitable for a PixInsight resource repository on GitHub
- It can be code-signed with PixInsight's script signing system
- It can create reusable process instances and run on a view target
- It does not literally register under the native `Process` menu without a C++ module

The script is exposed through `#feature-id` under `Utilities > RowBandingCompensation`.

## Repository layout

The implementation lives in:

- [`src/scripts/RowBandingCompensation/RowBandingCompensation.js`](src/scripts/RowBandingCompensation/RowBandingCompensation.js)
- [`src/scripts/RowBandingCompensation/RowBandingCompensationDialog.js`](src/scripts/RowBandingCompensation/RowBandingCompensationDialog.js)
- [`src/scripts/RowBandingCompensation/RowBandingCompensationEngine.js`](src/scripts/RowBandingCompensation/RowBandingCompensationEngine.js)
- [`src/scripts/RowBandingCompensation/RowBandingCompensationMasks.js`](src/scripts/RowBandingCompensation/RowBandingCompensationMasks.js)
- [`src/scripts/RowBandingCompensation/RowBandingCompensationStars.js`](src/scripts/RowBandingCompensation/RowBandingCompensationStars.js)
- [`src/scripts/RowBandingCompensation/RowBandingCompensationProfiles.js`](src/scripts/RowBandingCompensation/RowBandingCompensationProfiles.js)
- [`src/scripts/RowBandingCompensation/RowBandingCompensationDiagnostics.js`](src/scripts/RowBandingCompensation/RowBandingCompensationDiagnostics.js)
- [`src/scripts/RowBandingCompensation/RowBandingCompensationParameters.js`](src/scripts/RowBandingCompensation/RowBandingCompensationParameters.js)

## Usage

Install the repository as a PixInsight resource repository, then run the script from its feature entry.

Additional workflow documentation is available under [`doc/`](doc/README.md).

Recommended input:

- Linear monochrome subframes
- Preferably calibrated and not yet registered
- Sensor row orientation preserved
- Residual banding still visually horizontal in the image
- Optional external star mask or stars-only image

Current v1 limitations:

- Monochrome only
- No preview-target execution
- No support yet for slight post-stacking row tilt or other rotated row geometry
- No automatic star extraction when no external star support image is provided
- No native process-module registration under the `Process` menu

If registration or stacking leaves the row defect slightly tilted, do not expect reliable correction from the current implementation. Tilt handling is intentionally deferred until a more robust global geometry method is designed.

## Compatibility Probe

To inspect the actual PJSR widget methods available on your PixInsight build, run:

`/Users/tallfurryman/Documents/Sources/pixinsight-rowbandingcompensation/src/scripts/PJSRCompatibilityProbe/PJSRCompatibilityProbe.js`

Run it from the PixInsight Script Editor or from the application command line with the script-running syntax supported by your installed PixInsight build.

The script prints a console report for `Dialog`, `Control`, `ToolButton`, `PushButton`, `ViewList`, `NumericControl`, `SectionBar`, `Label`, and `ComboBox`.

## Signing

I did not generate a `.xsgn` signature file in this workspace.

That step requires your PixInsight code-signing key material. Once you sign the package, the generated signature artifact should live next to the main script in the package directory.
