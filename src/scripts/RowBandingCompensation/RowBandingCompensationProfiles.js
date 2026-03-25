function RowBandingCompensationBackgroundModel( parameters )
{
   this.parameters = parameters;
   this.cellSize = Math.max( 8, parameters.backgroundSamplingScale );
   this.gridWidth = 0;
   this.gridHeight = 0;
   this.gridValues = [];
   this.globalLevel = 0;

   this.build = function( image, exclusionImage )
   {
      this.gridWidth = Math.max( 1, Math.ceil( image.width / this.cellSize ) );
      this.gridHeight = Math.max( 1, Math.ceil( image.height / this.cellSize ) );

      var gridCount = this.gridWidth * this.gridHeight;
      var sums = new Array( gridCount );
      var counts = new Array( gridCount );
      for ( var i = 0; i < gridCount; ++i )
      {
         sums[ i ] = 0;
         counts[ i ] = 0;
      }

      var sampleStep = Math.max( 1, Math.round( this.cellSize / 4 ) );
      var sampleCount = 0;
      var sampleSum = 0;
      var sampleRows = Math.ceil( image.height / sampleStep );
      var progress = rbcCreateProgressReporter( "  Background sampling", sampleRows, 5 );
      var sampledRows = 0;

      for ( var y = 0; y < image.height; y += sampleStep )
      {
         var imageRow = rbcReadRow( image, y );
         var maskRow = exclusionImage != null ? rbcReadRow( exclusionImage, y ) : null;
         var gridY = Math.min( this.gridHeight - 1, Math.floor( y / this.cellSize ) );

         for ( var x = 0; x < image.width; x += sampleStep )
         {
            if ( maskRow != null && maskRow[ x ] >= 0.5 )
               continue;

            var gridX = Math.min( this.gridWidth - 1, Math.floor( x / this.cellSize ) );
            var index = gridY * this.gridWidth + gridX;
            sums[ index ] += imageRow[ x ];
            counts[ index ] += 1;
            sampleSum += imageRow[ x ];
            sampleCount += 1;
         }

         progress( ++sampledRows );
      }

      this.globalLevel = sampleCount > 0 ? sampleSum / sampleCount : image.median();
      this.gridValues = new Array( gridCount );
      for ( var j = 0; j < gridCount; ++j )
         this.gridValues[ j ] = counts[ j ] > 0 ? sums[ j ] / counts[ j ] : NaN;

      this.fillMissingCells();
      this.smoothGrid();
   };

   this.fillMissingCells = function()
   {
      var unresolved = true;
      for ( var pass = 0; pass < this.gridWidth + this.gridHeight && unresolved; ++pass )
      {
         unresolved = false;
         var next = this.gridValues.slice( 0 );

         for ( var y = 0; y < this.gridHeight; ++y )
            for ( var x = 0; x < this.gridWidth; ++x )
            {
               var index = y * this.gridWidth + x;
               if ( !isNaN( this.gridValues[ index ] ) )
                  continue;

               var sum = 0;
               var count = 0;
               for ( var dy = -1; dy <= 1; ++dy )
                  for ( var dx = -1; dx <= 1; ++dx )
                  {
                     if ( dx == 0 && dy == 0 )
                        continue;
                     var xx = x + dx;
                     var yy = y + dy;
                     if ( xx < 0 || yy < 0 || xx >= this.gridWidth || yy >= this.gridHeight )
                        continue;
                     var value = this.gridValues[ yy * this.gridWidth + xx ];
                     if ( !isNaN( value ) )
                     {
                        sum += value;
                        ++count;
                     }
                  }

               if ( count > 0 )
                  next[ index ] = sum / count;
               else
                  unresolved = true;
            }

         this.gridValues = next;
      }

      for ( var i = 0; i < this.gridValues.length; ++i )
         if ( isNaN( this.gridValues[ i ] ) )
            this.gridValues[ i ] = this.globalLevel;
   };

   this.smoothGrid = function()
   {
      for ( var pass = 0; pass < this.parameters.backgroundSmoothingStrength; ++pass )
      {
         var next = new Array( this.gridValues.length );
         for ( var y = 0; y < this.gridHeight; ++y )
            for ( var x = 0; x < this.gridWidth; ++x )
            {
               var sum = 0;
               var count = 0;
               for ( var dy = -1; dy <= 1; ++dy )
                  for ( var dx = -1; dx <= 1; ++dx )
                  {
                     var xx = x + dx;
                     var yy = y + dy;
                     if ( xx < 0 || yy < 0 || xx >= this.gridWidth || yy >= this.gridHeight )
                        continue;
                     sum += this.gridValues[ yy * this.gridWidth + xx ];
                     ++count;
                  }
               next[ y * this.gridWidth + x ] = count > 0 ? sum / count : this.globalLevel;
            }
         this.gridValues = next;
      }
   };

   this.valueAt = function( x, y )
   {
      if ( this.gridValues.length == 0 )
         return 0;

      var gx = x / this.cellSize;
      var gy = y / this.cellSize;
      var x0 = Math.floor( gx );
      var y0 = Math.floor( gy );
      var x1 = Math.min( this.gridWidth - 1, x0 + 1 );
      var y1 = Math.min( this.gridHeight - 1, y0 + 1 );
      x0 = rbcClamp( x0, 0, this.gridWidth - 1 );
      y0 = rbcClamp( y0, 0, this.gridHeight - 1 );

      var fx = gx - x0;
      var fy = gy - y0;
      var v00 = this.gridValues[ y0 * this.gridWidth + x0 ];
      var v10 = this.gridValues[ y0 * this.gridWidth + x1 ];
      var v01 = this.gridValues[ y1 * this.gridWidth + x0 ];
      var v11 = this.gridValues[ y1 * this.gridWidth + x1 ];

      return (1 - fy) * ((1 - fx) * v00 + fx * v10) + fy * ((1 - fx) * v01 + fx * v11);
   };

   this.rowAt = function( y, width )
   {
      var row = new Array( width );
      for ( var x = 0; x < width; ++x )
         row[ x ] = this.valueAt( x, y );
      return row;
   };
}

function RowBandingCompensationProfileEstimator( parameters )
{
   this.parameters = parameters;

   this.estimate = function( image, exclusionImage, softBackgroundModel, rowInfluence )
   {
      var width = image.width;
      var height = image.height;
      var rowBackground = new Array( height );
      var validCounts = new Array( height );
      var directFlags = new Array( height );
      var interpolatedFlags = new Array( height );
      var anyFlags = new Array( height );

      var insufficientRows = 0;
      var reusableBackgroundRows = [];
      var rowProgress = rbcCreateProgressReporter( "  Row sampling", height, 5 );

      for ( var y = 0; y < height; ++y )
      {
         var imageRow = rbcReadRow( image, y );
         var maskRow = exclusionImage != null ? rbcReadRow( exclusionImage, y ) : null;
         var backgroundRow = null;
         if ( softBackgroundModel != null )
         {
            backgroundRow = softBackgroundModel.rowAt( y, width );
            reusableBackgroundRows.push( backgroundRow );
         }

         var validSamples = [];
         for ( var x = 0; x < width; ++x )
         {
            if ( maskRow != null && maskRow[ x ] >= 0.5 )
               continue;
            validSamples.push( imageRow[ x ] - (backgroundRow != null ? backgroundRow[ x ] : 0) );
         }

         validCounts[ y ] = validSamples.length;
         anyFlags[ y ] = validSamples.length > 0;
         directFlags[ y ] = validSamples.length >= this.parameters.minimumValidPixelsPerRow;
         interpolatedFlags[ y ] = false;

         if ( validSamples.length == 0 )
         {
            ++insufficientRows;
            rowBackground[ y ] = 0;
         }
         else
         {
            if ( !directFlags[ y ] )
               ++insufficientRows;
            rowBackground[ y ] = rbcEstimateRobustLocation(
               validSamples,
               this.parameters.rowEstimatorType,
               this.parameters.lowRejectQuantile,
               this.parameters.highRejectQuantile );
         }

         rowProgress( y + 1 );
      }

      if ( insufficientRows > 0 )
      {
         rowBackground = rbcInterpolateInvalidRows( rowBackground, anyFlags );
         for ( var i = 0; i < height; ++i )
            if ( !anyFlags[ i ] )
               interpolatedFlags[ i ] = true;
      }

      var rowTrend = this.parameters.enableRowTrendCorrection
         ? rbcSmooth1D( rowBackground, this.parameters.rowTrendSmoothingRadius )
         : rowBackground.slice( 0 );

      var rowResidual = new Array( height );
      for ( var j = 0; j < height; ++j )
         rowResidual[ j ] = this.parameters.enableRowTrendCorrection ? rowBackground[ j ] - rowTrend[ j ] : 0;

      var rowVisibility = this.parameters.enableRowVisibility
         ? this.computeVisibility( rowResidual )
         : this.zeroProfile( height );

      var rowConfidence = this.computeConfidence( width, validCounts, directFlags, interpolatedFlags, rowInfluence );
      var rowCorrection = this.computeCorrection( rowResidual, rowInfluence, rowVisibility, rowConfidence );

      return {
         rowBackground: rowBackground,
         rowTrend: rowTrend,
         rowResidual: rowResidual,
         rowVisibility: rowVisibility,
         rowConfidence: rowConfidence,
         rowCorrection: rowCorrection,
         validCounts: validCounts,
         directFlags: directFlags,
         interpolatedFlags: interpolatedFlags,
         insufficientRows: insufficientRows
      };
   };

   this.zeroProfile = function( length )
   {
      var zeros = new Array( length );
      for ( var i = 0; i < length; ++i )
         zeros[ i ] = 0;
      return zeros;
   };

   this.computeVisibility = function( rowResidual )
   {
      var visibility = new Array( rowResidual.length );
      var baseline;

      switch ( this.parameters.visibilityMode )
      {
      case "HighPassResidual":
         baseline = rbcSmooth1D( rowResidual, Math.max( 1, this.parameters.visibilitySmoothingRadius ) );
         for ( var i = 0; i < rowResidual.length; ++i )
            visibility[ i ] = Math.abs( rowResidual[ i ] - baseline[ i ] );
         break;

      case "FirstDerivative":
         for ( var j = 0; j < rowResidual.length; ++j )
         {
            var previous = rowResidual[ Math.max( 0, j - 1 ) ];
            var next = rowResidual[ Math.min( rowResidual.length - 1, j + 1 ) ];
            visibility[ j ] = Math.abs( next - previous ) * 0.5;
         }
         break;

      case "SecondDerivative":
         for ( var k = 0; k < rowResidual.length; ++k )
         {
            var a = rowResidual[ Math.max( 0, k - 1 ) ];
            var b = rowResidual[ k ];
            var c = rowResidual[ Math.min( rowResidual.length - 1, k + 1 ) ];
            visibility[ k ] = Math.abs( a - 2 * b + c );
         }
         break;

      default:
         var radius = Math.max( 1, this.parameters.visibilitySmoothingRadius );
         for ( var y = 0; y < rowResidual.length; ++y )
         {
            var window = [];
            for ( var yy = Math.max( 0, y - radius ); yy <= Math.min( rowResidual.length - 1, y + radius ); ++yy )
               window.push( rowResidual[ yy ] );
            var sorted = window.slice( 0 );
            sorted.sort( rbcNumericSort );
            var median = rbcMedianSorted( sorted );
            visibility[ y ] = Math.abs( rowResidual[ y ] - median ) / Math.max( 0.000001, rbcMad( window ) * 1.4826 );
         }
         break;
      }

      if ( this.parameters.visibilitySmoothingRadius > 0 )
         visibility = rbcSmooth1D( visibility, this.parameters.visibilitySmoothingRadius );
      return rbcNormalizeArray( visibility );
   };

   this.computeConfidence = function( width, validCounts, directFlags, interpolatedFlags, rowInfluence )
   {
      var confidence = new Array( validCounts.length );
      for ( var y = 0; y < validCounts.length; ++y )
      {
         var validFraction = validCounts[ y ] / Math.max( 1, width );
         var supportScore = Math.sqrt( validFraction );
         var confidenceValue = 0.15 + 0.85 * supportScore;

         if ( !directFlags[ y ] )
            confidenceValue *= 0.75;
         if ( interpolatedFlags[ y ] )
            confidenceValue *= 0.35;

         confidenceValue *= (1 - 0.20 * rowInfluence[ y ]);
         confidence[ y ] = rbcClamp( confidenceValue, 0, 1 );
      }
      return confidence;
   };

   this.computeCorrection = function( rowResidual, rowInfluence, rowVisibility, rowConfidence )
   {
      var correction = new Array( rowResidual.length );
      for ( var y = 0; y < rowResidual.length; ++y )
      {
         var value = rowResidual[ y ] * this.parameters.globalStrength;

         if ( this.parameters.enableStarInfluence )
            value *= 1 + this.parameters.localStarBoost * rowInfluence[ y ];

         if ( this.parameters.enableRowVisibility )
            value *= 1 + this.parameters.visibilityStrength * rowVisibility[ y ];

         if ( this.parameters.enableConfidenceWeighting )
            value *= Math.max( 0, 1 - this.parameters.confidenceStrength * (1 - rowConfidence[ y ]) );

         correction[ y ] = value;
      }

      if ( this.parameters.maximumPerIterationCorrection > 0 )
         correction = rbcClampAbsArray( correction, this.parameters.maximumPerIterationCorrection );
      return correction;
   };
}

function RowBandingCompensationCorrectionApplier( parameters )
{
   this.parameters = parameters;

   this.apply = function( image, rowCorrection, protectionImage )
   {
      var progress = rbcCreateProgressReporter( "  Applying correction", image.height, 5 );
      for ( var y = 0; y < image.height; ++y )
      {
         var row = rbcReadRow( image, y );
         var protectionRow = protectionImage != null ? rbcReadRow( protectionImage, y ) : null;

         for ( var x = 0; x < row.length; ++x )
         {
            var weight = 1;
            if ( this.parameters.enableProtectionMask && protectionRow != null )
               weight = 1 - this.parameters.protectionStrength * rbcClamp( protectionRow[ x ], 0, 1 );

            row[ x ] -= rowCorrection[ y ] * weight;

            if ( this.parameters.clippingPolicy == "ClampLow" )
               row[ x ] = Math.max( 0, row[ x ] );
            else if ( this.parameters.clippingPolicy == "Clamp01" )
               row[ x ] = rbcClamp( row[ x ], 0, 1 );
         }

         rbcWriteRow( image, y, row );
         progress( y + 1 );
      }
   };
}
