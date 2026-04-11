// ----------------------------------------------------------------------------
// PixInsight JavaScript Runtime API - PJSR Version 1.0
// ----------------------------------------------------------------------------
// RowBandingCompensation.js
// ----------------------------------------------------------------------------

/* beautify ignore:start */
#define __PJSR_USE_STAR_DETECTOR_V2

#define TITLE "RowBandingCompensation"
#define VERSION "1.0.0"

#feature-id RowBandingCompensation : Utilities > RowBandingCompensation

#feature-info <b>RowBandingCompensation version 1.0.0</b><br/>\
   <br/>\
   Conservative row-wise banding compensation for linear monochrome subframes, with optional star-guided modulation, \
   confidence weighting, iterative refinement and diagnostic outputs.<br/>\
   <br/>\
   This implementation is packaged as a PixInsight PJSR script resource.

#feature-icon RowBandingCompensation.svg

#include <pjsr/ColorSpace.jsh>
#include <pjsr/DataType.jsh>
#include <pjsr/FrameStyle.jsh>
#include <pjsr/ImageOp.jsh>
#include <pjsr/NumericControl.jsh>
#include <pjsr/SampleType.jsh>
#include <pjsr/SectionBar.jsh>
#include <pjsr/Sizer.jsh>
#include <pjsr/StarDetector.jsh>
#include <pjsr/StdButton.jsh>
#include <pjsr/StdIcon.jsh>
#include <pjsr/TextAlign.jsh>
#include <pjsr/UndoFlag.jsh>

#include "RowBandingCompensationUtils.js"
#include "RowBandingCompensationParameters.js"
#include "RowBandingCompensationMasks.js"
#include "RowBandingCompensationStars.js"
#include "RowBandingCompensationProfiles.js"
#include "RowBandingCompensationDiagnostics.js"
#include "RowBandingCompensationEngine.js"
#include "RowBandingCompensationDialog.js"
/* beautify ignore:end */

function main()
{
   console.show();

   var parameters = new RowBandingCompensationParameters();
   parameters.importParameters();

   function executeEngine( engine, targetView )
   {
      var abortEnabledBackup = console.abortEnabled;
      var executionStatus = "completed";
      console.abortEnabled = true;
      rbcResetAbortState();
      rbcSetProfilingOutputEnabled( parameters.outputProfilingSummary );
      rbcBeginProfilingSession( TITLE + " " + VERSION );
      try
      {
         var result = engine.execute( targetView );
         if ( result != null && result.aborted )
            executionStatus = "aborted";
         return result;
      }
      catch ( error )
      {
         executionStatus = rbcIsAbortError( error ) ? "aborted" : "failed";
         throw error;
      }
      finally
      {
         rbcFinishProfilingSession( executionStatus );
         console.abortEnabled = abortEnabledBackup;
      }
   }

   if ( Parameters.isViewTarget )
   {
      parameters.exportParameters();
      var engineOnView = new RowBandingCompensationEngine( parameters );
      executeEngine( engineOnView, Parameters.targetView );
      return;
   }

   if ( Parameters.isGlobalTarget && parameters.targetViewId.length > 0 )
   {
      parameters.exportParameters();
      var engineOnInstance = new RowBandingCompensationEngine( parameters );
      executeEngine( engineOnInstance, null );
      return;
   }

   var dialog = new RowBandingCompensationDialog( parameters );
   if ( dialog.execute() )
   {
      parameters.ensureValid();
      parameters.exportParameters();

      var engine = new RowBandingCompensationEngine( parameters );
      executeEngine( engine, null );
   }
}

try
{
   main();
}
catch ( error )
{
   if ( rbcIsAbortError( error ) )
      console.noteln( "<end><cbr>Execution aborted." );
   else
   {
      console.criticalln( error.toString() );
      (new MessageBox( "<p>" + error.toString() + "</p>", TITLE, StdIcon_Error, StdButton_Ok )).execute();
   }
}
