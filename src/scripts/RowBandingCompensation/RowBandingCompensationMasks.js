function RowBandingCompensationMaskSet()
{
   this.baseImage = null;
   this.analysisImage = null;
   this.exclusionImage = null;
   this.protectionImage = null;
   this.hasMask = false;
   this.sourceLabel = "";
}

function RowBandingCompensationMaskBuilder( parameters )
{
   this.parameters = parameters;

   this.build = function( starMaskView, starsOnlyView )
   {
      var maskSet = new RowBandingCompensationMaskSet();

      var sourceView = null;
      if ( starMaskView != null )
      {
         sourceView = starMaskView;
         maskSet.sourceLabel = "star mask";
      }
      else if ( starsOnlyView != null )
      {
         sourceView = starsOnlyView;
         maskSet.sourceLabel = "stars-only image";
      }
      else
         return maskSet;

      maskSet.baseImage = rbcGrayImageFromView( sourceView );
      rbcNormalizeImage( maskSet.baseImage );

      maskSet.analysisImage = rbcCopyImage( maskSet.baseImage );
      maskSet.exclusionImage = this.buildExclusionMask( maskSet.baseImage );
      maskSet.protectionImage = this.buildProtectionMask( maskSet.baseImage );
      maskSet.hasMask = true;

      return maskSet;
   };

   this.buildExclusionMask = function( baseImage )
   {
      var exclusionImage = rbcCopyImage( baseImage );
      rbcApplyThresholdToImage( exclusionImage, this.parameters.maskThreshold );

      if ( this.parameters.maskDilationRadius > 0 )
      {
         var exclusionWindow = rbcWindowFromImage( exclusionImage, "RBC_exclusion_tmp" );
         var dilation = new MorphologicalTransformation;
         dilation.operator = MorphologicalTransformation.prototype.Dilation;
         dilation.interlacingDistance = 1;
         dilation.lowThreshold = 0;
         dilation.highThreshold = 0;
         dilation.numberOfIterations = 1;
         dilation.amount = 1;
         dilation.selectionPoint = 0.5;
         dilation.structureName = "";
         dilation.structureSize = this.parameters.maskDilationRadius * 2 + 1;
         dilation.structureWayTable = rbcCreateCircularStructure( this.parameters.maskDilationRadius );
         dilation.executeOn( exclusionWindow.mainView );

         exclusionImage = rbcCopyImage( exclusionWindow.mainView.image );
         exclusionWindow.forceClose();
      }

      exclusionImage.truncate( 0, 1 );
      return exclusionImage;
   };

   this.buildProtectionMask = function( baseImage )
   {
      var protectionImage = rbcCopyImage( baseImage );

      if ( this.parameters.maskBlurRadius > 0 )
      {
         var protectionWindow = rbcWindowFromImage( protectionImage, "RBC_protection_tmp" );
         var blur = new Convolution;
         blur.mode = Convolution.prototype.Parametric;
         blur.sigma = this.parameters.maskBlurRadius;
         blur.shape = 2.0;
         blur.aspectRatio = 1.0;
         blur.rotationAngle = 0.0;
         blur.filterSource = "";
         blur.rescaleHighPass = false;
         blur.viewId = "";
         blur.executeOn( protectionWindow.mainView );

         protectionImage = rbcCopyImage( protectionWindow.mainView.image );
         protectionWindow.forceClose();
      }

      protectionImage.truncate( 0, 1 );
      return protectionImage;
   };
}
