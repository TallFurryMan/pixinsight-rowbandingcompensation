function rbcClamp( value, low, high )
{
   if ( value < low )
      return low;
   if ( value > high )
      return high;
   return value;
}

function rbcNumericSort( a, b )
{
   return a - b;
}

function rbcMean( values )
{
   if ( values.length == 0 )
      return 0;
   var sum = 0;
   for ( var i = 0; i < values.length; ++i )
      sum += values[ i ];
   return sum / values.length;
}

function rbcMedianSorted( sortedValues )
{
   if ( sortedValues.length == 0 )
      return 0;
   var m = sortedValues.length >> 1;
   return (sortedValues.length & 1) != 0 ? sortedValues[ m ] : 0.5 * (sortedValues[ m - 1 ] + sortedValues[ m ]);
}

function rbcQuantileSorted( sortedValues, q )
{
   if ( sortedValues.length == 0 )
      return 0;
   if ( sortedValues.length == 1 )
      return sortedValues[ 0 ];
   var position = rbcClamp( q, 0, 1 ) * (sortedValues.length - 1);
   var index = Math.floor( position );
   var fraction = position - index;
   if ( index >= sortedValues.length - 1 )
      return sortedValues[ sortedValues.length - 1 ];
   return sortedValues[ index ] * (1 - fraction) + sortedValues[ index + 1 ] * fraction;
}

function rbcMad( values )
{
   if ( values.length == 0 )
      return 0;
   var sorted = values.slice( 0 );
   sorted.sort( rbcNumericSort );
   var median = rbcMedianSorted( sorted );
   var deviations = new Array( values.length );
   for ( var i = 0; i < values.length; ++i )
      deviations[ i ] = Math.abs( values[ i ] - median );
   deviations.sort( rbcNumericSort );
   return rbcMedianSorted( deviations );
}

function rbcEstimateRobustLocation( values, estimatorType, lowRejectQuantile, highRejectQuantile )
{
   if ( values.length == 0 )
      return 0;

   var sorted = values.slice( 0 );
   sorted.sort( rbcNumericSort );
   if ( estimatorType == "Median" || sorted.length < 3 )
      return rbcMedianSorted( sorted );

   var lowValue = rbcQuantileSorted( sorted, lowRejectQuantile );
   var highValue = rbcQuantileSorted( sorted, 1 - highRejectQuantile );
   if ( highValue < lowValue )
   {
      var swap = highValue;
      highValue = lowValue;
      lowValue = swap;
   }

   if ( estimatorType == "TrimmedMean" )
   {
      var trimmed = [];
      for ( var i = 0; i < sorted.length; ++i )
         if ( sorted[ i ] >= lowValue && sorted[ i ] <= highValue )
            trimmed.push( sorted[ i ] );
      return trimmed.length > 0 ? rbcMean( trimmed ) : rbcMedianSorted( sorted );
   }

   var winsorized = new Array( sorted.length );
   for ( var j = 0; j < sorted.length; ++j )
      winsorized[ j ] = rbcClamp( sorted[ j ], lowValue, highValue );
   return rbcMean( winsorized );
}

function rbcCreateGaussianKernel1D( radius )
{
   radius = Math.max( 0, Math.round( radius ) );
   if ( radius == 0 )
      return [ 1 ];

   var sigma = Math.max( 0.5, radius / 2 );
   var size = radius * 2 + 1;
   var kernel = new Array( size );
   var sum = 0;
   for ( var i = -radius; i <= radius; ++i )
   {
      var value = Math.exp( -(i * i) / (2 * sigma * sigma) );
      kernel[ i + radius ] = value;
      sum += value;
   }
   for ( var j = 0; j < size; ++j )
      kernel[ j ] /= sum;
   return kernel;
}

function rbcConvolve1D( values, kernel )
{
   var radius = kernel.length >> 1;
   var result = new Array( values.length );
   for ( var i = 0; i < values.length; ++i )
   {
      var sum = 0;
      for ( var k = -radius; k <= radius; ++k )
      {
         var index = i + k;
         if ( index < 0 )
            index = 0;
         else if ( index >= values.length )
            index = values.length - 1;
         sum += values[ index ] * kernel[ k + radius ];
      }
      result[ i ] = sum;
   }
   return result;
}

function rbcSmooth1D( values, radius )
{
   if ( values.length == 0 || radius <= 0 )
      return values.slice( 0 );
   return rbcConvolve1D( values, rbcCreateGaussianKernel1D( radius ) );
}

function rbcNormalizeArray( values )
{
   if ( values.length == 0 )
      return [];
   var minValue = values[ 0 ];
   var maxValue = values[ 0 ];
   for ( var i = 1; i < values.length; ++i )
   {
      if ( values[ i ] < minValue )
         minValue = values[ i ];
      if ( values[ i ] > maxValue )
         maxValue = values[ i ];
   }
   if ( 1 + maxValue - minValue == 1 )
   {
      var zeros = new Array( values.length );
      for ( var z = 0; z < zeros.length; ++z )
         zeros[ z ] = 0;
      return zeros;
   }
   var normalized = new Array( values.length );
   for ( var j = 0; j < values.length; ++j )
      normalized[ j ] = (values[ j ] - minValue) / (maxValue - minValue);
   return normalized;
}

function rbcAbsArray( values )
{
   var result = new Array( values.length );
   for ( var i = 0; i < values.length; ++i )
      result[ i ] = Math.abs( values[ i ] );
   return result;
}

function rbcMaxAbs( values )
{
   var maximum = 0;
   for ( var i = 0; i < values.length; ++i )
   {
      var a = Math.abs( values[ i ] );
      if ( a > maximum )
         maximum = a;
   }
   return maximum;
}

function rbcClampAbsArray( values, maximumAbs )
{
   var result = new Array( values.length );
   for ( var i = 0; i < values.length; ++i )
      result[ i ] = rbcClamp( values[ i ], -maximumAbs, maximumAbs );
   return result;
}

function rbcRmsDifference( a, b )
{
   if ( a.length == 0 || b.length == 0 || a.length != b.length )
      return 0;
   var sum = 0;
   for ( var i = 0; i < a.length; ++i )
   {
      var d = a[ i ] - b[ i ];
      sum += d * d;
   }
   return Math.sqrt( sum / a.length );
}

function rbcGenerateUniqueId( baseId )
{
   var sanitized = baseId.replace( /[^A-Za-z0-9_]/g, "_" );
   if ( sanitized.length == 0 )
      sanitized = "RBC";
   var candidate = sanitized;
   var index = 1;
   while ( !ImageWindow.windowById( candidate ).isNull )
      candidate = sanitized + "_" + index++;
   return candidate;
}

function rbcWindowFromImage( image, baseId )
{
   var window = new ImageWindow(
      image.width,
      image.height,
      1,
      32,
      true,
      false,
      rbcGenerateUniqueId( baseId ) );
   window.mainView.beginProcess( UndoFlag_NoSwapFile );
   window.mainView.image.assign( image );
   window.mainView.endProcess();
   return window;
}

function rbcGrayImageFromView( view )
{
   var gray = Image.newFloatImage();
   if ( view.image.numberOfChannels > 1 )
      view.image.getIntensity( gray );
   else
      gray.assign( view.image );
   return gray;
}

function rbcCopyImage( sourceImage )
{
   var copy = Image.newFloatImage();
   copy.assign( sourceImage );
   return copy;
}

function rbcReadRow( image, y )
{
   var row = [];
   image.getSamples( row, new Rect( 0, y, image.width, y + 1 ) );
   return row;
}

function rbcWriteRow( image, y, row )
{
   image.setSamples( row, new Rect( 0, y, image.width, y + 1 ) );
}

function rbcInterpolateInvalidRows( values, validFlags )
{
   var result = values.slice( 0 );
   for ( var y = 0; y < result.length; ++y )
   {
      if ( validFlags[ y ] )
         continue;

      var y0 = y - 1;
      while ( y0 >= 0 && !validFlags[ y0 ] )
         --y0;
      var y1 = y + 1;
      while ( y1 < result.length && !validFlags[ y1 ] )
         ++y1;

      if ( y0 >= 0 && y1 < result.length )
      {
         var t = (y - y0) / (y1 - y0);
         result[ y ] = result[ y0 ] * (1 - t) + result[ y1 ] * t;
      }
      else if ( y0 >= 0 )
         result[ y ] = result[ y0 ];
      else if ( y1 < result.length )
         result[ y ] = result[ y1 ];
      else
         result[ y ] = 0;
   }
   return result;
}

function rbcCreateCircularStructure( radius )
{
   radius = Math.max( 0, Math.round( radius ) );
   var size = radius * 2 + 1;
   var structure = new Array( size * size );
   for ( var y = 0; y < size; ++y )
      for ( var x = 0; x < size; ++x )
      {
         var dx = x - radius;
         var dy = y - radius;
         structure[ y * size + x ] = (dx * dx + dy * dy) <= radius * radius ? 0x01 : 0x00;
      }
   return [ [ structure ] ];
}

function rbcApplyThresholdToImage( image, threshold )
{
   for ( var y = 0; y < image.height; ++y )
   {
      var row = rbcReadRow( image, y );
      for ( var x = 0; x < row.length; ++x )
         row[ x ] = row[ x ] >= threshold ? 1 : 0;
      rbcWriteRow( image, y, row );
   }
}

function rbcNormalizeImage( image )
{
   var minimum = image.minimum();
   var maximum = image.maximum();
   if ( maximum > minimum )
   {
      var scale = maximum - minimum;
      for ( var y = 0; y < image.height; ++y )
      {
         var row = rbcReadRow( image, y );
         for ( var x = 0; x < row.length; ++x )
            row[ x ] = (row[ x ] - minimum) / scale;
         rbcWriteRow( image, y, row );
      }
   }
   image.truncate( 0, 1 );
}

function rbcBinaryMaskRowFromImage( image, y, threshold )
{
   var row = rbcReadRow( image, y );
   for ( var x = 0; x < row.length; ++x )
      row[ x ] = row[ x ] >= threshold ? 1 : 0;
   return row;
}

function rbcFindViewById( viewId )
{
   if ( viewId == null || viewId.length == 0 )
      return null;
   var window = ImageWindow.windowById( viewId );
   return window.isNull ? null : window.mainView;
}

function rbcConsoleHeader( text )
{
   console.noteln( "<end><cbr><br>" + text );
   console.noteln( new Array( text.length + 1 ).join( "=" ) );
}
