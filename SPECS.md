# Row Banding Compensation for PixInsight (PJSR) — Specification v1

## Objective

Implement a PixInsight JavaScript Runtime (PJSR) script package named RowBandingCompensation designed to reduce horizontal row-wise banding in linear, calibrated, monochrome astrophotography subframes, before registration and integration.

This v1 specification remains limited to defects that are still visually horizontal in image coordinates. Slight post-stacking row tilt is intentionally deferred.

The target defect is a row-level background depression or offset that appears to be correlated with bright stars and/or row readout behavior. The correction must be conservative, diagnostic-friendly, and modular, so that each sub-adjustment can be enabled or disabled independently for experimentation and debugging.

The current v1 implementation is distributed as a PixInsight script resource with process-instance export support. A future native process implementation may reuse the same workflow and documentation structure.

## Scope and intended use

### Intended inputs
- Linear monochrome images
- Preferably calibrated subframes
- Preferably before registration
- Image orientation must still match the sensor’s original row orientation
- Residual banding should remain visually horizontal across the frame

### Intended defect
- Horizontal row banding
- Row-wise background offsets
- Defects that are more visible near rows crossing bright stars
- Defects not fully removed by dark calibration

### Non-goals for v1
- Color / RGB correction
- Vertical banding
- Correction on already rotated / registered frames
- Correction of slightly tilted row banding after stacking or geometric transforms
- Fully automatic gradient removal
- Fully automatic star extraction if the external star mask is not available

## High-level processing model

The process computes a robust row background profile, optionally stabilized by a soft 2D background model, then derives a row correction signal. This signal can be modulated by:

- star influence,
- visual prominence / row residual salience,
- confidence in the row background estimate.

The final correction is applied additively per row to the current corrected image state, optionally protected by a star/structure protection mask.

## Functional requirements

The module shall:

1. Accept a target image window.
2. Optionally accept an external star mask image.
3. Optionally accept an external stars-only image.
4. Optionally generate / refine internal masks from the provided mask.
5. Estimate a soft 2D background model for internal use only.
6. Compute a robust row background estimate excluding masked pixels.
7. Compute a smoothed row trend.
8. Compute a row residual profile.
9. Build a row influence model from bright stars.
10. Build a row visibility / salience model from the row residual.
11. Combine all enabled components into a final row correction vector.
12. Apply the correction additively to the current corrected image state.
13. Support multiple iterations with convergence criteria.
14. Expose intermediate products for diagnostics.
15. Allow enabling/disabling each major adjustment block.

## Script identity and UI placement

### Feature identifier
RowBandingCompensation

### Menu placement
Expose the current script through its `#feature-id` entry:

- Utilities > RowBandingCompensation

Future native process-menu placement can be defined later if the implementation is migrated from PJSR to a compiled module.

## Required UI sections

The interface should be organized into collapsible groups.

### Input
- Target image
- Optional stars-only view
- Optional star mask view
### Iteration Control
- Enable iterative processing from the section title
- Enable convergence stop
- Convergence mantissa
- Convergence exponent
- Maximum number of iterations
- Recompute masks each iteration
- Recompute star influence each iteration
### Star mask and object analysis
- The section itself is not globally enable-able
- Mask threshold
- Star mask dilation radius
- Star mask blur radius
- Minimum star area
- Brightness threshold
- Saturation threshold
### Background estimation
- Enable soft 2D background model from the section title
- Row estimator type
- High rejection quantile
- Low rejection quantile
- Minimum valid pixels per row
- Soft background sampling scale
- Soft background smoothing strength
### Row model
- Enable row trend correction from the section title
- Row trend smoothing radius
- Global correction strength
- Maximum per-iteration correction
- Additive correction clipping policy
### Star influence modulation
- Enable star influence modulation from the section title
- Star peak weight
- Star flux weight
- Star saturation weight
- Star radius weight
- Star influence radius in rows
- Influence kernel
- Local star-weighted boost
### Protection mask
- Enable protection during application from the section title
- Protection strength
### Visibility modulation
- Enable row visibility modulation from the section title
- Visibility estimator mode
- Visibility smoothing radius
- Visibility strength
### Confidence modulation
- Enable confidence weighting from the section title
- Confidence weighting strength
### Diagnostics
- Enable diagnostics from the section title
- Output row background plot
- Output row trend plot
- Output row residual plot
- Output row influence plot
- Output row visibility plot
- Output row confidence plot
- Output final correction plot
- Output difference image
- Output soft background model
- Output working image
## Detailed algorithm
### Inputs
- Required
  - targetImage: active image view
- Optional
  - starMaskView: external star mask
  - starsOnlyView: external stars-only image
- Constraints
  - The image should be monochrome
  - The image should be linear
  - The image should not be geometrically transformed relative to sensor rows
  - Slight post-stacking row tilt is not supported in v1; if the banding is no longer horizontal, correction may be unreliable

The current implementation warns when the target appears stretched or non-linear, but rejects unsupported targets such as previews, color images, and very small images.

### Internal data products

The process should produce the following internal arrays and images:

- originalImage
- currentImage
- workingImage
- softBackgroundModel
- exclusionMask
- protectionMask
- structureMask (optional future-ready placeholder)
- starObjects[]
- rowBackground[]
- rowTrend[]
- rowResidual[]
- rowInfluence[]
- rowVisibility[]
- rowConfidence[]
- rowCorrection[]
- correctedImage
- differenceImage

### Star mask preparation
#### Objective
Prepare masks suitable for:

- excluding stars from row background estimation,
- protecting stars during correction application,
- extracting a row influence signal from star positions and intensities.
#### Inputs
- If both `starMaskView` and `starsOnlyView` are provided, use the star mask to build exclusion and protection masks, and use the stars-only image for star analysis
- If only `starsOnlyView` is provided, derive both masks from it and also use it as the star-analysis image
- If only `starMaskView` is provided, use it both as the mask source and as the star-analysis image
- If neither is available in v1, execution may continue in degraded mode with star-related features disabled
#### Steps
- Normalize the mask to [0,1]
- Binarize or soft-threshold if needed
- Build:
  - exclusionMask: stronger, dilated mask for measurement exclusion
  - protectionMask: softer mask for correction application attenuation
#### Parameters
- maskDilationRadius
- maskBlurRadius
- maskThreshold

#### Notes

The exclusion mask must be conservative enough to remove stellar cores and halos from background estimation.

### Star object extraction
### Objective

Build a catalog of significant star objects to estimate row-specific disturbance potential.

#### For each detected star object, estimate:
- centroid (x, y)
- bounding box
- effective radius
- peak intensity
- integrated flux
- saturated pixel count
- saturation ratio
- estimated influence amplitude

#### Suggested star score

A configurable scalar starScore based on:

- normalized peak
- normalized integrated flux
- saturation ratio
- effective radius

#### Example conceptual model:
starScore = a*peak + b*flux + c*saturationRatio + d*radius

Exact coefficients must be user-tunable or internally normalized.

#### Output

- starObjects[]

### Soft 2D background preconditioning
#### Objective

Estimate a very low-frequency 2D background surface in order to reduce the impact of large-scale gradients on row profile estimation.

#### Important rule

This model is used for estimation support only. It must not replace the original image by default.

#### Steps
- Use the current working image for the iteration
- Exclude star pixels using exclusionMask
- Accumulate samples onto a coarse node lattice with bilinear weights
- Fill missing nodes from neighboring nodes
- Apply separable Gaussian smoothing on the lattice
- Reconstruct the support surface by bilinear interpolation from the smoothed lattice
#### Create:
- softBackgroundModel
- workingImage = currentImage - softBackgroundModel
#### Requirements
- The surface must capture only large-scale gradients
- The surface must not attempt to fit row banding
- The surface must not aggressively model nebular structures
#### Parameters
- enableSoftBackgroundModel
- backgroundSamplingScale
- backgroundSmoothingStrength

#### Debug option

Allow displaying softBackgroundModel and workingImage.

### Robust row background estimation
#### Objective

Estimate the background level of each row excluding stars and other masked pixels.

#### Source image
- currentImage - softBackgroundModel if soft background preconditioning is enabled
- otherwise currentImage

#### For each row y
- Collect all pixels not masked by exclusionMask
- Reject invalid / clipped / masked pixels
- Apply robust statistics:
  - median, or
  - trimmed mean, or
  - winsorized mean

#### Output

- rowBackground[y]

#### Parameters
- rowEstimatorType
  - Median
  - TrimmedMean
  - WinsorizedMean
- lowRejectQuantile
- highRejectQuantile
- minimumValidPixelsPerRow

#### Special handling

If a row has no valid pixels:

- interpolate from neighboring rows

If a row has some valid pixels but remains below `minimumValidPixelsPerRow`:

- keep the direct robust estimate
- mark the row as low-confidence instead of forcing interpolation

### Row trend estimation
#### Objective

Estimate the low-frequency expected row background trend.

#### Input

rowBackground[]

#### Steps
1. Smooth the row background profile with a large-radius 1D smoothing operator
2. Preserve only the low-frequency component
3. Avoid following sharp row-to-row oscillations

#### Output

- rowTrend[]

#### Current implementation
- 1D Gaussian smoothing

#### Parameter
- rowTrendSmoothingRadius

#### Important note

This is the baseline model of expected row background. It should remain conservative.

### Row residual estimation
#### Objective

Measure row deviation from the expected background trend.

#### Formula

- rowResidual[y] = rowBackground[y] - rowTrend[y]

#### Output

- rowResidual[]

This is the main 1D banding signal before modulation.

### Star influence model
#### Objective

Identify rows more likely to exhibit star-triggered banding.

#### Steps

For each detected star object:

1. Read its centroid row `y0`
2. Compute an influence amplitude from the weighted combination of peak, flux, saturation ratio and effective radius
3. Spread this influence across neighboring rows using a vertical kernel

If no stars survive catalog filtering but a support image exists:

- build a fallback row-influence profile from row-wise mean protection-mask occupancy

#### Suggested kernels
- Gaussian
- triangular
- box kernel for simple v1 implementation

#### Output

- rowInfluence[], normalized to [0,1]

#### Parameters
- enableStarInfluence
- starInfluenceRadius
- starInfluenceKernelType
- starPeakWeight
- starFluxWeight
- starSaturationWeight
- starRadiusWeight

#### Important note

This is a modulation signal, not a correction signal by itself.

### Row visibility / salience model
#### Objective

Estimate how visually prominent the row defect is, based on the residual profile.

#### Input

- rowResidual[]

#### Principle

Use a localized high-frequency or salience measure computed from the residual, not from the whole image.

#### Recommended methods
- local absolute deviation from a smoothed residual baseline
- first derivative magnitude
- second derivative magnitude
- local high-pass energy
- simple wavelet-like 1D bandpass

#### Output

- rowVisibility[], normalized to [0,1]

#### Parameters
- enableRowVisibility
- visibilityMode
  - HighPassResidual
  - FirstDerivative
  - SecondDerivative
  - LocalMAD
- visibilitySmoothingRadius
- visibilityStrength

#### Important note

This signal indicates how visible the defect is likely to be. It must not replace the row residual itself.

### Row confidence model
#### Objective

Estimate trust in the background estimation for each row.

#### Possible factors
- fraction of valid pixels in row
- distribution quality after rejection
- interpolation use due to missing valid data
- proximity to dense star fields

#### Output

- rowConfidence[], normalized to [0,1]

#### Parameters
- enableConfidenceWeighting
- confidenceStrength

#### Notes

Rows with poor estimation support should be corrected less aggressively.

### Final row correction model
#### Objective

Combine enabled components into a final correction vector.

#### Base correction

- baseCorrection[y] = rowResidual[y]

#### Modulated correction

A recommended structure is:

- rowCorrection[y] = baseCorrection[y]
- rowCorrection[y] *= globalStrength

If enabled:

- star influence modulation
- visibility modulation
- confidence modulation

In the current implementation:
- rowCorrection[y] *= (1 + localStarBoost * rowInfluence[y]) when star influence is enabled
- rowCorrection[y] *= (1 + visibilityStrength * rowVisibility[y]) when visibility modulation is enabled
- rowCorrection[y] *= max( 0, 1 - confidenceStrength * (1 - rowConfidence[y]) ) when confidence weighting is enabled

#### Constraints
- Cap per-iteration correction amplitude
- Avoid sign inversion artifacts from excessive weighting

#### Parameters
- globalStrength
- localStarBoost
- visibilityStrength
- confidenceStrength
- maximumPerIterationCorrection

### Correction application
#### Objective

Apply the row correction additively to the current corrected image state.

#### Important rule

Apply each iteration to the current corrected image state, not to the soft-background-subtracted support image.

#### Formula

For each pixel (x, y):

- compute an application attenuation weight
- attenuate correction in protected regions

Conceptually:
- corrected_k+1(x,y) = corrected_k(x,y) - rowCorrection_k[y] * applyWeight(x,y)

Where:

- applyWeight(x,y) is close to 1 on background,
- reduced near stars if protection is enabled.

#### Protection behavior

If enableProtectionMask:

- derive attenuation from protectionMask
- e.g. less correction where mask intensity is high

#### Parameters
- enableProtectionMask
- protectionStrength

#### Optional clipping

Prevent negative or invalid values after correction.

### Iterative refinement
#### Objective

Allow multiple conservative passes instead of a single aggressive pass.

#### Iteration loop

For i = 1..N:

- build or update star-support masks as needed
- build or update the star-influence profile as needed
- build the optional soft background model
- compute row background
- compute row trend
- compute row residual
- compute enabled modulation signals
- compute row correction
- apply correction to the current corrected image
- evaluate convergence and divergence guards

#### Convergence criteria

Stop early if:

- RMS change in `rowResidual` is below `convergenceEpsilon` and the residual `|95%|` amplitude is also below `convergenceEpsilon`
- or max correction amplitude is below `convergenceEpsilon` and the residual `|95%|` amplitude is also below `convergenceEpsilon`

If `convergenceEpsilon` is set to the current floor (`1e-9` in the 32-bit working-image path):

- suppress early-stop convergence entirely
- use the iteration limit instead

If residual RMS increases for three consecutive iterations:

- stop early to avoid divergence
- warn the user to reduce global correction strength and/or maximum per-iteration correction

#### Parameters
- enableIterations
- iterations
- convergenceEpsilon
- recomputeStarInfluenceEachIteration
- recomputeMasksEachIteration

#### Recommended default

30 iterations with convergence enabled.

## Debugging and diagnostics

The process must support optional creation of diagnostic outputs.

### Diagnostic plots or images
- rowBackground
- rowTrend
- rowResidual
- rowInfluence
- rowVisibility
- rowConfidence
- rowCorrection

### Diagnostic image outputs
- softBackgroundModel
- workingImage = currentImage - softBackgroundModel
- differenceImage = correctedImage - originalImage

### Requirement

Each diagnostic output should be individually enable-able.

## Parameter list with intended meaning
### Input
- starMaskViewId
- starsOnlyViewId
### Global flags
- enableSoftBackgroundModel
- enableRowTrendCorrection
- enableStarInfluence
- enableRowVisibility
- enableConfidenceWeighting
- enableProtectionMask
- enableIterations
- enableDiagnostics
### Mask preparation
- maskThreshold
- maskDilationRadius
- maskBlurRadius
### Star analysis
- minimumStarArea
- brightnessThreshold
- saturationThreshold
- starPeakWeight
- starFluxWeight
- starSaturationWeight
- starRadiusWeight
- starInfluenceRadius
- starInfluenceKernelType
### Background model
- backgroundSamplingScale
- backgroundSmoothingStrength
### Row estimation
- rowEstimatorType
- lowRejectQuantile
- highRejectQuantile
- minimumValidPixelsPerRow
- rowTrendSmoothingRadius
### Visibility
- visibilityMode
- visibilitySmoothingRadius
- visibilityStrength
### Confidence
- confidenceStrength
### Correction
- globalStrength
- localStarBoost
- protectionStrength
- maximumPerIterationCorrection
### Iteration
- iterations
- convergenceEpsilon
- recomputeMasksEachIteration
- recomputeStarInfluenceEachIteration
### Diagnostics
- outputSoftBackgroundModel
- outputWorkingImage
- outputDifferenceImage
- outputRowBackgroundPlot
- outputRowTrendPlot
- outputRowResidualPlot
- outputRowInfluencePlot
- outputRowVisibilityPlot
- outputRowConfidencePlot
- outputRowCorrectionPlot

## Tooltip requirements

Every UI parameter must include a detailed tooltip. Tooltips should explain:

- what the parameter controls,
- what increasing it generally does,
- typical failure modes or side effects,
- when to disable the related adjustment.

Examples of tooltip style:

#### globalStrength

Controls the amplitude of the base row correction derived from the row residual profile. Higher values remove row offsets more aggressively, but may flatten real low-contrast structures if overused.

#### localStarBoost

Increases correction strength on rows estimated to be more affected by bright stars. Useful when the defect is triggered or amplified by bright stellar content. Excessive values can produce local overcorrection near dense star fields.

#### backgroundSmoothingStrength

Controls how soft the internal 2D background support model is. Higher values make the model follow only very broad gradients. This model is used only to stabilize row estimation, not as a primary background correction.

#### visibilityStrength

Controls how strongly visually prominent row residuals are emphasized in the final correction. Increase cautiously. Too high a value may overreact to non-banding residual structures.

## Recommended defaults

These are conservative defaults for v1:

- enableSoftBackgroundModel = true
- enableRowTrendCorrection = true
- enableStarInfluence = true
- enableRowVisibility = true
- enableConfidenceWeighting = true
- enableProtectionMask = true
- enableIterations = true
- maskDilationRadius = 3
- maskBlurRadius = 2
- minimumStarArea = 5
- brightnessThreshold = 0.2
- saturationThreshold = 0.9
- starInfluenceRadius = 2
- backgroundSamplingScale = 128
- backgroundSmoothingStrength = 4
- rowEstimatorType = TrimmedMean
- lowRejectQuantile = 0.05
- highRejectQuantile = 0.10
- minimumValidPixelsPerRow = 64
- rowTrendSmoothingRadius = 15
- visibilityMode = LocalMAD
- visibilitySmoothingRadius = 5
- visibilityStrength = 0.5
- confidenceStrength = 0.5
- globalStrength = 1.0
- localStarBoost = 0.5
- protectionStrength = 0.75
- maximumPerIterationCorrection = 0.02
- iterations = 30
- convergenceEpsilon = 5e-6

## Failure handling

The module must fail gracefully.

If no star support image is provided
- allow execution
- disable star-dependent features
- emit warning

If the detected star catalog is empty but a support image exists
- fall back to a row-occupancy influence profile
- emit an informational message

If too many rows have insufficient valid pixels
- warn user
- reduce confidence

If the image appears non-linear or stretched
- warn user that results may be unreliable

If image is color
- reject execution in v1; extract a single channel first

If target is a preview
- reject execution in v1

## Suggested implementation structure

### Recommended source organization:

- RowBandingCompensation
  - RowBandingCompensation.js
  - RowBandingCompensationDialog.js
  - RowBandingCompensationEngine.js
  - RowBandingCompensationMasks.js
  - RowBandingCompensationStars.js
  - RowBandingCompensationProfiles.js
  - RowBandingCompensationDiagnostics.js

### Suggested class responsibilities
#### RowBandingCompensationParameters

Stores process parameters and defaults.

#### RowBandingCompensationEngine

Main orchestration of execution pipeline.

#### RowBandingCompensationMaskBuilder

Creates exclusion and protection masks.

#### RowBandingCompensationStarAnalyzer

Builds star object catalog and row influence vector.

#### RowBandingCompensationBackgroundModel

Builds soft 2D background support model.

#### RowBandingCompensationProfileEstimator

Builds row background, trend, residual, visibility, confidence.

#### RowBandingCompensationCorrectionApplier

Applies additive row correction.

#### RowBandingCompensationDiagnosticsExporter

Creates plots and diagnostic images.

## Suggested execution flow
1. Validate target image
2. Read parameters
3. Load optional star mask / stars-only inputs
4. Build exclusion and protection masks
5. Extract star objects or fallback row occupancy if enabled
6. Initialize current image from the original image
7. For each iteration:
  - rebuild masks if configured
  - recompute star influence if configured
  - build optional soft background model
  - estimate row background
  - estimate row trend
  - compute residual
  - compute visibility
  - compute confidence
  - compute final row correction
  - apply correction
  - test convergence and divergence guards
8. Publish corrected image
9. Publish diagnostics if requested

## Testing requirements

The implementation should be tested on real calibrated subframes exhibiting horizontal banding.

### Test cases
- Sparse star field with strong bright stars
- Dense star field
- Nebula field with broad low-frequency structure
- Frame with weak gradient
- Frame with strong gradient
- Frame with no obvious banding
- Frame without star mask
- Frame with inaccurate star mask
### Expected outcomes
- reduced row banding visibility
- minimal deformation of stellar cores and halos
- minimal flattening of real astrophysical structures
- stable behavior across extended iterative runs up to the configured iteration limit
### Required comparison outputs
- before / after
- difference image
- row residual before / after
- visual inspection of protected bright stars

## Future extensions

Not required for v1, but architecture should not block them:

- color / RGB support
- vertical banding support
- robust tilted-row support based on a new global geometry model
- automatic internal star detection
- integration with StarXTerminator output conventions
- structure protection from starless image
- wavelet-domain row residual modeling
- preview mode on ROI
- automatic parameter suggestion from diagnostics

### Deferred tilted-row support

Tilted-row support was considered and explicitly deferred from the current implementation.

Reasons:

- local curve-correlation is too fragile against stars, masking gaps, and real astrophysical structure
- a wrong auto-geometry estimate would feed directly into the correction and risk subtle image damage
- a future design should prefer a more globally constrained method instead of per-column offset fitting

## Prompting notes for implementation agent

The implementation agent must:

- implement this as a PJSR PixInsight script package with process-instance export support
- expose it through a process dialog
- provide detailed tooltips for every UI control
- keep the code modular and readable
- make each major adjustment individually enable-able
- add diagnostic outputs to facilitate algorithm tuning
- avoid destructive use of the soft 2D background model
- prefer conservative defaults
- keep comments in English
- keep UI strings in English unless requested otherwise

## Optional assets available during implementation

The implementation may rely on:

- real test frames supplied by the user
- an MCP bridge to a local PixInsight instance, if available
- iterative tuning based on diagnostics exported by the first implementation
