var RBC_ABORT_ERROR_MESSAGE = "abort";
var RBC_PROFILE_SAMPLE_LIMIT = 4096;
var rbcAbortNoticeShown = false;
var rbcProfiledFunctions = [];
var rbcProfiler = {
   active: false,
   outputEnabled: false,
   label: "",
   sessionTimer: null,
   records: null,
   sampleLimit: RBC_PROFILE_SAMPLE_LIMIT,

   reset: function()
   {
      this.records = {
         step: {},
         function: {}
      };
      this.label = "";
      this.sessionTimer = null;
      this.active = false;
   },

   beginSession: function( label )
   {
      this.reset();
      this.label = label != null ? label : "";
      this.sessionTimer = rbcCreateElapsedTimer();
      this.active = true;
   },

   finishSession: function( status )
   {
      if ( !this.active )
         return;

      var totalMilliseconds = rbcElapsedMilliseconds( this.sessionTimer );
      this.active = false;
      if ( this.outputEnabled )
         this.printReport( status != null ? status : "completed", totalMilliseconds );
      this.reset();
   },

   enter: function( kind, name )
   {
      if ( !this.active )
         return null;
      return {
         kind: kind,
         name: name,
         timer: rbcCreateElapsedTimer()
      };
   },

   leave: function( token )
   {
      if ( token == null )
         return 0;
      var durationMilliseconds = rbcElapsedMilliseconds( token.timer );
      this.recordDuration( token.kind, token.name, durationMilliseconds );
      return durationMilliseconds;
   },

   recordDuration: function( kind, name, durationMilliseconds )
   {
      if ( !this.active || durationMilliseconds < 0 )
         return;

      var kindRecords = this.records[ kind ];
      if ( kindRecords == null )
         return;

      var record = kindRecords[ name ];
      if ( record == null )
      {
         record = {
            name: name,
            count: 0,
            totalMilliseconds: 0,
            minMilliseconds: 0,
            maxMilliseconds: 0,
            samples: []
         };
         kindRecords[ name ] = record;
      }

      ++record.count;
      record.totalMilliseconds += durationMilliseconds;
      if ( record.count == 1 || durationMilliseconds < record.minMilliseconds )
         record.minMilliseconds = durationMilliseconds;
      if ( record.count == 1 || durationMilliseconds > record.maxMilliseconds )
         record.maxMilliseconds = durationMilliseconds;

      if ( record.samples.length < this.sampleLimit )
         record.samples.push( durationMilliseconds );
      else
      {
         var replacementIndex = Math.floor( Math.random() * record.count );
         if ( replacementIndex < this.sampleLimit )
            record.samples[ replacementIndex ] = durationMilliseconds;
      }
   },

   summarizeRecord: function( record )
   {
      var sortedSamples = record.samples.slice( 0 );
      sortedSamples.sort( rbcNumericSort );
      return {
         meanMilliseconds: record.totalMilliseconds / Math.max( 1, record.count ),
         medianMilliseconds: rbcQuantileSorted( sortedSamples, 0.50 ),
         p95Milliseconds: rbcQuantileSorted( sortedSamples, 0.95 ),
         sampled: record.samples.length < record.count,
         sampleCount: record.samples.length
      };
   },

   sortedRecords: function( kind )
   {
      var kindRecords = this.records[ kind ];
      var records = [];
      for ( var name in kindRecords )
         if ( kindRecords.hasOwnProperty( name ) )
            records.push( kindRecords[ name ] );

      records.sort( function( a, b )
      {
         if ( b.totalMilliseconds != a.totalMilliseconds )
            return b.totalMilliseconds - a.totalMilliseconds;
         return b.count - a.count;
      } );
      return records;
   },

   printReport: function( status, totalMilliseconds )
   {
      var sampledQuantiles = this.hasSampledQuantiles();
      rbcConsoleHeader( "Profiling Summary" );
      console.writeln( "Session: " + this.label );
      console.writeln( "Status: " + status );
      console.writeln( "Wall time: " + rbcFormatPreciseDuration( totalMilliseconds ) );
      console.writeln( "Timers: inclusive wall-clock timings." );
      console.writeln( "Scope: hot algorithm functions are timed directly; per-pixel helper work is intentionally aggregated into enclosing functions." );
      if ( sampledQuantiles )
         console.writeln( "Quantiles: median/p95 are estimated from up to " + this.sampleLimit + " sampled calls per entry." );

      this.printRecordTable( "step", "Algorithm Steps" );
      this.printRecordTable( "function", "Functions" );
   },

   printRecordTable: function( kind, title )
   {
      var records = this.sortedRecords( kind );
      if ( records.length == 0 )
         return;

      console.noteln( "<end><cbr><br>" + title );
      console.noteln( new Array( title.length + 1 ).join( "-" ) );

      var header =
         rbcPadLeft( "Calls", 8 ) + " " +
         rbcPadLeft( "Total", 11 ) + " " +
         rbcPadLeft( "Mean", 11 ) + " " +
         rbcPadLeft( "Median", 11 ) + " " +
         rbcPadLeft( "P95", 11 ) + " " +
         rbcPadLeft( "Max", 11 ) + " " +
         rbcPadLeft( "Sample", 8 ) + "  " +
         "Label";
      console.writeln( header );
      console.writeln( new Array( header.length + 1 ).join( "-" ) );

      for ( var i = 0; i < records.length; ++i )
      {
         var record = records[ i ];
         var summary = this.summarizeRecord( record );
         var sampleText = summary.sampled
            ? format( "%d~", summary.sampleCount )
            : "all";

         console.writeln(
            rbcPadLeft( format( "%d", record.count ), 8 ) + " " +
            rbcPadLeft( rbcFormatPreciseDuration( record.totalMilliseconds ), 11 ) + " " +
            rbcPadLeft( rbcFormatPreciseDuration( summary.meanMilliseconds ), 11 ) + " " +
            rbcPadLeft( rbcFormatPreciseDuration( summary.medianMilliseconds ), 11 ) + " " +
            rbcPadLeft( rbcFormatPreciseDuration( summary.p95Milliseconds ), 11 ) + " " +
            rbcPadLeft( rbcFormatPreciseDuration( record.maxMilliseconds ), 11 ) + " " +
            rbcPadLeft( sampleText, 8 ) + "  " +
            record.name );
      }
   },

   hasSampledQuantiles: function()
   {
      for ( var kind in this.records )
      {
         if ( !this.records.hasOwnProperty( kind ) )
            continue;
         var kindRecords = this.records[ kind ];
         for ( var name in kindRecords )
            if ( kindRecords.hasOwnProperty( name ) && kindRecords[ name ].samples.length < kindRecords[ name ].count )
               return true;
      }
      return false;
   }
};

rbcProfiler.reset();

function rbcResetAbortState()
{
   rbcAbortNoticeShown = false;
}

function rbcCreateElapsedTimer()
{
   return typeof ElapsedTime == "function" ? new ElapsedTime : rbcNowMilliseconds();
}

function rbcElapsedMilliseconds( timer )
{
   if ( timer != null && typeof timer.value == "number" )
      return 1000 * timer.value;
   return rbcNowMilliseconds() - timer;
}

function rbcBeginProfilingSession( label )
{
   rbcProfiler.beginSession( label );
}

function rbcSetProfilingOutputEnabled( enabled )
{
   rbcProfiler.outputEnabled = enabled === true;
}

function rbcFinishProfilingSession( status )
{
   rbcProfiler.finishSession( status );
}

function rbcProfileEnter( kind, name )
{
   return rbcProfiler.enter( kind, name );
}

function rbcProfileLeave( token )
{
   return rbcProfiler.leave( token );
}

function rbcProfileBlock( kind, name, callback, thisObject, args )
{
   var token = rbcProfileEnter( kind, name );
   try
   {
      return callback.apply( thisObject != null ? thisObject : null, args != null ? args : [] );
   }
   finally
   {
      rbcProfileLeave( token );
   }
}

function rbcWrapProfiledMethod( target, methodName, profileName )
{
   if ( target == null )
      return;

   var original = target[ methodName ];
   if ( typeof original != "function" || rbcIsProfiledFunction( original ) )
      return;

   var label = profileName != null ? profileName : methodName;
   var wrapped = function()
   {
      return rbcProfileBlock( "function", label, original, this, arguments );
   };
   rbcMarkProfiledFunction( wrapped );
   target[ methodName ] = wrapped;
}

function rbcWrapProfiledFunction( name, fn )
{
   if ( typeof fn != "function" || rbcIsProfiledFunction( fn ) )
      return fn;

   var wrapped = function()
   {
      return rbcProfileBlock( "function", name, fn, this, arguments );
   };
   rbcMarkProfiledFunction( wrapped );
   return wrapped;
}

function rbcMarkProfiledFunction( fn )
{
   rbcProfiledFunctions.push( fn );
}

function rbcIsProfiledFunction( fn )
{
   for ( var i = 0; i < rbcProfiledFunctions.length; ++i )
      if ( rbcProfiledFunctions[ i ] === fn )
         return true;
   return false;
}

function rbcIsAbortRequested()
{
   return (typeof console != "undefined" &&
      console != null &&
      console.abortRequested === true) ||
      (typeof Console != "undefined" &&
      Console != null &&
      Console.abortRequested === true);
}

function rbcThrowIfAborted()
{
   if ( typeof processEvents == "function" )
      processEvents();

   if ( !rbcIsAbortRequested() )
      return;

   if ( !rbcAbortNoticeShown )
   {
      console.warningln( "<end><cbr>Abort requested." );
      rbcAbortNoticeShown = true;
   }

   throw new Error( RBC_ABORT_ERROR_MESSAGE );
}

function rbcIsAbortError( error )
{
   if ( error == null )
      return false;
   if ( error.message != null && error.message == RBC_ABORT_ERROR_MESSAGE )
      return true;
   var text = error.toString();
   return text == RBC_ABORT_ERROR_MESSAGE || text == "Error: " + RBC_ABORT_ERROR_MESSAGE;
}

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

function rbcCreateGaussianKernel1D( radius, sigma )
{
   radius = Math.max( 0, Math.round( radius ) );
   if ( radius == 0 )
      return [ 1 ];

   sigma = sigma != null ? Math.max( 0.5, sigma ) : Math.max( 0.5, radius / 2 );
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

function rbcRobustSigma( values )
{
   if ( values.length == 0 )
      return 0;
   return 1.4826 * rbcMad( values );
}

function rbcAbsQuantile( values, q )
{
   if ( values.length == 0 )
      return 0;
   var absoluteValues = new Array( values.length );
   for ( var i = 0; i < values.length; ++i )
      absoluteValues[ i ] = Math.abs( values[ i ] );
   absoluteValues.sort( rbcNumericSort );
   return rbcQuantileSorted( absoluteValues, q );
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

function rbcLogicalPixelsToPhysical( control, value )
{
   if ( control != null && typeof control.logicalPixelsToPhysical == "function" )
      return control.logicalPixelsToPhysical( value );
   return Math.round( value );
}

function rbcScaledResource( control, resource )
{
   if ( control != null && typeof control.scaledResource == "function" )
      return control.scaledResource( resource );
   return new Bitmap( resource );
}

function rbcSetScaledFixedSize( control, width, height )
{
   if ( control == null )
      return;
   if ( typeof control.setScaledFixedSize == "function" )
      control.setScaledFixedSize( width, height );
   else if ( typeof control.setFixedSize == "function" )
      control.setFixedSize(
         rbcLogicalPixelsToPhysical( control, width ),
         rbcLogicalPixelsToPhysical( control, height ) );
}

function rbcSetScaledMinWidth( control, width )
{
   if ( control == null || typeof control.setMinWidth != "function" )
      return;
   control.setMinWidth( rbcLogicalPixelsToPhysical( control, width ) );
}

function rbcFontWidth( control, text, fallbackWidth )
{
   if ( control != null && control.font != null && typeof control.font.width == "function" )
      return control.font.width( text );
   return fallbackWidth;
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

function rbcCreateRowBuffer( length )
{
   length = Math.max( 0, Math.round( length ) );
   if ( typeof Float32Array == "function" )
      return new Float32Array( length );

   var row = new Array( length );
   for ( var i = 0; i < length; ++i )
      row[ i ] = 0;
   return row;
}

function rbcEnsureRowBuffer( row, length )
{
   if ( row == null || row.length != length )
      return rbcCreateRowBuffer( length );
   return row;
}

function rbcReadRow( image, y, row )
{
   row = rbcEnsureRowBuffer( row, image.width );
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
   var row = rbcCreateRowBuffer( image.width );
   for ( var y = 0; y < image.height; ++y )
   {
      if ( (y & 31) == 0 )
         rbcThrowIfAborted();
      row = rbcReadRow( image, y, row );
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
      var row = rbcCreateRowBuffer( image.width );
      for ( var y = 0; y < image.height; ++y )
      {
         if ( (y & 31) == 0 )
            rbcThrowIfAborted();
         row = rbcReadRow( image, y, row );
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

function rbcNowMilliseconds()
{
   return (new Date).getTime();
}

function rbcFormatDuration( milliseconds )
{
   if ( milliseconds < 1000 )
      return format( "%d ms", Math.round( milliseconds ) );

   var seconds = milliseconds / 1000;
   if ( seconds < 60 )
      return format( "%.2f s", seconds );

   var minutes = Math.floor( seconds / 60 );
   seconds -= 60 * minutes;
   return format( "%d min %.1f s", minutes, seconds );
}

function rbcFormatPreciseDuration( milliseconds )
{
   if ( milliseconds >= 60000 )
      return format( "%.2f min", milliseconds / 60000 );
   if ( milliseconds >= 1000 )
      return format( "%.3f s", milliseconds / 1000 );
   if ( milliseconds >= 1 )
      return format( "%.3f ms", milliseconds );
   return format( "%.1f us", milliseconds * 1000 );
}

function rbcFormatMetric( value )
{
   return value != 0 && Math.abs( value ) < 1.0e-6 ? format( "%g", value ) : format( "%.8f", value );
}

function rbcPadLeft( text, width )
{
   text = String( text );
   while ( text.length < width )
      text = " " + text;
   return text;
}

function rbcPadRight( text, width )
{
   text = String( text );
   while ( text.length < width )
      text += " ";
   return text;
}

function rbcLogProgress( message )
{
   console.writeln( message );
   if ( typeof console.flush == "function" )
      console.flush();
   rbcThrowIfAborted();
}

function rbcCreateProgressReporter( label, totalCount, bucketCount )
{
   totalCount = Math.max( 1, Math.round( totalCount ) );
   bucketCount = bucketCount != null ? Math.max( 1, Math.round( bucketCount ) ) : 5;

   var startTime = rbcNowMilliseconds();
   var lastBucket = -1;

   return function( completedCount )
   {
      rbcThrowIfAborted();

      var completed = rbcClamp( Math.round( completedCount ), 0, totalCount );
      var bucket = completed >= totalCount ? bucketCount : Math.floor( completed * bucketCount / totalCount );
      if ( bucket <= lastBucket )
         return;

      lastBucket = bucket;
      rbcLogProgress( format(
         "%s: %d%% (%d/%d, elapsed %s)",
         label,
         Math.round( 100 * completed / totalCount ),
         completed,
         totalCount,
         rbcFormatDuration( rbcNowMilliseconds() - startTime ) ) );
   };
}

rbcGrayImageFromView = rbcWrapProfiledFunction( "utility.rbcGrayImageFromView", rbcGrayImageFromView );
rbcCopyImage = rbcWrapProfiledFunction( "utility.rbcCopyImage", rbcCopyImage );
rbcReadRow = rbcWrapProfiledFunction( "utility.rbcReadRow", rbcReadRow );
rbcWriteRow = rbcWrapProfiledFunction( "utility.rbcWriteRow", rbcWriteRow );
rbcInterpolateInvalidRows = rbcWrapProfiledFunction( "utility.rbcInterpolateInvalidRows", rbcInterpolateInvalidRows );
rbcApplyThresholdToImage = rbcWrapProfiledFunction( "utility.rbcApplyThresholdToImage", rbcApplyThresholdToImage );
rbcNormalizeImage = rbcWrapProfiledFunction( "utility.rbcNormalizeImage", rbcNormalizeImage );
rbcWindowFromImage = rbcWrapProfiledFunction( "utility.rbcWindowFromImage", rbcWindowFromImage );
rbcEstimateRobustLocation = rbcWrapProfiledFunction( "utility.rbcEstimateRobustLocation", rbcEstimateRobustLocation );
rbcSmooth1D = rbcWrapProfiledFunction( "utility.rbcSmooth1D", rbcSmooth1D );
rbcConvolve1D = rbcWrapProfiledFunction( "utility.rbcConvolve1D", rbcConvolve1D );
rbcCreateGaussianKernel1D = rbcWrapProfiledFunction( "utility.rbcCreateGaussianKernel1D", rbcCreateGaussianKernel1D );
rbcAbsQuantile = rbcWrapProfiledFunction( "utility.rbcAbsQuantile", rbcAbsQuantile );
rbcRobustSigma = rbcWrapProfiledFunction( "utility.rbcRobustSigma", rbcRobustSigma );
