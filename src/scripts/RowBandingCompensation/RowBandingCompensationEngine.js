function RowBandingCompensationEngine( parameters )
{
   this.parameters = parameters;
   this.maskBuilder = new RowBandingCompensationMaskBuilder( parameters );
   this.starAnalyzer = new RowBandingCompensationStarAnalyzer( parameters );
   this.profileEstimator = new RowBandingCompensationProfileEstimator( parameters );
   this.correctionApplier = new RowBandingCompensationCorrectionApplier( parameters );
   this.diagnosticsExporter = new RowBandingCompensationDiagnosticsExporter( parameters );

   this.execute = function( explicitTargetView )
   {
      var executionStart = rbcNowMilliseconds();
      var targetView = this.resolveTargetView( explicitTargetView );
      this.validateTargetView( targetView );

      this.parameters.targetViewId = targetView.id;
      this.parameters.ensureValid();

      var starMaskView = rbcFindViewById( this.parameters.starMaskViewId );
      var starsOnlyView = rbcFindViewById( this.parameters.starsOnlyViewId );

      var originalImage = rbcGrayImageFromView( targetView );
      var currentImage = rbcCopyImage( originalImage );
      var targetId = targetView.id;

      this.logExecutionContext( targetView, starMaskView, starsOnlyView );
      rbcLogProgress( format(
         "Target geometry: %d x %d (%.2f MPix)",
         originalImage.width,
         originalImage.height,
         (originalImage.width * originalImage.height) / 1000000 ) );
      this.warnIfImageLooksNonLinear( originalImage );

      if ( !this.parameters.enableRowTrendCorrection )
         console.warningln( "<end><cbr>Row trend correction is disabled. The process will compute diagnostics but no effective row correction will be generated." );

      if ( (this.parameters.enableStarInfluence || this.parameters.enableProtectionMask) && starMaskView == null && starsOnlyView == null )
         console.warningln( "<end><cbr>No external star support image was provided. In v1, star-dependent features are disabled, so rowInfluence will be flat zero and no protection mask will be applied." );

      var convergenceFloorSelected = this.parameters.enableConvergence &&
         this.parameters.convergenceEpsilon <= RBC_CONVERGENCE_EPSILON_MIN;
      if ( this.parameters.enableIterations )
      {
         if ( !this.parameters.enableConvergence )
            console.writeln( "Convergence stop: disabled; the full iteration count will be used." );
         else if ( convergenceFloorSelected )
            console.writeln( "Convergence stop: epsilon is at the 32-bit floor; early stop is suppressed and the full iteration count will be used." );
      }

      var iterations = this.parameters.enableIterations ? Math.max( 1, this.parameters.iterations ) : 1;
      var previousResidual = null;
      var previousResidualRms = null;
      var consecutiveResidualRmsIncreaseCount = 0;
      var finalMaskSet = null;
      var finalProfileData = null;
      var finalInfluence = this.profileEstimator.zeroProfile( currentImage.height );
      var finalBackgroundModel = null;

      for ( var iteration = 0; iteration < iterations; ++iteration )
      {
         var iterationStart = rbcNowMilliseconds();
         console.noteln( format( "<end><cbr>Iteration %d/%d", iteration + 1, iterations ) );

         var rebuildMask = finalMaskSet == null || this.parameters.recomputeMasksEachIteration;
         if ( rebuildMask )
         {
            if ( starMaskView != null || starsOnlyView != null )
               rbcLogProgress( "Building star support masks..." );
            finalMaskSet = this.maskBuilder.build( starMaskView, starsOnlyView );
            if ( finalMaskSet.hasMask )
               rbcLogProgress( "Star support masks ready." );
         }

         var starAnalysis = (iteration == 0 || this.parameters.recomputeStarInfluenceEachIteration)
            ? this.runTimedStep(
               "Analyzing star support",
               function()
               {
                  return this.starAnalyzer.analyze( finalMaskSet, currentImage.height );
               }.bind( this ) )
            : { starObjects: [], rowInfluence: finalInfluence, usedFallbackProfile: false };

         if ( iteration == 0 || this.parameters.recomputeStarInfluenceEachIteration )
         {
            finalInfluence = starAnalysis.rowInfluence;
            if ( this.parameters.enableStarInfluence )
            {
               if ( !finalMaskSet.hasMask )
                  console.writeln( "Row influence profile: flat zero because no star support input is available." );
               else if ( starAnalysis.usedFallbackProfile )
                  console.writeln( "Detected star objects: 0; using mask-occupancy fallback influence profile." );
               else
                  console.writeln( "Detected star objects: " + starAnalysis.starObjects.length );
            }
         }

         finalBackgroundModel = null;
         if ( this.parameters.enableSoftBackgroundModel )
         {
            finalBackgroundModel = this.runTimedStep(
               "Building soft background model",
               function()
               {
                  var model = new RowBandingCompensationBackgroundModel( this.parameters );
                  model.build( currentImage, finalMaskSet.hasMask ? finalMaskSet.exclusionImage : null );
                  return model;
               }.bind( this ) );
            rbcLogProgress( format(
               "Soft background grid: %d x %d nodes at %d px.",
               finalBackgroundModel.gridWidth,
               finalBackgroundModel.gridHeight,
               finalBackgroundModel.cellSize ) );
         }

         finalProfileData = this.runTimedStep(
            "Estimating row profiles",
            function()
            {
               return this.profileEstimator.estimate(
                  currentImage,
                  finalMaskSet.hasMask ? finalMaskSet.exclusionImage : null,
                  finalBackgroundModel,
                  finalInfluence );
            }.bind( this ) );

         console.writeln( "Rows with limited support: " + finalProfileData.insufficientRows );
         var residualRms = this.profileRms( finalProfileData.rowResidual );
         var residualRobustSigma = rbcRobustSigma( finalProfileData.rowResidual );
         var residualAbsP95 = rbcAbsQuantile( finalProfileData.rowResidual, 0.95 );
         var maxCorrection = rbcMaxAbs( finalProfileData.rowCorrection );
         console.writeln( "Residual RMS: " + rbcFormatMetric( residualRms ) );
         console.writeln( "Residual robust sigma: " + rbcFormatMetric( residualRobustSigma ) );
         console.writeln( "Residual |95%| amplitude: " + rbcFormatMetric( residualAbsP95 ) );
         console.writeln( "Max correction amplitude: " + rbcFormatMetric( maxCorrection ) );

         var stopForDivergence = false;
         if ( previousResidualRms != null )
         {
            if ( residualRms > previousResidualRms )
            {
               ++consecutiveResidualRmsIncreaseCount;
               console.warningln(
                  "<end><cbr>Residual RMS increased: " +
                  rbcFormatMetric( previousResidualRms ) +
                  " -> " +
                  rbcFormatMetric( residualRms ) +
                  format( " (%d/3 consecutive increases).", consecutiveResidualRmsIncreaseCount ) );
               if ( consecutiveResidualRmsIncreaseCount >= 3 )
               {
                  console.warningln(
                     "<end><cbr>Residual RMS has increased for 3 consecutive iterations. " +
                     "Stopping early to avoid divergence. Reduce global correction strength and/or maximum per-iteration correction." );
                  stopForDivergence = true;
               }
            }
            else
               consecutiveResidualRmsIncreaseCount = 0;
         }

         if ( stopForDivergence )
         {
            finalProfileData.rowCorrection = this.profileEstimator.zeroProfile( finalProfileData.rowCorrection.length );
            rbcLogProgress( "Iteration time: " + rbcFormatDuration( rbcNowMilliseconds() - iterationStart ) );
            break;
         }

         if ( this.parameters.enableRowTrendCorrection )
            this.runTimedStep(
               "Applying row correction",
               function()
               {
                  this.correctionApplier.apply(
                     currentImage,
                     finalProfileData.rowCorrection,
                     this.parameters.enableProtectionMask && finalMaskSet.hasMask ? finalMaskSet.protectionImage : null );
               }.bind( this ) );

         var converged = false;
         if ( previousResidual != null )
         {
            var rmsChange = rbcRmsDifference( previousResidual, finalProfileData.rowResidual );
            console.writeln( "Residual RMS change: " + rbcFormatMetric( rmsChange ) );
            if ( this.parameters.enableConvergence && !convergenceFloorSelected )
               converged = rmsChange <= this.parameters.convergenceEpsilon &&
                  residualAbsP95 <= this.parameters.convergenceEpsilon;
         }
         if ( this.parameters.enableConvergence &&
              !convergenceFloorSelected &&
              maxCorrection <= this.parameters.convergenceEpsilon &&
              residualAbsP95 <= this.parameters.convergenceEpsilon )
            converged = true;

         previousResidual = finalProfileData.rowResidual.slice( 0 );
         previousResidualRms = residualRms;
         rbcLogProgress( "Iteration time: " + rbcFormatDuration( rbcNowMilliseconds() - iterationStart ) );
         if ( converged )
         {
            console.noteln( "Convergence criterion reached." );
            break;
         }
      }

      rbcLogProgress( "Publishing corrected image..." );
      var correctedWindow = rbcWindowFromImage( currentImage, targetId + "_RBC" );
      correctedWindow.show();

      if ( this.parameters.enableDiagnostics )
         rbcLogProgress( "Exporting diagnostic products..." );
      this.diagnosticsExporter.exportIterationProducts(
         targetId,
         currentImage,
         originalImage,
         finalBackgroundModel,
         finalProfileData,
         finalInfluence );

      rbcLogProgress( "Total execution time: " + rbcFormatDuration( rbcNowMilliseconds() - executionStart ) );

      return {
         targetView: targetView,
         correctedWindow: correctedWindow,
         profileData: finalProfileData,
         rowInfluence: finalInfluence,
         backgroundModel: finalBackgroundModel,
         maskSet: finalMaskSet
      };
   };

   this.resolveTargetView = function( explicitTargetView )
   {
      if ( explicitTargetView != null )
         return explicitTargetView;

      if ( this.parameters.targetViewId.length > 0 )
      {
         var target = rbcFindViewById( this.parameters.targetViewId );
         if ( target != null )
            return target;
      }

      var activeWindow = ImageWindow.activeWindow;
      if ( activeWindow.isNull )
         throw new Error( "There is no active image window." );
      return activeWindow.currentView;
   };

   this.validateTargetView = function( targetView )
   {
      if ( targetView == null || !targetView.isView )
         throw new Error( "A valid target view is required." );
      if ( targetView.isPreview )
         throw new Error( TITLE + " does not support previews in version " + VERSION + "." );
      if ( targetView.image.numberOfChannels != 1 )
         throw new Error( TITLE + " currently supports monochrome images only. Extract a single channel first." );
      if ( targetView.image.width < 16 || targetView.image.height < 16 )
         throw new Error( "The target image is too small for row profile analysis." );
   };

   this.warnIfImageLooksNonLinear = function( image )
   {
      var median = image.median();
      var maximum = image.maximum();
      if ( median > 0.12 || (median > 0.05 && maximum > 0.98) )
         console.warningln( "<end><cbr>The target image appears stretched or non-linear. Results may be unreliable on non-linear data." );
   };

   this.logExecutionContext = function( targetView, starMaskView, starsOnlyView )
   {
      rbcConsoleHeader( TITLE + " " + VERSION );
      console.writeln( "Target view: " + targetView.id );
      console.writeln( "Star mask view: " + (starMaskView != null ? starMaskView.id : "<none>") );
      console.writeln( "Stars-only view: " + (starsOnlyView != null ? starsOnlyView.id : "<none>") );
      console.writeln( "Soft background model: " + this.parameters.enableSoftBackgroundModel );
      console.writeln( "Iterations enabled: " + this.parameters.enableIterations );
      console.writeln( "Convergence stop enabled: " + this.parameters.enableConvergence );
      if ( this.parameters.enableConvergence )
         console.writeln( "Convergence epsilon: " + rbcFormatMetric( this.parameters.convergenceEpsilon ) );
      console.writeln( "Diagnostics enabled: " + this.parameters.enableDiagnostics );
   };

   this.profileRms = function( profile )
   {
      if ( profile.length == 0 )
         return 0;
      var sum = 0;
      for ( var i = 0; i < profile.length; ++i )
         sum += profile[ i ] * profile[ i ];
      return Math.sqrt( sum / profile.length );
   };

   this.runTimedStep = function( label, callback )
   {
      var start = rbcNowMilliseconds();
      rbcLogProgress( label + "..." );
      var result = callback();
      rbcLogProgress( label + " completed in " + rbcFormatDuration( rbcNowMilliseconds() - start ) + "." );
      return result;
   };
}
