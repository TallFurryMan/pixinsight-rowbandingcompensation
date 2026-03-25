function RowBandingCompensationStarAnalyzer( parameters )
{
   this.parameters = parameters;

   this.analyze = function( maskSet, imageHeight )
   {
      var result = {
         starObjects: [],
         rowInfluence: this.zeroProfile( imageHeight ),
         usedFallbackProfile: false
      };

      if ( !this.parameters.enableStarInfluence || !maskSet.hasMask || maskSet.analysisImage == null )
         return result;

      var detector = new StarDetector;
      detector.sensitivity = 0.60;
      detector.peakResponse = 0.50;
      detector.allowClusteredSources = true;
      detector.maxDistortion = 1.00;
      detector.brightThreshold = 1.50;
      detector.minSNR = 0;
      detector.minStructureSize = this.parameters.minimumStarArea;
      detector.upperLimit = 1.00;

      var detectedStars = detector.stars( maskSet.analysisImage );
      if ( detectedStars == null )
         detectedStars = [];

      var keptStars = [];
      var maxFlux = 0;
      var maxRadius = 0;

      for ( var i = 0; i < detectedStars.length; ++i )
      {
         var measured = this.measureStar( maskSet.analysisImage, detectedStars[ i ] );
         if ( measured.area < this.parameters.minimumStarArea )
            continue;
         if ( measured.peakIntensity < this.parameters.brightnessThreshold )
            continue;

         if ( measured.integratedFlux > maxFlux )
            maxFlux = measured.integratedFlux;
         if ( measured.effectiveRadius > maxRadius )
            maxRadius = measured.effectiveRadius;

         keptStars.push( measured );
      }

      if ( keptStars.length == 0 )
      {
         result.rowInfluence = this.fallbackInfluence( maskSet.protectionImage, imageHeight );
         result.usedFallbackProfile = true;
         return result;
      }

      var totalWeight = Math.max(
         0.000001,
         this.parameters.starPeakWeight +
         this.parameters.starFluxWeight +
         this.parameters.starSaturationWeight +
         this.parameters.starRadiusWeight );

      for ( var j = 0; j < keptStars.length; ++j )
      {
         var star = keptStars[ j ];
         var peakScore = this.parameters.brightnessThreshold < 1
            ? rbcClamp( (star.peakIntensity - this.parameters.brightnessThreshold) / Math.max( 0.000001, 1 - this.parameters.brightnessThreshold ), 0, 1 )
            : 0;
         var fluxScore = maxFlux > 0 ? star.integratedFlux / maxFlux : 0;
         var saturationScore = star.saturationRatio;
         var radiusScore = maxRadius > 0 ? star.effectiveRadius / maxRadius : 0;

         star.estimatedInfluenceAmplitude = (
            this.parameters.starPeakWeight * peakScore +
            this.parameters.starFluxWeight * fluxScore +
            this.parameters.starSaturationWeight * saturationScore +
            this.parameters.starRadiusWeight * radiusScore ) / totalWeight;
      }

      result.starObjects = keptStars;
      result.rowInfluence = this.buildInfluenceProfile( imageHeight, keptStars );
      return result;
   };

   this.zeroProfile = function( length )
   {
      var zeros = new Array( length );
      for ( var i = 0; i < length; ++i )
         zeros[ i ] = 0;
      return zeros;
   };

   this.measureStar = function( image, detectedStar )
   {
      var rect = detectedStar.rect;
      var threshold = Math.max( detectedStar.bkg, this.parameters.maskThreshold * 0.5 );
      var integratedFlux = 0;
      var area = 0;
      var peakIntensity = 0;
      var saturatedPixelCount = 0;

      for ( var y = rect.y0; y < rect.y1; ++y )
      {
         var row = rbcReadRow( image, y );
         for ( var x = rect.x0; x < rect.x1; ++x )
         {
            var value = row[ x ];
            if ( value <= threshold )
               continue;
            ++area;
            integratedFlux += value;
            if ( value > peakIntensity )
               peakIntensity = value;
            if ( value >= this.parameters.saturationThreshold )
               ++saturatedPixelCount;
         }
      }

      if ( area == 0 )
         area = detectedStar.size;

      var effectiveRadius = Math.sqrt( area / Math.PI );

      return {
         centroid: { x: detectedStar.pos.x, y: detectedStar.pos.y },
         boundingBox: { x0: rect.x0, y0: rect.y0, x1: rect.x1, y1: rect.y1 },
         effectiveRadius: effectiveRadius,
         peakIntensity: peakIntensity,
         integratedFlux: integratedFlux > 0 ? integratedFlux : detectedStar.flux,
         saturatedPixelCount: saturatedPixelCount,
         saturationRatio: area > 0 ? saturatedPixelCount / area : 0,
         area: area,
         estimatedInfluenceAmplitude: 0
      };
   };

   this.buildInfluenceProfile = function( height, starObjects )
   {
      var influence = this.zeroProfile( height );
      var radius = Math.max( 0, this.parameters.starInfluenceRadius );

      for ( var i = 0; i < starObjects.length; ++i )
      {
         var star = starObjects[ i ];
         var centerRow = Math.round( star.centroid.y );
         var support = Math.max( radius, Math.ceil( star.effectiveRadius ) );
         if ( support == 0 )
            support = 1;

         for ( var y = Math.max( 0, centerRow - support ); y <= Math.min( height - 1, centerRow + support ); ++y )
         {
            var d = Math.abs( y - centerRow );
            influence[ y ] += star.estimatedInfluenceAmplitude * this.kernelWeight( d, support );
         }
      }

      return rbcNormalizeArray( influence );
   };

   this.kernelWeight = function( distance, radius )
   {
      if ( radius <= 0 )
         return 1;

      if ( this.parameters.starInfluenceKernelType == "Triangular" )
         return Math.max( 0, 1 - distance / (radius + 1) );

      if ( this.parameters.starInfluenceKernelType == "Box" )
         return distance <= radius ? 1 : 0;

      var sigma = Math.max( 0.5, radius / 2 );
      return Math.exp( -(distance * distance) / (2 * sigma * sigma) );
   };

   this.fallbackInfluence = function( image, imageHeight )
   {
      if ( image == null )
         return this.zeroProfile( imageHeight );

      var occupancy = new Array( imageHeight );
      for ( var y = 0; y < imageHeight; ++y )
      {
         var row = rbcReadRow( image, y );
         occupancy[ y ] = rbcMean( row );
      }
      return rbcNormalizeArray( occupancy );
   };
}
