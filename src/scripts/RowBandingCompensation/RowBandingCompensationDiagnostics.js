function RowBandingCompensationDiagnosticsExporter( parameters )
{
   this.parameters = parameters;

   this.exportIterationProducts = function( targetId, image, originalImage, softBackgroundModel, profileData, rowInfluence )
   {
      if ( !this.parameters.enableDiagnostics )
         return;

      if ( this.parameters.outputSoftBackgroundModel && softBackgroundModel != null )
         this.publishSoftBackgroundModel( targetId, softBackgroundModel, image.width, image.height );

      if ( this.parameters.outputWorkingImage && softBackgroundModel != null )
         this.publishWorkingImage( targetId, image, softBackgroundModel );

      if ( this.parameters.outputDifferenceImage )
         this.publishDifferenceImage( targetId, image, originalImage );

      if ( this.parameters.outputRowBackgroundPlot )
         this.publishProfilePlot( targetId, "rowBackground", profileData.rowBackground );
      if ( this.parameters.outputRowTrendPlot )
         this.publishProfilePlot( targetId, "rowTrend", profileData.rowTrend );
      if ( this.parameters.outputRowResidualPlot )
         this.publishProfilePlot( targetId, "rowResidual", profileData.rowResidual );
      if ( this.parameters.outputRowInfluencePlot )
         this.publishProfilePlot( targetId, "rowInfluence", rowInfluence );
      if ( this.parameters.outputRowVisibilityPlot )
         this.publishProfilePlot( targetId, "rowVisibility", profileData.rowVisibility );
      if ( this.parameters.outputRowConfidencePlot )
         this.publishProfilePlot( targetId, "rowConfidence", profileData.rowConfidence );
      if ( this.parameters.outputRowCorrectionPlot )
         this.publishProfilePlot( targetId, "rowCorrection", profileData.rowCorrection );
   };

   this.publishProfilePlot = function( targetId, suffix, values )
   {
      var width = 256 * 3;
      var height = Math.max( 64, values.length );
      var window = new ImageWindow( width, height, 1, 32, true, false, rbcGenerateUniqueId( targetId + "_" + suffix ) );
      var image = window.mainView.image;

      window.mainView.beginProcess( UndoFlag_NoSwapFile );
      image.fill( 1 );
      var progress = rbcCreateProgressReporter( "  Writing " + suffix + " plot", values.length, 5 );

      var minValue = values[ 0 ];
      var maxValue = values[ 0 ];
      for ( var i = 1; i < values.length; ++i )
      {
         if ( values[ i ] < minValue )
            minValue = values[ i ];
         if ( values[ i ] > maxValue )
            maxValue = values[ i ];
      }
      var valueSpan = maxValue - minValue;
      if ( 1 + valueSpan == 1 )
      {
         minValue -= 1;
         maxValue += 1;
         valueSpan = maxValue - minValue;
      }

      if ( minValue < 0 && maxValue > 0 )
      {
         var zeroX = Math.round( (-minValue / valueSpan) * (width - 1) );
         zeroX = rbcClamp( zeroX, 0, width - 1 );
         for ( var zy = 0; zy < height; ++zy )
            image.setSample( 0.85, zeroX, zy );
      }

      for ( var i = 0; i < values.length; ++i )
      {
         var x = Math.round( ((values[ i ] - minValue) / valueSpan) * (width - 1) );
         var y = values.length > 1
            ? Math.round( i * (height - 1) / (values.length - 1) )
            : Math.round( 0.5 * (height - 1) );

         x = rbcClamp( x, 0, width - 1 );
         y = rbcClamp( y, 0, height - 1 );

         image.setSample( 0.05, x, y );
         if ( x > 0 )
            image.setSample( 0.25, x - 1, y );
         if ( x < width - 1 )
            image.setSample( 0.25, x + 1, y );

         progress( i + 1 );
      }

      window.mainView.endProcess();
      window.show();
   };

   this.publishSoftBackgroundModel = function( targetId, softBackgroundModel, width, height )
   {
      var window = new ImageWindow( width, height, 1, 32, true, false, rbcGenerateUniqueId( targetId + "_softBackground" ) );
      window.mainView.beginProcess( UndoFlag_NoSwapFile );
      var progress = rbcCreateProgressReporter( "  Writing soft background", height, 5 );
      for ( var y = 0; y < height; ++y )
      {
         rbcWriteRow( window.mainView.image, y, softBackgroundModel.rowAt( y, width ) );
         progress( y + 1 );
      }
      window.mainView.endProcess();
      window.show();
   };

   this.publishWorkingImage = function( targetId, image, softBackgroundModel )
   {
      var window = new ImageWindow( image.width, image.height, 1, 32, true, false, rbcGenerateUniqueId( targetId + "_working" ) );
      window.mainView.beginProcess( UndoFlag_NoSwapFile );
      var progress = rbcCreateProgressReporter( "  Writing working image", image.height, 5 );
      for ( var y = 0; y < image.height; ++y )
      {
         var row = rbcReadRow( image, y );
         var backgroundRow = softBackgroundModel.rowAt( y, image.width );
         for ( var x = 0; x < row.length; ++x )
            row[ x ] -= backgroundRow[ x ];
         rbcWriteRow( window.mainView.image, y, row );
         progress( y + 1 );
      }
      window.mainView.endProcess();
      window.show();
   };

   this.publishDifferenceImage = function( targetId, correctedImage, originalImage )
   {
      var window = new ImageWindow( correctedImage.width, correctedImage.height, 1, 32, true, false, rbcGenerateUniqueId( targetId + "_difference" ) );
      window.mainView.beginProcess( UndoFlag_NoSwapFile );
      var progress = rbcCreateProgressReporter( "  Writing difference image", correctedImage.height, 5 );
      for ( var y = 0; y < correctedImage.height; ++y )
      {
         var correctedRow = rbcReadRow( correctedImage, y );
         var originalRow = rbcReadRow( originalImage, y );
         for ( var x = 0; x < correctedRow.length; ++x )
            correctedRow[ x ] -= originalRow[ x ];
         rbcWriteRow( window.mainView.image, y, correctedRow );
         progress( y + 1 );
      }
      window.mainView.endProcess();
      window.show();
   };
}
