function RowBandingCompensationDialog( parameters )
{
   this.__base__ = Dialog;
   this.__base__();

   this.parameters = parameters;
   this.windowTitle = TITLE;

   var dialog = this;
   var emWidth = rbcFontWidth( this, "M", 8 );
   var labelWidth = Math.max(
      rbcFontWidth( this, "Soft background smoothing strength:", 260 ),
      rbcFontWidth( this, "Additive correction clipping policy:", 260 ),
      rbcFontWidth( this, "Confidence weighting strength:", 260 ) ) + emWidth;
   var editWidth = 8 * emWidth;

   this.helpLabel = new Label( this );
   this.helpLabel.useRichText = true;
   this.helpLabel.wordWrapping = true;
   this.helpLabel.frameStyle = FrameStyle_Box;
   this.helpLabel.margin = 6;
   this.helpLabel.text =
      "<p><b>" + TITLE + " " + VERSION + "</b></p>" +
      "<p>Conservative row-wise banding compensation for linear monochrome subframes. " +
      "The implementation follows the PJSR script path described in the project spec, with optional star-guided modulation, " +
      "confidence weighting and diagnostic outputs.</p>" +
      "<p>This version creates corrected output as a new image and can export a process instance for repeatable execution.</p>" +
      "<p>Typical use: select the target image, optionally provide a stars-only companion image derived from it, and add a separate star mask only if you already have one. " +
      "Iterative processing is intended to be monitored in the console: watch the residual values, especially <i>Residual |95%| amplitude</i>, and inspect a stretched result or difference image for persistent rows, sign inversions, or star-side artifacts.</p>";

   this.createSection = function( title, toolTipKey, valueGetter, valueSetter, collapsed )
   {
      var control = new Control( dialog );
      control.sizer = new VerticalSizer;
      control.sizer.margin = 6;
      control.sizer.spacing = 4;

      var bar = new SectionBar( dialog, title );
      if ( toolTipKey != null )
      {
         bar.enableCheckBox();
         bar.checkBox.checked = valueGetter();
         bar.toolTip = rbcTooltip( toolTipKey );
         bar.checkBox.toolTip = bar.toolTip;
         bar.onCheckSection = function( sectionBar )
         {
            valueSetter( sectionBar.checkBox.checked );
            dialog.updateControlStates();
         };
      }
      bar.setSection( control );
      if ( collapsed )
         control.hide();
      bar.updateIcon();
      return { bar: bar, control: control };
   };

   this.createLabeledRow = function( parent, labelText, toolTip )
   {
      var sizer = new HorizontalSizer;
      sizer.spacing = 4;

      var label = new Label( dialog );
      label.text = labelText;
      label.setFixedWidth( labelWidth );
      label.textAlignment = TextAlign_Right | TextAlign_VertCenter;
      label.toolTip = toolTip;

      sizer.add( label );
      parent.add( sizer );
      return { sizer: sizer, label: label };
   };

   this.addCheckBoxRow = function( parent, labelText, toolTipKey, valueGetter, valueSetter )
   {
      var row = dialog.createLabeledRow( parent, labelText, rbcTooltip( toolTipKey ) );
      var checkBox = new CheckBox( dialog );
      checkBox.checked = valueGetter();
      checkBox.toolTip = rbcTooltip( toolTipKey );
      checkBox.onClick = function( checked )
      {
         valueSetter( checked );
         dialog.updateControlStates();
      };
      row.sizer.add( checkBox );
      row.sizer.addStretch();
      return checkBox;
   };

   this.addNumericControl = function( parent, labelText, toolTipKey, minValue, maxValue, precision, sliderMax, valueGetter, valueSetter )
   {
      var control = new NumericControl( dialog );
      control.label.text = labelText;
      control.label.setFixedWidth( labelWidth );
      control.toolTip = rbcTooltip( toolTipKey );
      control.label.toolTip = control.toolTip;
      control.setRange( minValue, maxValue );
      control.slider.setRange( 0, sliderMax );
      control.slider.minWidth = rbcLogicalPixelsToPhysical( dialog, 220 );
      control.setPrecision( precision );
      control.edit.setFixedWidth( editWidth );
      control.setValue( valueGetter() );
      control.onValueUpdated = function( value )
      {
         valueSetter( value );
      };
      parent.add( control );
      return control;
   };

   this.addComboBoxRow = function( parent, labelText, toolTipKey, items, valueGetter, valueSetter )
   {
      var row = dialog.createLabeledRow( parent, labelText, rbcTooltip( toolTipKey ) );
      var combo = new ComboBox( dialog );
      for ( var i = 0; i < items.length; ++i )
         combo.addItem( items[ i ] );
      combo.currentItem = Math.max( 0, items.indexOf( valueGetter() ) );
      combo.toolTip = rbcTooltip( toolTipKey );
      combo.onItemSelected = function( index )
      {
         valueSetter( items[ index ] );
      };
      row.sizer.add( combo );
      row.sizer.addStretch();
      return combo;
   };

   this.clampConvergenceEpsilon = function( value )
   {
      return rbcClamp( value, RBC_CONVERGENCE_EPSILON_MIN, RBC_CONVERGENCE_EPSILON_MAX );
   };

   this.decomposeConvergenceEpsilon = function( value )
   {
      value = dialog.clampConvergenceEpsilon( value );
      var exponent = 0;
      var mantissa = value;

      while ( mantissa < 1 && exponent > RBC_CONVERGENCE_EXPONENTS[ RBC_CONVERGENCE_EXPONENTS.length - 1 ] )
      {
         mantissa *= 10;
         --exponent;
      }

      while ( mantissa >= 10 && exponent < RBC_CONVERGENCE_EXPONENTS[ 0 ] )
      {
         mantissa /= 10;
         ++exponent;
      }

      if ( RBC_CONVERGENCE_EXPONENTS.indexOf( exponent ) < 0 )
      {
         exponent = mantissa >= 1 ? RBC_CONVERGENCE_EXPONENTS[ 0 ] : RBC_CONVERGENCE_EXPONENTS[ RBC_CONVERGENCE_EXPONENTS.length - 1 ];
         mantissa = value / Math.pow( 10, exponent );
      }

      mantissa = rbcClamp( mantissa, 1, 9.999 );
      return { mantissa: mantissa, exponent: exponent };
   };

   this.syncConvergenceControlsFromParameters = function()
   {
      var convergence = dialog.decomposeConvergenceEpsilon( dialog.parameters.convergenceEpsilon );
      dialog.convergenceMantissaControl.setValue( convergence.mantissa );
      dialog.convergenceExponentCombo.currentItem = Math.max( 0, RBC_CONVERGENCE_EXPONENTS.indexOf( convergence.exponent ) );
   };

   this.addViewSelector = function( parent, labelText, toolTipKey, required, valueGetter, valueSetter )
   {
      var row = dialog.createLabeledRow( parent, labelText, rbcTooltip( toolTipKey ) );
      var viewList = new ViewList( dialog );
      viewList.getMainViews();
      var selectedView = rbcFindViewById( valueGetter() );
      if ( selectedView != null )
         viewList.currentView = selectedView;
      else if ( required )
      {
         var activeWindow = ImageWindow.activeWindow;
         if ( !activeWindow.isNull )
            viewList.currentView = activeWindow.currentView;
      }
      else
         viewList.currentView = new View();

      viewList.toolTip = rbcTooltip( toolTipKey );
      viewList.onViewSelected = function( view )
      {
         valueSetter( view != null && view.isView ? view.id : "" );
      };
      row.sizer.add( viewList, 100 );

      if ( !required )
      {
         var clearButton = new ToolButton( dialog );
         clearButton.icon = rbcScaledResource( dialog, ":/icons/clear.png" );
         rbcSetScaledFixedSize( clearButton, 20, 20 );
         clearButton.toolTip = "<p>Clear this optional view selection.</p>";
         clearButton.onClick = function()
         {
            viewList.currentView = new View();
            valueSetter( "" );
         };
         row.sizer.add( clearButton );
      }

      return viewList;
   };

   this.inputSection = this.createSection( "Input", null, null, null, false );
   this.targetViewList = this.addViewSelector(
      this.inputSection.control.sizer,
      "Target image:",
      "targetViewId",
      true,
      function() { return dialog.parameters.targetViewId; },
      function( value ) { dialog.parameters.targetViewId = value; } );
   this.starsOnlyViewList = this.addViewSelector(
      this.inputSection.control.sizer,
      "Stars-only view:",
      "starsOnlyViewId",
      false,
      function() { return dialog.parameters.starsOnlyViewId; },
      function( value ) { dialog.parameters.starsOnlyViewId = value; } );
   this.starMaskViewList = this.addViewSelector(
      this.inputSection.control.sizer,
      "Star mask view:",
      "starMaskViewId",
      false,
      function() { return dialog.parameters.starMaskViewId; },
      function( value ) { dialog.parameters.starMaskViewId = value; } );

   this.iterationSection = this.createSection( "Iteration Control", "enableIterations",
      function() { return dialog.parameters.enableIterations; },
      function( value ) { dialog.parameters.enableIterations = value; },
      false );
   this.enableConvergenceCheck = this.addCheckBoxRow( this.iterationSection.control.sizer, "Enable convergence stop:", "enableConvergence",
      function() { return dialog.parameters.enableConvergence; },
      function( value ) { dialog.parameters.enableConvergence = value; } );
   this.convergenceMantissaControl = this.addNumericControl( this.iterationSection.control.sizer, "Convergence mantissa:", "convergenceEpsilon", 1, 9.999, 3, 900,
      function() { return dialog.decomposeConvergenceEpsilon( dialog.parameters.convergenceEpsilon ).mantissa; },
      function( value )
      {
         var decomposition = dialog.decomposeConvergenceEpsilon( dialog.parameters.convergenceEpsilon );
         dialog.parameters.convergenceEpsilon = dialog.clampConvergenceEpsilon(
            rbcClamp( value, 1, 9.999 ) * Math.pow( 10, decomposition.exponent ) );
         dialog.syncConvergenceControlsFromParameters();
      } );
   this.convergenceExponentCombo = this.addComboBoxRow( this.iterationSection.control.sizer, "Convergence exponent:", "convergenceEpsilon",
      [ "10^-3", "10^-4", "10^-5", "10^-6", "10^-7" ],
      function()
      {
         return format( "10^%d", dialog.decomposeConvergenceEpsilon( dialog.parameters.convergenceEpsilon ).exponent );
      },
      function( value )
      {
         var exponent = parseInt( value.substr( 3 ), 10 );
         var mantissa = dialog.decomposeConvergenceEpsilon( dialog.parameters.convergenceEpsilon ).mantissa;
         if ( isNaN( exponent ) )
            exponent = -5;
         dialog.parameters.convergenceEpsilon = dialog.clampConvergenceEpsilon(
            mantissa * Math.pow( 10, exponent ) );
         dialog.syncConvergenceControlsFromParameters();
      } );
   this.iterationsControl = this.addNumericControl( this.iterationSection.control.sizer, "Maximum number of iterations:", "iterations", 0, 150, 0, 150,
      function() { return dialog.parameters.iterations; },
      function( value ) { dialog.parameters.iterations = Math.round( value ); } );
   this.recomputeMasksCheck = this.addCheckBoxRow( this.iterationSection.control.sizer, "Recompute masks each iteration:", "recomputeMasksEachIteration",
      function() { return dialog.parameters.recomputeMasksEachIteration; },
      function( value ) { dialog.parameters.recomputeMasksEachIteration = value; } );
   this.recomputeInfluenceCheck = this.addCheckBoxRow( this.iterationSection.control.sizer, "Recompute star influence each iteration:", "recomputeStarInfluenceEachIteration",
      function() { return dialog.parameters.recomputeStarInfluenceEachIteration; },
      function( value ) { dialog.parameters.recomputeStarInfluenceEachIteration = value; } );

   this.starSupportSection = this.createSection( "Star Support", null, null, null, true );
   this.maskThresholdControl = this.addNumericControl( this.starSupportSection.control.sizer, "Mask threshold:", "maskThreshold", 0, 1, 3, 100,
      function() { return dialog.parameters.maskThreshold; },
      function( value ) { dialog.parameters.maskThreshold = value; } );
   this.maskDilationControl = this.addNumericControl( this.starSupportSection.control.sizer, "Mask dilation radius:", "maskDilationRadius", 0, 20, 0, 20,
      function() { return dialog.parameters.maskDilationRadius; },
      function( value ) { dialog.parameters.maskDilationRadius = Math.round( value ); } );
   this.maskBlurControl = this.addNumericControl( this.starSupportSection.control.sizer, "Mask blur radius:", "maskBlurRadius", 0, 20, 2, 200,
      function() { return dialog.parameters.maskBlurRadius; },
      function( value ) { dialog.parameters.maskBlurRadius = value; } );
   this.minimumStarAreaControl = this.addNumericControl( this.starSupportSection.control.sizer, "Minimum star area:", "minimumStarArea", 1, 256, 0, 255,
      function() { return dialog.parameters.minimumStarArea; },
      function( value ) { dialog.parameters.minimumStarArea = Math.round( value ); } );
   this.brightnessThresholdControl = this.addNumericControl( this.starSupportSection.control.sizer, "Brightness threshold:", "brightnessThreshold", 0, 1, 3, 100,
      function() { return dialog.parameters.brightnessThreshold; },
      function( value ) { dialog.parameters.brightnessThreshold = value; } );
   this.saturationThresholdControl = this.addNumericControl( this.starSupportSection.control.sizer, "Saturation threshold:", "saturationThreshold", 0, 1, 3, 100,
      function() { return dialog.parameters.saturationThreshold; },
      function( value ) { dialog.parameters.saturationThreshold = value; } );

   this.softBackgroundSection = this.createSection( "Soft Background Model", "enableSoftBackgroundModel",
      function() { return dialog.parameters.enableSoftBackgroundModel; },
      function( value ) { dialog.parameters.enableSoftBackgroundModel = value; },
      true );
   this.backgroundScaleControl = this.addNumericControl( this.softBackgroundSection.control.sizer, "Soft background sampling scale:", "backgroundSamplingScale", 8, 1024, 0, 512,
      function() { return dialog.parameters.backgroundSamplingScale; },
      function( value ) { dialog.parameters.backgroundSamplingScale = Math.round( value ); } );
   this.backgroundSmoothControl = this.addNumericControl( this.softBackgroundSection.control.sizer, "Soft background smoothing strength:", "backgroundSmoothingStrength", 0, 10, 0, 10,
      function() { return dialog.parameters.backgroundSmoothingStrength; },
      function( value ) { dialog.parameters.backgroundSmoothingStrength = Math.round( value ); } );

   this.rowSamplingSection = this.createSection( "Row Sampling", null, null, null, true );
   this.rowEstimatorCombo = this.addComboBoxRow( this.rowSamplingSection.control.sizer, "Row estimator type:", "rowEstimatorType", RBC_ROW_ESTIMATORS,
      function() { return dialog.parameters.rowEstimatorType; },
      function( value ) { dialog.parameters.rowEstimatorType = value; } );
   this.lowRejectControl = this.addNumericControl( this.rowSamplingSection.control.sizer, "Low rejection quantile:", "lowRejectQuantile", 0, 0.49, 3, 100,
      function() { return dialog.parameters.lowRejectQuantile; },
      function( value ) { dialog.parameters.lowRejectQuantile = value; } );
   this.highRejectControl = this.addNumericControl( this.rowSamplingSection.control.sizer, "High rejection quantile:", "highRejectQuantile", 0, 0.49, 3, 100,
      function() { return dialog.parameters.highRejectQuantile; },
      function( value ) { dialog.parameters.highRejectQuantile = value; } );
   this.minValidPixelsControl = this.addNumericControl( this.rowSamplingSection.control.sizer, "Minimum valid pixels per row:", "minimumValidPixelsPerRow", 8, 4096, 0, 500,
      function() { return dialog.parameters.minimumValidPixelsPerRow; },
      function( value ) { dialog.parameters.minimumValidPixelsPerRow = Math.round( value ); } );

   this.rowModelSection = this.createSection( "Row Model", "enableRowTrendCorrection",
      function() { return dialog.parameters.enableRowTrendCorrection; },
      function( value ) { dialog.parameters.enableRowTrendCorrection = value; },
      true );
   this.rowTrendRadiusControl = this.addNumericControl( this.rowModelSection.control.sizer, "Row trend smoothing radius:", "rowTrendSmoothingRadius", 1, 256, 0, 255,
      function() { return dialog.parameters.rowTrendSmoothingRadius; },
      function( value ) { dialog.parameters.rowTrendSmoothingRadius = Math.round( value ); } );
   this.globalStrengthControl = this.addNumericControl( this.rowModelSection.control.sizer, "Global correction strength:", "globalStrength", 0, 3, 2, 300,
      function() { return dialog.parameters.globalStrength; },
      function( value ) { dialog.parameters.globalStrength = value; } );
   this.maxCorrectionControl = this.addNumericControl( this.rowModelSection.control.sizer, "Maximum per-iteration correction:", "maximumPerIterationCorrection", 0, 0.25, 5, 250,
      function() { return dialog.parameters.maximumPerIterationCorrection; },
      function( value ) { dialog.parameters.maximumPerIterationCorrection = value; } );
   this.clippingPolicyCombo = this.addComboBoxRow( this.rowModelSection.control.sizer, "Additive correction clipping policy:", "clippingPolicy", RBC_CLIPPING_POLICIES,
      function() { return dialog.parameters.clippingPolicy; },
      function( value ) { dialog.parameters.clippingPolicy = value; } );

   this.starInfluenceSection = this.createSection( "Star Influence Modulation", "enableStarInfluence",
      function() { return dialog.parameters.enableStarInfluence; },
      function( value ) { dialog.parameters.enableStarInfluence = value; },
      true );
   this.starPeakWeightControl = this.addNumericControl( this.starInfluenceSection.control.sizer, "Star peak weight:", "starPeakWeight", 0, 2, 2, 200,
      function() { return dialog.parameters.starPeakWeight; },
      function( value ) { dialog.parameters.starPeakWeight = value; } );
   this.starFluxWeightControl = this.addNumericControl( this.starInfluenceSection.control.sizer, "Star flux weight:", "starFluxWeight", 0, 2, 2, 200,
      function() { return dialog.parameters.starFluxWeight; },
      function( value ) { dialog.parameters.starFluxWeight = value; } );
   this.starSaturationWeightControl = this.addNumericControl( this.starInfluenceSection.control.sizer, "Star saturation weight:", "starSaturationWeight", 0, 2, 2, 200,
      function() { return dialog.parameters.starSaturationWeight; },
      function( value ) { dialog.parameters.starSaturationWeight = value; } );
   this.starRadiusWeightControl = this.addNumericControl( this.starInfluenceSection.control.sizer, "Star radius weight:", "starRadiusWeight", 0, 2, 2, 200,
      function() { return dialog.parameters.starRadiusWeight; },
      function( value ) { dialog.parameters.starRadiusWeight = value; } );
   this.starInfluenceRadiusControl = this.addNumericControl( this.starInfluenceSection.control.sizer, "Star influence radius:", "starInfluenceRadius", 0, 20, 0, 20,
      function() { return dialog.parameters.starInfluenceRadius; },
      function( value ) { dialog.parameters.starInfluenceRadius = Math.round( value ); } );
   this.starKernelCombo = this.addComboBoxRow( this.starInfluenceSection.control.sizer, "Influence kernel:", "starInfluenceKernelType", RBC_KERNEL_TYPES,
      function() { return dialog.parameters.starInfluenceKernelType; },
      function( value ) { dialog.parameters.starInfluenceKernelType = value; } );
   this.localStarBoostControl = this.addNumericControl( this.starInfluenceSection.control.sizer, "Local star-weighted boost:", "localStarBoost", 0, 3, 2, 300,
      function() { return dialog.parameters.localStarBoost; },
      function( value ) { dialog.parameters.localStarBoost = value; } );

   this.protectionSection = this.createSection( "Protection Mask", "enableProtectionMask",
      function() { return dialog.parameters.enableProtectionMask; },
      function( value ) { dialog.parameters.enableProtectionMask = value; },
      true );
   this.protectionStrengthControl = this.addNumericControl( this.protectionSection.control.sizer, "Protection strength:", "protectionStrength", 0, 1, 2, 100,
      function() { return dialog.parameters.protectionStrength; },
      function( value ) { dialog.parameters.protectionStrength = value; } );

   this.visibilitySection = this.createSection( "Visibility Modulation", "enableRowVisibility",
      function() { return dialog.parameters.enableRowVisibility; },
      function( value ) { dialog.parameters.enableRowVisibility = value; },
      true );
   this.visibilityModeCombo = this.addComboBoxRow( this.visibilitySection.control.sizer, "Visibility estimator mode:", "visibilityMode", RBC_VISIBILITY_MODES,
      function() { return dialog.parameters.visibilityMode; },
      function( value ) { dialog.parameters.visibilityMode = value; } );
   this.visibilityRadiusControl = this.addNumericControl( this.visibilitySection.control.sizer, "Visibility smoothing radius:", "visibilitySmoothingRadius", 0, 64, 0, 64,
      function() { return dialog.parameters.visibilitySmoothingRadius; },
      function( value ) { dialog.parameters.visibilitySmoothingRadius = Math.round( value ); } );
   this.visibilityStrengthControl = this.addNumericControl( this.visibilitySection.control.sizer, "Visibility strength:", "visibilityStrength", 0, 2, 2, 200,
      function() { return dialog.parameters.visibilityStrength; },
      function( value ) { dialog.parameters.visibilityStrength = value; } );

   this.confidenceSection = this.createSection( "Confidence Modulation", "enableConfidenceWeighting",
      function() { return dialog.parameters.enableConfidenceWeighting; },
      function( value ) { dialog.parameters.enableConfidenceWeighting = value; },
      true );
   this.confidenceStrengthControl = this.addNumericControl( this.confidenceSection.control.sizer, "Confidence weighting strength:", "confidenceStrength", 0, 2, 2, 200,
      function() { return dialog.parameters.confidenceStrength; },
      function( value ) { dialog.parameters.confidenceStrength = value; } );

   this.diagnosticsSection = this.createSection( "Diagnostics", "enableDiagnostics",
      function() { return dialog.parameters.enableDiagnostics; },
      function( value ) { dialog.parameters.enableDiagnostics = value; },
      true );
   this.outputSoftBackgroundCheck = this.addCheckBoxRow( this.diagnosticsSection.control.sizer, "Output soft background model:", "outputSoftBackgroundModel",
      function() { return dialog.parameters.outputSoftBackgroundModel; },
      function( value ) { dialog.parameters.outputSoftBackgroundModel = value; } );
   this.outputWorkingCheck = this.addCheckBoxRow( this.diagnosticsSection.control.sizer, "Output working image:", "outputWorkingImage",
      function() { return dialog.parameters.outputWorkingImage; },
      function( value ) { dialog.parameters.outputWorkingImage = value; } );
   this.outputDifferenceCheck = this.addCheckBoxRow( this.diagnosticsSection.control.sizer, "Output difference image:", "outputDifferenceImage",
      function() { return dialog.parameters.outputDifferenceImage; },
      function( value ) { dialog.parameters.outputDifferenceImage = value; } );
   this.outputRowBackgroundCheck = this.addCheckBoxRow( this.diagnosticsSection.control.sizer, "Output row background plot:", "outputRowBackgroundPlot",
      function() { return dialog.parameters.outputRowBackgroundPlot; },
      function( value ) { dialog.parameters.outputRowBackgroundPlot = value; } );
   this.outputRowTrendCheck = this.addCheckBoxRow( this.diagnosticsSection.control.sizer, "Output row trend plot:", "outputRowTrendPlot",
      function() { return dialog.parameters.outputRowTrendPlot; },
      function( value ) { dialog.parameters.outputRowTrendPlot = value; } );
   this.outputRowResidualCheck = this.addCheckBoxRow( this.diagnosticsSection.control.sizer, "Output row residual plot:", "outputRowResidualPlot",
      function() { return dialog.parameters.outputRowResidualPlot; },
      function( value ) { dialog.parameters.outputRowResidualPlot = value; } );
   this.outputRowInfluenceCheck = this.addCheckBoxRow( this.diagnosticsSection.control.sizer, "Output row influence plot:", "outputRowInfluencePlot",
      function() { return dialog.parameters.outputRowInfluencePlot; },
      function( value ) { dialog.parameters.outputRowInfluencePlot = value; } );
   this.outputRowVisibilityCheck = this.addCheckBoxRow( this.diagnosticsSection.control.sizer, "Output row visibility plot:", "outputRowVisibilityPlot",
      function() { return dialog.parameters.outputRowVisibilityPlot; },
      function( value ) { dialog.parameters.outputRowVisibilityPlot = value; } );
   this.outputRowConfidenceCheck = this.addCheckBoxRow( this.diagnosticsSection.control.sizer, "Output row confidence plot:", "outputRowConfidencePlot",
      function() { return dialog.parameters.outputRowConfidencePlot; },
      function( value ) { dialog.parameters.outputRowConfidencePlot = value; } );
   this.outputRowCorrectionCheck = this.addCheckBoxRow( this.diagnosticsSection.control.sizer, "Output final correction plot:", "outputRowCorrectionPlot",
      function() { return dialog.parameters.outputRowCorrectionPlot; },
      function( value ) { dialog.parameters.outputRowCorrectionPlot = value; } );

   this.newInstanceButton = new ToolButton( this );
   this.newInstanceButton.icon = rbcScaledResource( this, ":/process-interface/new-instance.png" );
   rbcSetScaledFixedSize( this.newInstanceButton, 24, 24 );
   this.newInstanceButton.toolTip = "<p>Create a process instance with the current parameters.</p>";
   this.newInstanceButton.onMousePress = function()
   {
      dialog.parameters.ensureValid();
      dialog.parameters.exportParameters();
      this.hasFocus = true;
      this.pushed = false;
      dialog.newInstance();
   };

   this.resetButton = new PushButton( this );
   this.resetButton.text = "Reset";
   this.resetButton.toolTip = "<p>Restore conservative defaults from the specification.</p>";
   this.resetButton.onClick = function()
   {
      dialog.parameters.reset();
      dialog.syncControlsFromParameters();
      dialog.updateControlStates();
   };

   this.okButton = new PushButton( this );
   this.okButton.text = "Run";
   this.okButton.defaultButton = true;
   this.okButton.onClick = function()
   {
      dialog.parameters.ensureValid();
      if ( dialog.parameters.targetViewId.length == 0 )
      {
         (new MessageBox( "<p>A target image is required.</p>", TITLE, StdIcon_Error, StdButton_Ok )).execute();
         return;
      }
      dialog.ok();
   };

   this.cancelButton = new PushButton( this );
   this.cancelButton.text = "Cancel";
   this.cancelButton.onClick = function()
   {
      dialog.cancel();
   };

   this.buttonSizer = new HorizontalSizer;
   this.buttonSizer.spacing = 6;
   this.buttonSizer.add( this.newInstanceButton );
   this.buttonSizer.addStretch();
   this.buttonSizer.add( this.resetButton );
   this.buttonSizer.add( this.okButton );
   this.buttonSizer.add( this.cancelButton );

   this.sizer = new VerticalSizer;
   this.sizer.margin = 6;
   this.sizer.spacing = 6;
   this.sizer.add( this.helpLabel );
   this.sizer.add( this.inputSection.bar );
   this.sizer.add( this.inputSection.control );
   this.sizer.add( this.iterationSection.bar );
   this.sizer.add( this.iterationSection.control );
   this.sizer.add( this.starSupportSection.bar );
   this.sizer.add( this.starSupportSection.control );
   this.sizer.add( this.softBackgroundSection.bar );
   this.sizer.add( this.softBackgroundSection.control );
   this.sizer.add( this.rowSamplingSection.bar );
   this.sizer.add( this.rowSamplingSection.control );
   this.sizer.add( this.rowModelSection.bar );
   this.sizer.add( this.rowModelSection.control );
   this.sizer.add( this.starInfluenceSection.bar );
   this.sizer.add( this.starInfluenceSection.control );
   this.sizer.add( this.protectionSection.bar );
   this.sizer.add( this.protectionSection.control );
   this.sizer.add( this.visibilitySection.bar );
   this.sizer.add( this.visibilitySection.control );
   this.sizer.add( this.confidenceSection.bar );
   this.sizer.add( this.confidenceSection.control );
   this.sizer.add( this.diagnosticsSection.bar );
   this.sizer.add( this.diagnosticsSection.control );
   this.sizer.add( this.buttonSizer );

   this.syncControlsFromParameters = function()
   {
      var targetView = rbcFindViewById( dialog.parameters.targetViewId );
      if ( targetView != null )
         dialog.targetViewList.currentView = targetView;

      var starMaskView = rbcFindViewById( dialog.parameters.starMaskViewId );
      dialog.starMaskViewList.currentView = starMaskView != null ? starMaskView : new View();

      var starsOnlyView = rbcFindViewById( dialog.parameters.starsOnlyViewId );
      dialog.starsOnlyViewList.currentView = starsOnlyView != null ? starsOnlyView : new View();

      dialog.softBackgroundSection.bar.checkBox.checked = dialog.parameters.enableSoftBackgroundModel;
      dialog.rowModelSection.bar.checkBox.checked = dialog.parameters.enableRowTrendCorrection;
      dialog.starInfluenceSection.bar.checkBox.checked = dialog.parameters.enableStarInfluence;
      dialog.visibilitySection.bar.checkBox.checked = dialog.parameters.enableRowVisibility;
      dialog.confidenceSection.bar.checkBox.checked = dialog.parameters.enableConfidenceWeighting;
      dialog.protectionSection.bar.checkBox.checked = dialog.parameters.enableProtectionMask;
      dialog.iterationSection.bar.checkBox.checked = dialog.parameters.enableIterations;
      dialog.enableConvergenceCheck.checked = dialog.parameters.enableConvergence;
      dialog.diagnosticsSection.bar.checkBox.checked = dialog.parameters.enableDiagnostics;

      dialog.maskThresholdControl.setValue( dialog.parameters.maskThreshold );
      dialog.maskDilationControl.setValue( dialog.parameters.maskDilationRadius );
      dialog.maskBlurControl.setValue( dialog.parameters.maskBlurRadius );
      dialog.minimumStarAreaControl.setValue( dialog.parameters.minimumStarArea );
      dialog.brightnessThresholdControl.setValue( dialog.parameters.brightnessThreshold );
      dialog.saturationThresholdControl.setValue( dialog.parameters.saturationThreshold );
      dialog.starPeakWeightControl.setValue( dialog.parameters.starPeakWeight );
      dialog.starFluxWeightControl.setValue( dialog.parameters.starFluxWeight );
      dialog.starSaturationWeightControl.setValue( dialog.parameters.starSaturationWeight );
      dialog.starRadiusWeightControl.setValue( dialog.parameters.starRadiusWeight );
      dialog.starInfluenceRadiusControl.setValue( dialog.parameters.starInfluenceRadius );
      dialog.starKernelCombo.currentItem = Math.max( 0, RBC_KERNEL_TYPES.indexOf( dialog.parameters.starInfluenceKernelType ) );

      dialog.rowEstimatorCombo.currentItem = Math.max( 0, RBC_ROW_ESTIMATORS.indexOf( dialog.parameters.rowEstimatorType ) );
      dialog.lowRejectControl.setValue( dialog.parameters.lowRejectQuantile );
      dialog.highRejectControl.setValue( dialog.parameters.highRejectQuantile );
      dialog.minValidPixelsControl.setValue( dialog.parameters.minimumValidPixelsPerRow );
      dialog.backgroundScaleControl.setValue( dialog.parameters.backgroundSamplingScale );
      dialog.backgroundSmoothControl.setValue( dialog.parameters.backgroundSmoothingStrength );

      dialog.rowTrendRadiusControl.setValue( dialog.parameters.rowTrendSmoothingRadius );
      dialog.visibilityModeCombo.currentItem = Math.max( 0, RBC_VISIBILITY_MODES.indexOf( dialog.parameters.visibilityMode ) );
      dialog.visibilityRadiusControl.setValue( dialog.parameters.visibilitySmoothingRadius );
      dialog.visibilityStrengthControl.setValue( dialog.parameters.visibilityStrength );

      dialog.globalStrengthControl.setValue( dialog.parameters.globalStrength );
      dialog.localStarBoostControl.setValue( dialog.parameters.localStarBoost );
      dialog.confidenceStrengthControl.setValue( dialog.parameters.confidenceStrength );
      dialog.protectionStrengthControl.setValue( dialog.parameters.protectionStrength );
      dialog.maxCorrectionControl.setValue( dialog.parameters.maximumPerIterationCorrection );
      dialog.clippingPolicyCombo.currentItem = Math.max( 0, RBC_CLIPPING_POLICIES.indexOf( dialog.parameters.clippingPolicy ) );

      dialog.iterationsControl.setValue( dialog.parameters.iterations );
      dialog.syncConvergenceControlsFromParameters();
      dialog.recomputeMasksCheck.checked = dialog.parameters.recomputeMasksEachIteration;
      dialog.recomputeInfluenceCheck.checked = dialog.parameters.recomputeStarInfluenceEachIteration;

      dialog.outputSoftBackgroundCheck.checked = dialog.parameters.outputSoftBackgroundModel;
      dialog.outputWorkingCheck.checked = dialog.parameters.outputWorkingImage;
      dialog.outputDifferenceCheck.checked = dialog.parameters.outputDifferenceImage;
      dialog.outputRowBackgroundCheck.checked = dialog.parameters.outputRowBackgroundPlot;
      dialog.outputRowTrendCheck.checked = dialog.parameters.outputRowTrendPlot;
      dialog.outputRowResidualCheck.checked = dialog.parameters.outputRowResidualPlot;
      dialog.outputRowInfluenceCheck.checked = dialog.parameters.outputRowInfluencePlot;
      dialog.outputRowVisibilityCheck.checked = dialog.parameters.outputRowVisibilityPlot;
      dialog.outputRowConfidenceCheck.checked = dialog.parameters.outputRowConfidencePlot;
      dialog.outputRowCorrectionCheck.checked = dialog.parameters.outputRowCorrectionPlot;
   };

   this.updateControlStates = function()
   {
      dialog.softBackgroundSection.control.enabled = dialog.parameters.enableSoftBackgroundModel;
      dialog.rowModelSection.control.enabled = dialog.parameters.enableRowTrendCorrection;
      dialog.starInfluenceSection.control.enabled = dialog.parameters.enableStarInfluence;
      dialog.protectionSection.control.enabled = dialog.parameters.enableProtectionMask;
      dialog.visibilitySection.control.enabled = dialog.parameters.enableRowVisibility;
      dialog.confidenceSection.control.enabled = dialog.parameters.enableConfidenceWeighting;
      dialog.iterationSection.control.enabled = dialog.parameters.enableIterations;
      dialog.diagnosticsSection.control.enabled = dialog.parameters.enableDiagnostics;

      dialog.enableConvergenceCheck.enabled = dialog.parameters.enableIterations;
      dialog.convergenceMantissaControl.enabled = dialog.parameters.enableIterations && dialog.parameters.enableConvergence;
      dialog.convergenceExponentCombo.enabled = dialog.parameters.enableIterations && dialog.parameters.enableConvergence;
      dialog.iterationsControl.enabled = dialog.parameters.enableIterations;
      dialog.recomputeMasksCheck.enabled = dialog.parameters.enableIterations;
      dialog.recomputeInfluenceCheck.enabled = dialog.parameters.enableIterations;
   };

   if ( this.parameters.targetViewId.length == 0 )
   {
      var activeWindow = ImageWindow.activeWindow;
      if ( !activeWindow.isNull )
         this.parameters.targetViewId = activeWindow.currentView.id;
   }

   this.syncControlsFromParameters();
   this.updateControlStates();
   if ( typeof this.adjustToContents == "function" )
      this.adjustToContents();
   this.childToFocus = this.convergenceMantissaControl.edit;
   this.convergenceMantissaControl.edit.hasFocus = true;
   rbcSetScaledMinWidth( this, 760 );
}

RowBandingCompensationDialog.prototype = new Dialog;
