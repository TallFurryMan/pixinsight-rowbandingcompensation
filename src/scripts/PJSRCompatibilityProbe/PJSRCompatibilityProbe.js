// ----------------------------------------------------------------------------
// PixInsight JavaScript Runtime API - PJSR Version 1.0
// ----------------------------------------------------------------------------
// PJSRCompatibilityProbe.js
// ----------------------------------------------------------------------------

/* beautify ignore:start */
#define TITLE "PJSRCompatibilityProbe"
#define VERSION "1.0.0"

#feature-id PJSRCompatibilityProbe : Utilities > PJSRCompatibilityProbe

#feature-info <b>PJSRCompatibilityProbe version 1.0.0</b><br/>\
   <br/>\
   Reports the availability of selected Dialog and widget methods on the current PixInsight runtime.\
   Use this utility to diagnose PJSR compatibility issues on a specific PixInsight build.

#include <pjsr/NumericControl.jsh>
#include <pjsr/SectionBar.jsh>
#include <pjsr/Sizer.jsh>
#include <pjsr/StdButton.jsh>
#include <pjsr/StdIcon.jsh>
/* beautify ignore:end */

function ProbeDialog()
{
   this.__base__ = Dialog;
   this.__base__();
   this.windowTitle = TITLE;
}

ProbeDialog.prototype = new Dialog;

function probeProperty( object, propertyName )
{
   try
   {
      var value = object[ propertyName ];
      if ( typeof value == "undefined" )
         return "undefined";
      if ( typeof value == "function" )
         return "function";
      if ( value === null )
         return "null";
      return typeof value;
   }
   catch ( error )
   {
      return "error: " + error.toString();
   }
}

function printSection( title, object, propertyNames )
{
   console.noteln( "<end><cbr>" + title );
   console.noteln( new Array( title.length + 1 ).join( "-" ) );
   for ( var i = 0; i < propertyNames.length; ++i )
      console.writeln( format( "%-32s %s", propertyNames[ i ] + ":", probeProperty( object, propertyNames[ i ] ) ) );
}

function main()
{
   console.show();
   console.clear();

   var dialog = new ProbeDialog();
   var control = new Control( dialog );
   var label = new Label( dialog );
   var toolButton = new ToolButton( dialog );
   var pushButton = new PushButton( dialog );
   var comboBox = new ComboBox( dialog );
   var viewList = new ViewList( dialog );
   var numericControl = new NumericControl( dialog );
   var sectionBar = new SectionBar( dialog, "Probe Section" );

   console.noteln( TITLE + " " + VERSION );
   console.writeln( "Core version: "
      + CoreApplication.versionMajor + "."
      + CoreApplication.versionMinor + "."
      + CoreApplication.versionRelease + "-"
      + CoreApplication.versionRevision );

   printSection( "Dialog", dialog, [
      "font",
      "adjustToContents",
      "setMinWidth",
      "setFixedSize",
      "logicalPixelsToPhysical",
      "scaledResource",
      "newInstance",
      "execute"
   ] );

   printSection( "Control", control, [
      "font",
      "adjustToContents",
      "setMinWidth",
      "setFixedSize",
      "logicalPixelsToPhysical",
      "scaledResource"
   ] );

   printSection( "ToolButton", toolButton, [
      "icon",
      "setFixedSize",
      "setScaledFixedSize",
      "onClick",
      "onMousePress"
   ] );

   printSection( "PushButton", pushButton, [
      "icon",
      "setFixedSize",
      "setScaledFixedSize",
      "onClick"
   ] );

   printSection( "ViewList", viewList, [
      "getMainViews",
      "currentView",
      "onViewSelected",
      "setFixedSize"
   ] );

   printSection( "NumericControl", numericControl, [
      "setRange",
      "setPrecision",
      "setValue",
      "label",
      "slider",
      "edit"
   ] );

   printSection( "SectionBar", sectionBar, [
      "setSection",
      "enableCheckBox",
      "toggleSection",
      "isCollapsed",
      "checkBox",
      "onCheckSection",
      "onToggleSection"
   ] );

   printSection( "Other Widgets", {
      label: label,
      comboBox: comboBox
   }, [] );

   console.noteln( "<end><cbr>Label" );
   console.noteln( "-----" );
   console.writeln( format( "%-32s %s", "setFixedWidth:", probeProperty( label, "setFixedWidth" ) ) );
   console.writeln( format( "%-32s %s", "setMinWidth:", probeProperty( label, "setMinWidth" ) ) );
   console.writeln( format( "%-32s %s", "textAlignment:", probeProperty( label, "textAlignment" ) ) );

   console.noteln( "<end><cbr>ComboBox" );
   console.noteln( "--------" );
   console.writeln( format( "%-32s %s", "addItem:", probeProperty( comboBox, "addItem" ) ) );
   console.writeln( format( "%-32s %s", "currentItem:", probeProperty( comboBox, "currentItem" ) ) );
   console.writeln( format( "%-32s %s", "onItemSelected:", probeProperty( comboBox, "onItemSelected" ) ) );

   console.noteln( "<end><cbr>Copy the console output for compatibility debugging." );
}

try
{
   main();
}
catch ( error )
{
   console.criticalln( error.toString() );
   (new MessageBox( "<p>" + error.toString() + "</p>", TITLE, StdIcon_Error, StdButton_Ok )).execute();
}
