var RBC_ROW_ESTIMATORS = [ "Median", "TrimmedMean", "WinsorizedMean" ];
var RBC_VISIBILITY_MODES = [ "HighPassResidual", "FirstDerivative", "SecondDerivative", "LocalMAD" ];
var RBC_KERNEL_TYPES = [ "Gaussian", "Triangular", "Box" ];
var RBC_CLIPPING_POLICIES = [ "ClampLow", "Clamp01", "None" ];
var RBC_CONVERGENCE_EPSILON_MIN = 1.0e-7;
var RBC_CONVERGENCE_EPSILON_MAX = 1.0e-3;
var RBC_CONVERGENCE_EXPONENTS = [ -3, -4, -5, -6, -7 ];

var RBC_TOOLTIPS = {
   targetViewId:
      "<p>Select the linear monochrome subframe to correct. The process assumes the image " +
      "still preserves the original sensor row orientation.</p>" +
      "<p>Running on registered, rotated or stretched data can make the row model unreliable.</p>",

   starMaskViewId:
      "<p>Optional external star mask used to exclude stars from row-background estimation and " +
      "to protect stars while corrections are applied.</p>" +
      "<p>Use this when you already have a reliable mask. Disable star-dependent features if the mask is inaccurate.</p>",

   starsOnlyViewId:
      "<p>Optional stars-only image used to derive star influence and, if needed, an internal mask.</p>" +
      "<p>This is useful when the banding seems strongly correlated with bright stars. Leave empty if unavailable.</p>",

   enableSoftBackgroundModel:
      "<p>Builds a very soft internal 2D background support model before measuring rows. This helps keep broad gradients " +
      "from biasing the row profile.</p>" +
      "<p>Increasing reliance on this option stabilizes measurements on gradient-heavy frames, but if pushed too far it can " +
      "start following real large-scale structure. Disable it if the image background is already flat.</p>",

   enableRowTrendCorrection:
      "<p>Enables the main row-trend model and residual-based correction. This is the core banding-removal stage.</p>" +
      "<p>Disable it only for diagnostics or to inspect the other modulation signals without applying a row correction.</p>",

   enableStarInfluence:
      "<p>Modulates the correction strength on rows influenced by detected or masked stars.</p>" +
      "<p>Increase this only when the defect is visibly amplified near bright stars. Disable it if the mask or stars-only input is poor.</p>",

   enableRowVisibility:
      "<p>Emphasizes rows whose residual pattern looks visually prominent in the 1D profile.</p>" +
      "<p>Higher values can make the process react more strongly to obvious banding, but may also overreact to legitimate structure.</p>",

   enableConfidenceWeighting:
      "<p>Reduces correction on rows with weak measurement support, for example rows with too many masked pixels or interpolated estimates.</p>" +
      "<p>Disable this if you prefer a uniform correction even in crowded fields, but expect more risk of local overcorrection.</p>",

   enableProtectionMask:
      "<p>Attenuates the applied correction in protected regions, usually stars and bright halos.</p>" +
      "<p>Stronger protection preserves stellar profiles better, but leaves more residual banding where stars dominate the row.</p>",

   enableIterations:
      "<p>Runs several conservative passes instead of one aggressive pass. This is generally safer for weak banding defects.</p>" +
      "<p>More iterations can converge more cleanly, but they also increase runtime and can slowly flatten real signal if parameters are too strong.</p>",

   enableConvergence:
      "<p>Stops iterative processing early when the row residual no longer changes meaningfully.</p>" +
      "<p>Disable this if you want the process to always run the full number of configured iterations, regardless of residual change.</p>",

   enableDiagnostics:
      "<p>Enables creation of optional diagnostic views. Use this while tuning the process or validating behavior on new datasets.</p>" +
      "<p>Disable diagnostics for routine use to reduce clutter and execution overhead.</p>",

   maskThreshold:
      "<p>Threshold used to convert the external mask or stars-only image into an internal binary support map.</p>" +
      "<p>Higher values restrict the mask to brighter cores; lower values include more halos and small stars. Too low a value can remove too much background support.</p>",

   maskDilationRadius:
      "<p>Expands the exclusion mask around detected star pixels before row-background measurement.</p>" +
      "<p>Increasing this removes more stellar halo contamination, but if set too high it can leave too few valid pixels on crowded rows.</p>",

   maskBlurRadius:
      "<p>Blurs the protection mask used during correction application. This creates softer attenuation around stars and halos.</p>" +
      "<p>Larger values provide gentler transitions, but can spread protection too far into nearby background.</p>",

   minimumStarArea:
      "<p>Minimum detected star size, in pixels, for star-object analysis.</p>" +
      "<p>Increase it to reject tiny artifacts and hot-pixel remnants. Lower it if real small stars are being ignored.</p>",

   brightnessThreshold:
      "<p>Minimum normalized peak level used to keep a detected object in the star catalog.</p>" +
      "<p>Higher values bias the influence model toward only bright stars; lower values include fainter stars and increase sensitivity to mask noise.</p>",

   saturationThreshold:
      "<p>Normalized pixel value above which a star pixel is considered saturated for scoring purposes.</p>" +
      "<p>Lowering this makes the process treat more stars as saturation-heavy. Set it too low and ordinary bright stars can be overweighted.</p>",

   starPeakWeight:
      "<p>Weight assigned to normalized star peak intensity in the star influence score.</p>" +
      "<p>Raise this when the defect is mostly triggered by bright stellar cores. Excessive weighting can overboost corrections near a few bright stars.</p>",

   starFluxWeight:
      "<p>Weight assigned to integrated star flux in the star influence score.</p>" +
      "<p>Higher values make extended bright stars and halos contribute more strongly to row influence.</p>",

   starSaturationWeight:
      "<p>Weight assigned to star saturation ratio in the influence score.</p>" +
      "<p>Use this if the banding worsens around saturated stars. Too much weight can produce uneven behavior in star-rich frames.</p>",

   starRadiusWeight:
      "<p>Weight assigned to effective star radius in the influence score.</p>" +
      "<p>Increase it when halo size matters more than core brightness. Disable or reduce it if broad masks are exaggerating influence.</p>",

   starInfluenceRadius:
      "<p>Vertical spread of each star's influence, measured in rows.</p>" +
      "<p>Larger values affect more neighboring rows and can capture broader readout effects, but they also make the modulation less localized.</p>",

   starInfluenceKernelType:
      "<p>Kernel used to spread each star score into neighboring rows.</p>" +
      "<p>Gaussian is the softest option, triangular is more localized, and box is the simplest but least natural.</p>",

   backgroundSamplingScale:
      "<p>Sampling scale, in pixels, for the coarse internal 2D background support grid.</p>" +
      "<p>Larger values make the background model coarser and more conservative. Smaller values follow gradients more closely but risk fitting real structure.</p>",

   backgroundSmoothingStrength:
      "<p>Strength of Gaussian smoothing applied to the coarse background grid.</p>" +
      "<p>Higher values keep the model focused on only very broad gradients. Too little smoothing can leave cell-scale structure in the support model and let it track unwanted medium-scale image content.</p>",

   rowEstimatorType:
      "<p>Robust estimator used to measure the background level of each row from unmasked pixels.</p>" +
      "<p>Median is the most conservative, trimmed mean is usually a good compromise, and winsorized mean can be smoother but slightly less resistant to contamination.</p>",

   lowRejectQuantile:
      "<p>Lower quantile rejected before trimmed or winsorized row statistics are computed.</p>" +
      "<p>Increase it to suppress unusually dark outliers, but excessive rejection can bias rows with low signal or clipped backgrounds.</p>",

   highRejectQuantile:
      "<p>Upper quantile rejected before trimmed or winsorized row statistics are computed.</p>" +
      "<p>Higher values reject more bright contamination from imperfect masks, but too much rejection can remove legitimate background support on star-rich rows.</p>",

   minimumValidPixelsPerRow:
      "<p>Minimum number of unmasked pixels required before a row is considered directly measurable.</p>" +
      "<p>Raise this to demand stronger support. Lower it if many crowded rows are being interpolated, but expect less reliable confidence estimates.</p>",

   rowTrendSmoothingRadius:
      "<p>Smoothing radius, in rows, for the low-frequency row trend.</p>" +
      "<p>Larger values keep the baseline very conservative and prevent following oscillatory banding. Smaller values track broader real row changes more closely.</p>",

   visibilityMode:
      "<p>Method used to estimate how visually salient the row residual is.</p>" +
      "<p>LocalMAD is usually the most balanced default. Derivative modes are sharper but can react strongly to isolated residual changes.</p>",

   visibilitySmoothingRadius:
      "<p>Smoothing radius, in rows, applied to the visibility profile.</p>" +
      "<p>Higher values make visibility modulation more stable and broad. Smaller values make it more responsive but also noisier.</p>",

   visibilityStrength:
      "<p>Controls how strongly the visibility profile boosts the base row correction.</p>" +
      "<p>Increase cautiously. Excessive values can cause the process to chase residual structure that is not true banding.</p>",

   confidenceStrength:
      "<p>Controls how strongly low-confidence rows are attenuated in the final correction.</p>" +
      "<p>Higher values are safer in crowded or weakly supported rows, but may leave some residual banding behind.</p>",

   globalStrength:
      "<p>Overall amplitude of the base row correction derived from the residual profile.</p>" +
      "<p>Higher values remove banding more aggressively, but can also flatten very weak real row-scale structure if overused.</p>",

   localStarBoost:
      "<p>Additional multiplicative boost applied on rows with strong star influence.</p>" +
      "<p>Useful when bright stars clearly trigger or amplify the defect. Too much boost can create uneven local corrections in dense star fields.</p>",

   protectionStrength:
      "<p>Strength of attenuation applied by the protection mask when writing corrected pixels.</p>" +
      "<p>Higher values preserve stellar cores and halos better, but reduce cleanup effectiveness around those same structures.</p>",

   maximumPerIterationCorrection:
      "<p>Absolute cap applied to each row correction value per iteration.</p>" +
      "<p>Use this as a safety limit. Lower caps make the process conservative; higher caps increase the risk of sign inversion and overcorrection artifacts.</p>",

   clippingPolicy:
      "<p>Controls how corrected pixel values are clipped after additive row subtraction.</p>" +
      "<p>ClampLow prevents negative values, Clamp01 forces the standard normalized range, and None leaves values untouched for maximum fidelity.</p>",

   iterations:
      "<p>Maximum number of conservative correction passes.</p>" +
      "<p>Use higher values when the process is configured to converge gradually. More iterations increase runtime and can slowly accumulate bias if the model is too aggressive.</p>",

   convergenceEpsilon:
      "<p>Early-stop threshold for iterative convergence. The process requires both a small inter-iteration residual change and a small remaining row-residual amplitude before stopping early.</p>" +
      "<p>The value is edited as a mantissa and base-10 exponent, over a bounded range from 1e-7 to 1e-3. Smaller values force more iterations. Larger values stop earlier but may leave some correctable residual behind.</p>",

   recomputeMasksEachIteration:
      "<p>Rebuilds internal masks after each pass using the current corrected image state.</p>" +
      "<p>This can help if star support changes significantly during correction, but it increases runtime and may introduce iteration-to-iteration variability.</p>",

   recomputeStarInfluenceEachIteration:
      "<p>Recomputes the star catalog and row influence after each pass.</p>" +
      "<p>Normally unnecessary when the external mask is stable. Enable it for experimentation or when the stars-only input changes meaningfully after correction.</p>",

   outputSoftBackgroundModel:
      "<p>Creates a diagnostic view of the soft internal 2D background model from the last iteration.</p>" +
      "<p>Use this to confirm the model is following only very broad gradients and not fitting the banding itself.</p>",

   outputWorkingImage:
      "<p>Creates a diagnostic working image after subtracting the soft background support model.</p>" +
      "<p>This is useful to verify whether large-scale gradients have been reduced without damaging real image structure.</p>",

   outputDifferenceImage:
      "<p>Creates a difference image equal to corrected minus original.</p>" +
      "<p>Inspect this carefully to see where the process actually changed the data and whether stars or nebulosity were affected.</p>",

   outputRowBackgroundPlot:
      "<p>Creates a diagnostic plot view of the measured row background profile.</p>" +
      "<p>Use it to confirm masked stellar rows are still being measured sensibly and to spot rows with weak support.</p>",

   outputRowTrendPlot:
      "<p>Creates a diagnostic plot view of the smoothed low-frequency row trend.</p>" +
      "<p>The trend should be conservative and should not follow the row banding itself too closely.</p>",

   outputRowResidualPlot:
      "<p>Creates a diagnostic plot view of the raw row residual before modulation.</p>" +
      "<p>This is the primary 1D banding signal and the best place to inspect convergence across iterations.</p>",

   outputRowInfluencePlot:
      "<p>Creates a diagnostic plot view of the normalized star influence profile on a fixed [0,1] scale.</p>" +
      "<p>Use it to confirm that only the intended star-affected rows receive extra weighting. If no star support image is provided in v1, this plot will be flat zero.</p>",

   outputRowVisibilityPlot:
      "<p>Creates a diagnostic plot view of the row visibility or salience profile.</p>" +
      "<p>If this plot looks noisy or tracks real image structure, reduce visibility sensitivity or disable the block.</p>",

   outputRowConfidencePlot:
      "<p>Creates a diagnostic plot view of row confidence values.</p>" +
      "<p>Low-confidence sections usually correspond to crowded or weakly supported rows and explain why some corrections are attenuated.</p>",

   outputRowCorrectionPlot:
      "<p>Creates a diagnostic plot view of the final row correction vector from the last iteration.</p>" +
      "<p>Inspect its amplitude and sign carefully to verify the final modulation remains conservative.</p>"
};

function rbcTooltip( key )
{
   return RBC_TOOLTIPS.hasOwnProperty( key ) ? RBC_TOOLTIPS[ key ] : "";
}

function RowBandingCompensationParameters()
{
   this.reset = function()
   {
      this.targetViewId = "";
      this.starMaskViewId = "";
      this.starsOnlyViewId = "";

      this.enableSoftBackgroundModel = true;
      this.enableRowTrendCorrection = true;
      this.enableStarInfluence = true;
      this.enableRowVisibility = true;
      this.enableConfidenceWeighting = true;
      this.enableProtectionMask = true;
      this.enableIterations = true;
      this.enableConvergence = true;
      this.enableDiagnostics = false;

      this.maskThreshold = 0.15;
      this.maskDilationRadius = 3;
      this.maskBlurRadius = 2.0;

      this.minimumStarArea = 5;
      this.brightnessThreshold = 0.20;
      this.saturationThreshold = 0.90;
      this.starPeakWeight = 0.40;
      this.starFluxWeight = 0.35;
      this.starSaturationWeight = 0.15;
      this.starRadiusWeight = 0.10;
      this.starInfluenceRadius = 2;
      this.starInfluenceKernelType = "Gaussian";

      this.backgroundSamplingScale = 128;
      this.backgroundSmoothingStrength = 4;

      this.rowEstimatorType = "TrimmedMean";
      this.lowRejectQuantile = 0.05;
      this.highRejectQuantile = 0.10;
      this.minimumValidPixelsPerRow = 64;
      this.rowTrendSmoothingRadius = 15;

      this.visibilityMode = "LocalMAD";
      this.visibilitySmoothingRadius = 5;
      this.visibilityStrength = 0.50;

      this.confidenceStrength = 0.50;

      this.globalStrength = 1.00;
      this.localStarBoost = 0.50;
      this.protectionStrength = 0.75;
      this.maximumPerIterationCorrection = 0.02;
      this.clippingPolicy = "ClampLow";

      this.iterations = 30;
      this.convergenceEpsilon = 0.00005;
      this.recomputeMasksEachIteration = false;
      this.recomputeStarInfluenceEachIteration = false;

      this.outputSoftBackgroundModel = false;
      this.outputWorkingImage = false;
      this.outputDifferenceImage = true;
      this.outputRowBackgroundPlot = false;
      this.outputRowTrendPlot = false;
      this.outputRowResidualPlot = true;
      this.outputRowInfluencePlot = false;
      this.outputRowVisibilityPlot = false;
      this.outputRowConfidencePlot = false;
      this.outputRowCorrectionPlot = true;
   };

   this.ensureValid = function()
   {
      this.targetViewId = this.targetViewId != null ? this.targetViewId.trim() : "";
      this.starMaskViewId = this.starMaskViewId != null ? this.starMaskViewId.trim() : "";
      this.starsOnlyViewId = this.starsOnlyViewId != null ? this.starsOnlyViewId.trim() : "";

      this.maskThreshold = rbcClamp( this.maskThreshold, 0, 1 );
      this.maskDilationRadius = Math.max( 0, Math.round( this.maskDilationRadius ) );
      this.maskBlurRadius = Math.max( 0, this.maskBlurRadius );

      this.minimumStarArea = Math.max( 1, Math.round( this.minimumStarArea ) );
      this.brightnessThreshold = rbcClamp( this.brightnessThreshold, 0, 1 );
      this.saturationThreshold = rbcClamp( this.saturationThreshold, 0.001, 1 );
      this.starPeakWeight = Math.max( 0, this.starPeakWeight );
      this.starFluxWeight = Math.max( 0, this.starFluxWeight );
      this.starSaturationWeight = Math.max( 0, this.starSaturationWeight );
      this.starRadiusWeight = Math.max( 0, this.starRadiusWeight );
      this.starInfluenceRadius = Math.max( 0, Math.round( this.starInfluenceRadius ) );
      if ( RBC_KERNEL_TYPES.indexOf( this.starInfluenceKernelType ) < 0 )
         this.starInfluenceKernelType = "Gaussian";

      this.backgroundSamplingScale = Math.max( 8, Math.round( this.backgroundSamplingScale ) );
      this.backgroundSmoothingStrength = Math.max( 0, Math.round( this.backgroundSmoothingStrength ) );

      if ( RBC_ROW_ESTIMATORS.indexOf( this.rowEstimatorType ) < 0 )
         this.rowEstimatorType = "TrimmedMean";
      this.lowRejectQuantile = rbcClamp( this.lowRejectQuantile, 0, 0.49 );
      this.highRejectQuantile = rbcClamp( this.highRejectQuantile, 0, 0.49 );
      if ( this.lowRejectQuantile + this.highRejectQuantile > 0.90 )
         this.highRejectQuantile = Math.max( 0, 0.90 - this.lowRejectQuantile );
      this.minimumValidPixelsPerRow = Math.max( 8, Math.round( this.minimumValidPixelsPerRow ) );
      this.rowTrendSmoothingRadius = Math.max( 1, Math.round( this.rowTrendSmoothingRadius ) );

      if ( RBC_VISIBILITY_MODES.indexOf( this.visibilityMode ) < 0 )
         this.visibilityMode = "LocalMAD";
      this.visibilitySmoothingRadius = Math.max( 0, Math.round( this.visibilitySmoothingRadius ) );
      this.visibilityStrength = Math.max( 0, this.visibilityStrength );

      this.confidenceStrength = Math.max( 0, this.confidenceStrength );

      this.globalStrength = Math.max( 0, this.globalStrength );
      this.localStarBoost = Math.max( 0, this.localStarBoost );
      this.protectionStrength = rbcClamp( this.protectionStrength, 0, 1 );
      this.maximumPerIterationCorrection = Math.max( 0, this.maximumPerIterationCorrection );
      if ( RBC_CLIPPING_POLICIES.indexOf( this.clippingPolicy ) < 0 )
         this.clippingPolicy = "ClampLow";

      this.iterations = rbcClamp( Math.round( this.iterations ), 1, 300 );
      this.convergenceEpsilon = rbcClamp( this.convergenceEpsilon, RBC_CONVERGENCE_EPSILON_MIN, RBC_CONVERGENCE_EPSILON_MAX );
   };

   this.importParameters = function()
   {
      if ( Parameters.has( "targetViewId" ) )
         this.targetViewId = Parameters.getString( "targetViewId" );
      if ( Parameters.has( "starMaskViewId" ) )
         this.starMaskViewId = Parameters.getString( "starMaskViewId" );
      if ( Parameters.has( "starsOnlyViewId" ) )
         this.starsOnlyViewId = Parameters.getString( "starsOnlyViewId" );

      if ( Parameters.has( "enableSoftBackgroundModel" ) )
         this.enableSoftBackgroundModel = Parameters.getBoolean( "enableSoftBackgroundModel" );
      if ( Parameters.has( "enableRowTrendCorrection" ) )
         this.enableRowTrendCorrection = Parameters.getBoolean( "enableRowTrendCorrection" );
      if ( Parameters.has( "enableStarInfluence" ) )
         this.enableStarInfluence = Parameters.getBoolean( "enableStarInfluence" );
      if ( Parameters.has( "enableRowVisibility" ) )
         this.enableRowVisibility = Parameters.getBoolean( "enableRowVisibility" );
      if ( Parameters.has( "enableConfidenceWeighting" ) )
         this.enableConfidenceWeighting = Parameters.getBoolean( "enableConfidenceWeighting" );
      if ( Parameters.has( "enableProtectionMask" ) )
         this.enableProtectionMask = Parameters.getBoolean( "enableProtectionMask" );
      if ( Parameters.has( "enableIterations" ) )
         this.enableIterations = Parameters.getBoolean( "enableIterations" );
      if ( Parameters.has( "enableConvergence" ) )
         this.enableConvergence = Parameters.getBoolean( "enableConvergence" );
      if ( Parameters.has( "enableDiagnostics" ) )
         this.enableDiagnostics = Parameters.getBoolean( "enableDiagnostics" );

      if ( Parameters.has( "maskThreshold" ) )
         this.maskThreshold = Parameters.getReal( "maskThreshold" );
      if ( Parameters.has( "maskDilationRadius" ) )
         this.maskDilationRadius = Parameters.getInteger( "maskDilationRadius" );
      if ( Parameters.has( "maskBlurRadius" ) )
         this.maskBlurRadius = Parameters.getReal( "maskBlurRadius" );

      if ( Parameters.has( "minimumStarArea" ) )
         this.minimumStarArea = Parameters.getInteger( "minimumStarArea" );
      if ( Parameters.has( "brightnessThreshold" ) )
         this.brightnessThreshold = Parameters.getReal( "brightnessThreshold" );
      if ( Parameters.has( "saturationThreshold" ) )
         this.saturationThreshold = Parameters.getReal( "saturationThreshold" );
      if ( Parameters.has( "starPeakWeight" ) )
         this.starPeakWeight = Parameters.getReal( "starPeakWeight" );
      if ( Parameters.has( "starFluxWeight" ) )
         this.starFluxWeight = Parameters.getReal( "starFluxWeight" );
      if ( Parameters.has( "starSaturationWeight" ) )
         this.starSaturationWeight = Parameters.getReal( "starSaturationWeight" );
      if ( Parameters.has( "starRadiusWeight" ) )
         this.starRadiusWeight = Parameters.getReal( "starRadiusWeight" );
      if ( Parameters.has( "starInfluenceRadius" ) )
         this.starInfluenceRadius = Parameters.getInteger( "starInfluenceRadius" );
      if ( Parameters.has( "starInfluenceKernelType" ) )
         this.starInfluenceKernelType = Parameters.getString( "starInfluenceKernelType" );

      if ( Parameters.has( "backgroundSamplingScale" ) )
         this.backgroundSamplingScale = Parameters.getInteger( "backgroundSamplingScale" );
      if ( Parameters.has( "backgroundSmoothingStrength" ) )
         this.backgroundSmoothingStrength = Parameters.getInteger( "backgroundSmoothingStrength" );

      if ( Parameters.has( "rowEstimatorType" ) )
         this.rowEstimatorType = Parameters.getString( "rowEstimatorType" );
      if ( Parameters.has( "lowRejectQuantile" ) )
         this.lowRejectQuantile = Parameters.getReal( "lowRejectQuantile" );
      if ( Parameters.has( "highRejectQuantile" ) )
         this.highRejectQuantile = Parameters.getReal( "highRejectQuantile" );
      if ( Parameters.has( "minimumValidPixelsPerRow" ) )
         this.minimumValidPixelsPerRow = Parameters.getInteger( "minimumValidPixelsPerRow" );
      if ( Parameters.has( "rowTrendSmoothingRadius" ) )
         this.rowTrendSmoothingRadius = Parameters.getInteger( "rowTrendSmoothingRadius" );

      if ( Parameters.has( "visibilityMode" ) )
         this.visibilityMode = Parameters.getString( "visibilityMode" );
      if ( Parameters.has( "visibilitySmoothingRadius" ) )
         this.visibilitySmoothingRadius = Parameters.getInteger( "visibilitySmoothingRadius" );
      if ( Parameters.has( "visibilityStrength" ) )
         this.visibilityStrength = Parameters.getReal( "visibilityStrength" );

      if ( Parameters.has( "confidenceStrength" ) )
         this.confidenceStrength = Parameters.getReal( "confidenceStrength" );

      if ( Parameters.has( "globalStrength" ) )
         this.globalStrength = Parameters.getReal( "globalStrength" );
      if ( Parameters.has( "localStarBoost" ) )
         this.localStarBoost = Parameters.getReal( "localStarBoost" );
      if ( Parameters.has( "protectionStrength" ) )
         this.protectionStrength = Parameters.getReal( "protectionStrength" );
      if ( Parameters.has( "maximumPerIterationCorrection" ) )
         this.maximumPerIterationCorrection = Parameters.getReal( "maximumPerIterationCorrection" );
      if ( Parameters.has( "clippingPolicy" ) )
         this.clippingPolicy = Parameters.getString( "clippingPolicy" );

      if ( Parameters.has( "iterations" ) )
         this.iterations = Parameters.getInteger( "iterations" );
      if ( Parameters.has( "convergenceEpsilon" ) )
         this.convergenceEpsilon = Parameters.getReal( "convergenceEpsilon" );
      if ( Parameters.has( "recomputeMasksEachIteration" ) )
         this.recomputeMasksEachIteration = Parameters.getBoolean( "recomputeMasksEachIteration" );
      if ( Parameters.has( "recomputeStarInfluenceEachIteration" ) )
         this.recomputeStarInfluenceEachIteration = Parameters.getBoolean( "recomputeStarInfluenceEachIteration" );

      if ( Parameters.has( "outputSoftBackgroundModel" ) )
         this.outputSoftBackgroundModel = Parameters.getBoolean( "outputSoftBackgroundModel" );
      if ( Parameters.has( "outputWorkingImage" ) )
         this.outputWorkingImage = Parameters.getBoolean( "outputWorkingImage" );
      if ( Parameters.has( "outputDifferenceImage" ) )
         this.outputDifferenceImage = Parameters.getBoolean( "outputDifferenceImage" );
      if ( Parameters.has( "outputRowBackgroundPlot" ) )
         this.outputRowBackgroundPlot = Parameters.getBoolean( "outputRowBackgroundPlot" );
      if ( Parameters.has( "outputRowTrendPlot" ) )
         this.outputRowTrendPlot = Parameters.getBoolean( "outputRowTrendPlot" );
      if ( Parameters.has( "outputRowResidualPlot" ) )
         this.outputRowResidualPlot = Parameters.getBoolean( "outputRowResidualPlot" );
      if ( Parameters.has( "outputRowInfluencePlot" ) )
         this.outputRowInfluencePlot = Parameters.getBoolean( "outputRowInfluencePlot" );
      if ( Parameters.has( "outputRowVisibilityPlot" ) )
         this.outputRowVisibilityPlot = Parameters.getBoolean( "outputRowVisibilityPlot" );
      if ( Parameters.has( "outputRowConfidencePlot" ) )
         this.outputRowConfidencePlot = Parameters.getBoolean( "outputRowConfidencePlot" );
      if ( Parameters.has( "outputRowCorrectionPlot" ) )
         this.outputRowCorrectionPlot = Parameters.getBoolean( "outputRowCorrectionPlot" );

      this.ensureValid();
   };

   this.exportParameters = function()
   {
      Parameters.clear();

      Parameters.set( "targetViewId", this.targetViewId );
      Parameters.set( "starMaskViewId", this.starMaskViewId );
      Parameters.set( "starsOnlyViewId", this.starsOnlyViewId );

      Parameters.set( "enableSoftBackgroundModel", this.enableSoftBackgroundModel );
      Parameters.set( "enableRowTrendCorrection", this.enableRowTrendCorrection );
      Parameters.set( "enableStarInfluence", this.enableStarInfluence );
      Parameters.set( "enableRowVisibility", this.enableRowVisibility );
      Parameters.set( "enableConfidenceWeighting", this.enableConfidenceWeighting );
      Parameters.set( "enableProtectionMask", this.enableProtectionMask );
      Parameters.set( "enableIterations", this.enableIterations );
      Parameters.set( "enableConvergence", this.enableConvergence );
      Parameters.set( "enableDiagnostics", this.enableDiagnostics );

      Parameters.set( "maskThreshold", this.maskThreshold );
      Parameters.set( "maskDilationRadius", this.maskDilationRadius );
      Parameters.set( "maskBlurRadius", this.maskBlurRadius );

      Parameters.set( "minimumStarArea", this.minimumStarArea );
      Parameters.set( "brightnessThreshold", this.brightnessThreshold );
      Parameters.set( "saturationThreshold", this.saturationThreshold );
      Parameters.set( "starPeakWeight", this.starPeakWeight );
      Parameters.set( "starFluxWeight", this.starFluxWeight );
      Parameters.set( "starSaturationWeight", this.starSaturationWeight );
      Parameters.set( "starRadiusWeight", this.starRadiusWeight );
      Parameters.set( "starInfluenceRadius", this.starInfluenceRadius );
      Parameters.set( "starInfluenceKernelType", this.starInfluenceKernelType );

      Parameters.set( "backgroundSamplingScale", this.backgroundSamplingScale );
      Parameters.set( "backgroundSmoothingStrength", this.backgroundSmoothingStrength );

      Parameters.set( "rowEstimatorType", this.rowEstimatorType );
      Parameters.set( "lowRejectQuantile", this.lowRejectQuantile );
      Parameters.set( "highRejectQuantile", this.highRejectQuantile );
      Parameters.set( "minimumValidPixelsPerRow", this.minimumValidPixelsPerRow );
      Parameters.set( "rowTrendSmoothingRadius", this.rowTrendSmoothingRadius );

      Parameters.set( "visibilityMode", this.visibilityMode );
      Parameters.set( "visibilitySmoothingRadius", this.visibilitySmoothingRadius );
      Parameters.set( "visibilityStrength", this.visibilityStrength );

      Parameters.set( "confidenceStrength", this.confidenceStrength );

      Parameters.set( "globalStrength", this.globalStrength );
      Parameters.set( "localStarBoost", this.localStarBoost );
      Parameters.set( "protectionStrength", this.protectionStrength );
      Parameters.set( "maximumPerIterationCorrection", this.maximumPerIterationCorrection );
      Parameters.set( "clippingPolicy", this.clippingPolicy );

      Parameters.set( "iterations", this.iterations );
      Parameters.set( "convergenceEpsilon", this.convergenceEpsilon );
      Parameters.set( "recomputeMasksEachIteration", this.recomputeMasksEachIteration );
      Parameters.set( "recomputeStarInfluenceEachIteration", this.recomputeStarInfluenceEachIteration );

      Parameters.set( "outputSoftBackgroundModel", this.outputSoftBackgroundModel );
      Parameters.set( "outputWorkingImage", this.outputWorkingImage );
      Parameters.set( "outputDifferenceImage", this.outputDifferenceImage );
      Parameters.set( "outputRowBackgroundPlot", this.outputRowBackgroundPlot );
      Parameters.set( "outputRowTrendPlot", this.outputRowTrendPlot );
      Parameters.set( "outputRowResidualPlot", this.outputRowResidualPlot );
      Parameters.set( "outputRowInfluencePlot", this.outputRowInfluencePlot );
      Parameters.set( "outputRowVisibilityPlot", this.outputRowVisibilityPlot );
      Parameters.set( "outputRowConfidencePlot", this.outputRowConfidencePlot );
      Parameters.set( "outputRowCorrectionPlot", this.outputRowCorrectionPlot );
   };

   this.reset();
}
