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

      var maskSourceView = null;
      var analysisSourceView = null;

      if ( starMaskView != null )
      {
         maskSourceView = starMaskView;
         maskSet.sourceLabel = starsOnlyView != null ? "star mask + stars-only image" : "star mask";
      }
      else if ( starsOnlyView != null )
      {
         maskSourceView = starsOnlyView;
         maskSet.sourceLabel = "stars-only image";
      }

      if ( maskSourceView != null )
      {
         maskSet.baseImage = rbcGrayImageFromView( maskSourceView );
         rbcNormalizeImage( maskSet.baseImage );
         maskSet.exclusionImage = this.buildExclusionMask( maskSet.baseImage );
         maskSet.protectionImage = this.buildProtectionMask( maskSet.baseImage );
         maskSet.hasMask = true;
      }

      if ( starsOnlyView != null )
      {
         analysisSourceView = starsOnlyView;
         if ( maskSet.sourceLabel.length == 0 )
            maskSet.sourceLabel = "stars-only image";
      }
      else if ( maskSet.baseImage != null )
         maskSet.analysisImage = rbcCopyImage( maskSet.baseImage );

      if ( analysisSourceView != null )
      {
         maskSet.analysisImage = rbcGrayImageFromView( analysisSourceView );
         rbcNormalizeImage( maskSet.analysisImage );
      }

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
