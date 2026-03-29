import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { chromium } from "playwright";

const require = createRequire( import.meta.url );
const d3EntryPath = require.resolve( "d3" );
const d3ScriptPath = path.join( path.dirname( d3EntryPath ), "..", "dist", "d3.min.js" );
const FONT_FAMILY = "RbcDiagramSans";
const DIAGRAM_FONT_PATH = path.resolve( process.cwd(), "doc/assets/fonts/DejaVuSans.ttf" );

function createStyleText( fontDataUrl )
{
  return [
    `@font-face { font-family: "${FONT_FAMILY}"; src: url("${fontDataUrl}") format("truetype"); font-weight: 400 700; font-style: normal; }`,
    `.title { font: 700 22px "${FONT_FAMILY}", sans-serif; fill: #0f172a; }`,
    ".box { fill: #f8fafc; stroke: #334155; stroke-width: 1.6; }",
    ".box-input { fill: #fee2e2; }",
    ".box-output { fill: #dcfce7; }",
    ".line { stroke: #334155; stroke-width: 2.2; fill: none; marker-end: url(#arrow); }",
    ".loop { stroke: #64748b; stroke-width: 2; fill: none; stroke-dasharray: 7 6; marker-end: url(#arrow); }",
    `.label { font: 600 14px "${FONT_FAMILY}", sans-serif; fill: #0f172a; text-anchor: middle; }`,
    `.sub { font: 12px "${FONT_FAMILY}", sans-serif; fill: #475569; text-anchor: middle; }`,
    `.note { font: 12px "${FONT_FAMILY}", sans-serif; fill: #64748b; text-anchor: middle; }`,
    `.tag { font: 12px "${FONT_FAMILY}", sans-serif; fill: #64748b; text-anchor: middle; }`
  ].join( "\n" );
}

async function loadDiagramFontDataUrl()
{
  const fontBytes = await fs.readFile( DIAGRAM_FONT_PATH );
  return `data:font/ttf;base64,${fontBytes.toString( "base64" )}`;
}

function usage()
{
  throw new Error(
    "Usage: render-diagram.mjs <input.json> <output.svg> [<input.json> <output.svg> ...]" );
}

function pairArguments( argv )
{
  if ( argv.length < 2 || (argv.length % 2) !== 0 )
    usage();

  const jobs = [];
  for ( let i = 0; i < argv.length; i += 2 )
    jobs.push( { inputPath: argv[ i ], outputPath: argv[ i + 1 ] } );
  return jobs;
}

async function loadDiagramData( inputPath )
{
  return JSON.parse( await fs.readFile( inputPath, "utf8" ) );
}

async function ensureOutputDirectory( outputPath )
{
  await fs.mkdir( path.dirname( outputPath ), { recursive: true } );
}

async function renderSvg( browser, data )
{
  const page = await browser.newPage();
  try
  {
    await page.setContent(
      "<!doctype html><html><head><meta charset=\"utf-8\"></head><body><div id=\"root\"></div></body></html>" );
    await page.addScriptTag( { path: d3ScriptPath } );

    return await page.evaluate(
      async ({ diagram, styleText, fontFamily }) =>
      {
        const styleElement = document.createElement( "style" );
        styleElement.textContent = styleText;
        document.head.appendChild( styleElement );
        if ( document.fonts?.load )
        {
          await Promise.all( [
            document.fonts.load( `600 14px "${fontFamily}"` ),
            document.fonts.load( `12px "${fontFamily}"` ),
            document.fonts.load( `700 22px "${fontFamily}"` )
          ] );
          await document.fonts.ready;
        }

        function clampValue( value, low, high )
        {
          return Math.max( low, Math.min( high, value ) );
        }

        function computeViewerRect( diagram )
        {
          const margin = diagram.simulation?.margin ?? 24;
          const top = Math.max( margin, (diagram.separatorY ?? 0) + 24 );
          return {
            x: margin,
            y: top,
            width: Math.max( 1, diagram.width - 2 * margin ),
            height: Math.max( 1, diagram.height - top - margin )
          };
        }

        function computeViewerCenter( diagram )
        {
          const rect = computeViewerRect( diagram );
          return {
            x: rect.x + rect.width / 2,
            y: rect.y + rect.height / 2
          };
        }

        function computeStartPosition( diagram, rawNodes )
        {
          return computeViewerCenter( diagram );
        }

        function computeInitialOffset( index, totalNodes, spreadRadius )
        {
          const angle = (index / totalNodes) * Math.PI * 2;
          const radius = spreadRadius * (0.35 + 0.65 * Math.sqrt( (index + 0.5) / totalNodes ));
          return {
            dx: Math.cos( angle ) * radius,
            dy: Math.sin( angle ) * radius
          };
        }

        const NODE_BOX_LAYOUT = Object.freeze( {
          minWidth: 144,
          minHeight: 52,
          paddingX: 18,
          paddingTop: 15,
          paddingBottom: 13,
          lineGap: 6,
          titleFont: `600 14px "${fontFamily}"`,
          subtitleFont: `12px "${fontFamily}"`
        } );

        function createTextMeasurer()
        {
          const canvas = document.createElement( "canvas" );
          const context = canvas.getContext( "2d" );
          const cache = new Map();

          return function measureLine( text, font, fallbackAscent, fallbackDescent )
          {
            const normalizedText = text ?? "";
            const cacheKey = `${font}\n${normalizedText}`;
            if ( cache.has( cacheKey ) )
              return cache.get( cacheKey );

            context.font = font;
            const metrics = context.measureText( normalizedText || " " );
            const result = {
              width: Math.ceil( metrics.width || 0 ),
              ascent: Math.max( 1, Math.ceil( metrics.actualBoundingBoxAscent || fallbackAscent ) ),
              descent: Math.max( 1, Math.ceil( metrics.actualBoundingBoxDescent || fallbackDescent ) )
            };
            cache.set( cacheKey, result );
            return result;
          };
        }

        function resolveNodeBoxMetrics( node, measureLine )
        {
          const layout = NODE_BOX_LAYOUT;
          const titleMetrics = measureLine( node.title ?? "", layout.titleFont, 11, 4 );
          const subtitleMetrics = node.subtitle
            ? measureLine( node.subtitle, layout.subtitleFont, 9, 3 )
            : null;
          const fixedSize = node.fixedSize === true || node.autoSize === false;
          const contentWidth = Math.max( titleMetrics.width, subtitleMetrics ? subtitleMetrics.width : 0 );
          const measuredWidth = contentWidth + 2 * layout.paddingX;
          const measuredHeight = layout.paddingTop + titleMetrics.ascent + titleMetrics.descent
            + (subtitleMetrics ? layout.lineGap + subtitleMetrics.ascent + subtitleMetrics.descent : 0)
            + layout.paddingBottom;
          const width = Math.ceil(
            fixedSize
              ? (node.w ?? node.minW ?? measuredWidth)
              : Math.max( layout.minWidth, node.minW ?? 0, measuredWidth ) );
          const height = Math.ceil(
            fixedSize
              ? (node.h ?? node.minH ?? measuredHeight)
              : Math.max( layout.minHeight, node.minH ?? 0, measuredHeight ) );
          return {
            width: width,
            height: height,
            titleBaseline: layout.paddingTop + titleMetrics.ascent,
            subtitleBaseline: subtitleMetrics
              ? layout.paddingTop + titleMetrics.ascent + titleMetrics.descent + layout.lineGap + subtitleMetrics.ascent
              : null
          };
        }

        function normalizeFlowRole( node )
        {
          return node.flowRole == "input" || node.flowRole == "output"
            ? node.flowRole
            : "neutral";
        }

        function resolveFlowWeight( node )
        {
          if ( typeof node.flowWeight == "number" && isFinite( node.flowWeight ) )
            return Math.max( 0, node.flowWeight );

          switch ( node.flowWeight )
          {
          case "light":
            return 0.55;
          case "medium":
            return 0.78;
          case "heavy":
            return 1.0;
          default:
            return normalizeFlowRole( node ) == "input"
              ? 0.55
              : normalizeFlowRole( node ) == "output"
                ? 1.0
                : 0;
          }
        }

        function computeFlowTargetX( role, viewerRect, settings )
        {
          const inputRatio = clampValue( settings.flowInputTargetRatio ?? 0.16, 0.05, 0.45 );
          const outputRatio = clampValue( settings.flowOutputTargetRatio ?? 0.84, 0.55, 0.95 );
          switch ( role )
          {
          case "input":
            return viewerRect.x + viewerRect.width * inputRatio;
          case "output":
            return viewerRect.x + viewerRect.width * outputRatio;
          default:
            return viewerRect.x + viewerRect.width * 0.5;
          }
        }

        function computeNodeBoxClass( node )
        {
          switch ( normalizeFlowRole( { flowRole: node.boxRole } ) )
          {
          case "input":
            return "box box-input";
          case "output":
            return "box box-output";
          default:
            return "box";
          }
        }

        function prepareNodes( diagram, rawNodes )
        {
          const start = computeStartPosition( diagram, rawNodes );
          const viewerRect = computeViewerRect( diagram );
          const settings = diagram.simulation ?? {};
          const spreadRadius = diagram.simulation?.initialSpreadRadius ?? 18;
          const totalNodes = Math.max( 1, (rawNodes ?? []).length );
          const measureLine = createTextMeasurer();
          return (rawNodes ?? []).map(
            (node, index) =>
            {
              const boxMetrics = resolveNodeBoxMetrics( node, measureLine );
              const width = boxMetrics.width;
              const height = boxMetrics.height;
              const offset = computeInitialOffset( index, totalNodes, spreadRadius );
              const flowRole = normalizeFlowRole( node );
              return {
                ...node,
                id: node.id ?? `node_${index}`,
                _index: index,
                w: width,
                h: height,
                x: start.x + offset.dx,
                y: start.y + offset.dy,
                _boxClass: computeNodeBoxClass( node ),
                _flowRole: flowRole,
                _flowExplicitWeight: resolveFlowWeight( node ),
                _flowOrbitFactor: 1,
                _linkAvoidanceFactor: 1,
                _orbitTargetDistance: 0,
                _flowTargetX: computeFlowTargetX( flowRole, viewerRect, settings ),
                _flowHints: [],
                _labelBaselineOffset: boxMetrics.titleBaseline,
                _subBaselineOffset: boxMetrics.subtitleBaseline
              };
            } );
        }

        function assignFlowHints( nodes, rawLinks, viewerRect, settings )
        {
          const nodeById = new Map( nodes.map( node => [ node.id, node ] ) );
          const neighborWeightFactor = clampValue( settings.flowNeighborWeightFactor ?? 0.42, 0, 1 );
          const propagationDepth = Math.max( 0, settings.flowPropagationDepth ?? 1 );
          const neighborsById = new Map( nodes.map( node => [ node.id, [] ] ) );
          for ( const link of rawLinks ?? [] )
          {
            const sourceId = typeof link.source === "object" ? link.source.id : link.source;
            const targetId = typeof link.target === "object" ? link.target.id : link.target;
            const sourceNode = nodeById.get( sourceId );
            const targetNode = nodeById.get( targetId );
            if ( sourceNode == null || targetNode == null )
              continue;
            neighborsById.get( sourceNode.id ).push( targetNode );
            neighborsById.get( targetNode.id ).push( sourceNode );
          }

          for ( const node of nodes )
          {
            node._flowHints = [];
          }

          for ( const node of nodes )
          {
            if ( node._flowRole == "neutral" || node._flowExplicitWeight <= 0 )
              continue;
            const targetX = computeFlowTargetX( node._flowRole, viewerRect, settings );
            const explicitWeight = node._flowExplicitWeight * (node._flowOrbitFactor ?? 1);
            if ( explicitWeight <= 0 )
              continue;
            node._flowHints.push( { targetX, weight: explicitWeight } );

            if ( propagationDepth <= 0 || neighborWeightFactor <= 0 )
              continue;

            const visited = new Set( [ node.id ] );
            let frontier = [ node ];
            for ( let depth = 1; depth <= propagationDepth; ++depth )
            {
              const inheritedWeight = explicitWeight * Math.pow( neighborWeightFactor, depth );
              if ( inheritedWeight <= 0 )
                break;

              const nextFrontier = [];
              for ( const current of frontier )
              {
                for ( const neighbor of neighborsById.get( current.id ) ?? [] )
                {
                  if ( visited.has( neighbor.id ) )
                    continue;
                  visited.add( neighbor.id );
                  if ( neighbor._flowRole == "neutral" )
                  {
                    neighbor._flowHints.push( { targetX, weight: inheritedWeight } );
                    nextFrontier.push( neighbor );
                  }
                }
              }

              if ( nextFrontier.length == 0 )
                break;
              frontier = nextFrontier;
            }
          }
        }

        function computeRectangleExtentAlongDirection( node, dirX, dirY )
        {
          const halfWidth = node.w / 2;
          const halfHeight = node.h / 2;
          const denominator = Math.max(
            Math.abs( dirX ) / Math.max( halfWidth, 1.0e-6 ),
            Math.abs( dirY ) / Math.max( halfHeight, 1.0e-6 ) );
          return denominator > 1.0e-6 ? 1 / denominator : 0;
        }

        function computeNodePairTargetDistance( sourceNode, targetNode, minLinkDistance, dirX, dirY )
        {
          if ( typeof dirX == "number" && typeof dirY == "number" )
          {
            const directionLength = Math.hypot( dirX, dirY );
            if ( directionLength >= 1.0e-6 )
            {
              const ux = dirX / directionLength;
              const uy = dirY / directionLength;
              const directionalDistance = computeRectangleExtentAlongDirection( sourceNode, ux, uy )
                + computeRectangleExtentAlongDirection( targetNode, ux, uy )
                + minLinkDistance;
              return clampValue( directionalDistance, Math.max( sourceNode.w, targetNode.w ) * 0.5 + 24, 420 );
            }
          }

          const halfWidthSum = (sourceNode.w + targetNode.w) / 2;
          const halfHeightSum = (sourceNode.h + targetNode.h) / 2;
          const bodyRadius = Math.hypot( halfWidthSum, halfHeightSum ) * 0.5;
          return clampValue( bodyRadius + minLinkDistance, bodyRadius + 24, 420 );
        }

        function assignOrbitTargets( nodes, rawLinks, minNodeGap, settings )
        {
          const nodeById = new Map( nodes.map( node => [ node.id, node ] ) );
          const neighborsById = new Map( nodes.map( node => [ node.id, [] ] ) );
          for ( const link of rawLinks ?? [] )
          {
            const sourceId = typeof link.source === "object" ? link.source.id : link.source;
            const targetId = typeof link.target === "object" ? link.target.id : link.target;
            const sourceNode = nodeById.get( sourceId );
            const targetNode = nodeById.get( targetId );
            if ( sourceNode == null || targetNode == null )
              continue;
            neighborsById.get( sourceNode.id ).push( targetNode );
            neighborsById.get( targetNode.id ).push( sourceNode );
          }

          for ( const node of nodes )
          {
            node._orbitAnchor = null;
            node._orbitOffsetX = 0;
            node._orbitOffsetY = 0;
            node._orbitWeight = 0;
            node._flowOrbitFactor = 1;
            node._linkAvoidanceFactor = 1;
            node._orbitTargetDistance = 0;
            node._orbitTargetAngle = 0;
            node._orbitMaxAngleDeviation = 0;
          }

          const groups = new Map();
          for ( const node of nodes )
          {
            if ( node._flowRole == "neutral" )
              continue;
            const neighbors = neighborsById.get( node.id ) ?? [];
            if ( neighbors.length !== 1 )
              continue;
            const anchor = neighbors[ 0 ];
            const key = `${node._flowRole}:${anchor.id}`;
            if ( !groups.has( key ) )
              groups.set( key, [] );
            groups.get( key ).push( { node, anchor } );
          }

          const orbitSpacing = settings.orbitSpacing ?? Math.max( minNodeGap * 0.9, d3.max( nodes, node => node.h ) ?? 72 );
          const orbitSingleWeightFactor = clampValue( settings.orbitSingleWeightFactor ?? 0.82, 0, 1 );
          const orbitRadiusFactor = clampValue( settings.orbitRadiusFactor ?? 0.96, 0.45, 1.1 );
          const orbitFlowWeightFactor = clampValue( settings.orbitFlowWeightFactor ?? 0.22, 0, 1 );
          const orbitLinkAvoidanceFactor = clampValue( settings.orbitLinkAvoidanceFactor ?? 0.14, 0, 1 );
          const orbitAngularSpread = clampValue( settings.orbitAngularSpreadDegrees ?? 72, 10, 160 ) * Math.PI / 180;
          const orbitMaxAngleDeviation = clampValue( settings.orbitMaxAngleDeviationDegrees ?? 38, 5, 90 ) * Math.PI / 180;
          for ( const group of groups.values() )
          {
            group.sort( (a, b) => a.node.title.localeCompare( b.node.title ) );
            const midpoint = (group.length - 1) / 2;
            for ( let index = 0; index < group.length; ++index )
            {
              const entry = group[ index ];
              const baseAngle = entry.node._flowRole == "input" ? Math.PI : 0;
              const angleOffset = group.length == 1
                ? 0
                : ((index - midpoint) / Math.max( midpoint, 1 )) * (orbitAngularSpread * 0.5);
              const angle = baseAngle + angleOffset;
              const radius = computeNodePairTargetDistance(
                entry.node,
                entry.anchor,
                minNodeGap,
                Math.cos( angle ),
                Math.sin( angle ) ) * orbitRadiusFactor;
              entry.node._orbitAnchor = entry.anchor;
              entry.node._orbitOffsetX = Math.cos( angle ) * radius;
              entry.node._orbitOffsetY = Math.sin( angle ) * radius;
              entry.node._orbitWeight = group.length == 1 ? orbitSingleWeightFactor : 1;
              entry.node._flowOrbitFactor = orbitFlowWeightFactor;
              entry.node._linkAvoidanceFactor = orbitLinkAvoidanceFactor;
              entry.node._orbitTargetDistance = radius;
              entry.node._orbitTargetAngle = angle;
              entry.node._orbitMaxAngleDeviation = orbitMaxAngleDeviation;
            }
          }
        }

        function assignBisectorTargets( nodes, rawLinks, minNodeGap, settings )
        {
          const nodeById = new Map( nodes.map( node => [ node.id, node ] ) );
          const neighborsById = new Map( nodes.map( node => [ node.id, [] ] ) );
          for ( const link of rawLinks ?? [] )
          {
            const sourceId = typeof link.source === "object" ? link.source.id : link.source;
            const targetId = typeof link.target === "object" ? link.target.id : link.target;
            const sourceNode = nodeById.get( sourceId );
            const targetNode = nodeById.get( targetId );
            if ( sourceNode == null || targetNode == null )
              continue;
            neighborsById.get( sourceNode.id ).push( targetNode );
            neighborsById.get( targetNode.id ).push( sourceNode );
          }

          const offsetDistance = settings.bisectorOffsetDistance ?? Math.max( minNodeGap * 1.05, 88 );
          const bisectorLinkAvoidanceFactor = clampValue( settings.bisectorLinkAvoidanceFactor ?? 0.18, 0, 1 );
          const bisectorMaxDeviation = settings.bisectorMaxDeviation ?? offsetDistance * 1.25;
          for ( const node of nodes )
          {
            node._bisectorA = null;
            node._bisectorB = null;
            node._bisectorOffset = 0;
            node._bisectorWeight = 0;
            node._bisectorMaxDeviation = 0;

            if ( node._flowRole != "neutral" || node._orbitAnchor != null )
              continue;

            const neighbors = neighborsById.get( node.id ) ?? [];
            if ( neighbors.length != 2 )
              continue;

            const a = neighbors[ 0 ];
            const b = neighbors[ 1 ];
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const length = Math.hypot( dx, dy );
            if ( length < 1.0e-6 )
              continue;

            const normalX = -dy / length;
            const normalY = dx / length;
            const midpointX = (a.x + b.x) / 2;
            const midpointY = (a.y + b.y) / 2;
            let direction = Math.sign( (node.x - midpointX) * normalX + (node.y - midpointY) * normalY );
            if ( direction == 0 )
            {
              const fallbackAngle = ((node._index + 1) * 29 + (a._index + 1) * 17 + (b._index + 1) * 13) * 2.399963229728653;
              direction = Math.cos( fallbackAngle ) >= 0 ? 1 : -1;
            }

            node._bisectorA = a;
            node._bisectorB = b;
            node._bisectorOffset = direction * offsetDistance;
            node._bisectorWeight = 1;
            node._bisectorMaxDeviation = bisectorMaxDeviation;
            node._linkAvoidanceFactor = Math.min( node._linkAvoidanceFactor ?? 1, bisectorLinkAvoidanceFactor );
          }
        }

        function assignCentroidTargets( nodes, rawLinks, settings )
        {
          const nodeById = new Map( nodes.map( node => [ node.id, node ] ) );
          const neighborsById = new Map( nodes.map( node => [ node.id, [] ] ) );
          for ( const link of rawLinks ?? [] )
          {
            const sourceId = typeof link.source === "object" ? link.source.id : link.source;
            const targetId = typeof link.target === "object" ? link.target.id : link.target;
            const sourceNode = nodeById.get( sourceId );
            const targetNode = nodeById.get( targetId );
            if ( sourceNode == null || targetNode == null )
              continue;
            neighborsById.get( sourceNode.id ).push( targetNode );
            neighborsById.get( targetNode.id ).push( sourceNode );
          }

          for ( const node of nodes )
          {
            node._centroidNeighbors = null;
            node._centroidWeight = 0;
            node._centroidMaxDeviation = 0;

            if ( node._flowRole != "neutral" || node._orbitAnchor != null || node._bisectorA != null )
              continue;

            const neighbors = neighborsById.get( node.id ) ?? [];
            if ( neighbors.length < 3 )
              continue;

            node._centroidNeighbors = neighbors;
            node._centroidWeight = 1;
            node._centroidMaxDeviation = settings.centroidMaxDeviation ?? Math.max( 140, neighbors.length * 42 );
            node._linkAvoidanceFactor = Math.min( node._linkAvoidanceFactor ?? 1, clampValue( settings.centroidLinkAvoidanceFactor ?? 0.22, 0, 1 ) );
          }
        }

        function enforceMinimumNodeGap( nodes, minGap, strength, iterations )
        {
          function signedDirection( delta, fallback )
          {
            if ( Math.abs( delta ) >= 1.0e-6 )
              return delta >= 0 ? 1 : -1;
            if ( Math.abs( fallback ) >= 1.0e-6 )
              return fallback >= 0 ? 1 : -1;
            return 1;
          }

          for ( let iteration = 0; iteration < iterations; ++iteration )
          {
            for ( let i = 0; i < nodes.length; ++i )
            {
              const a = nodes[ i ];
              for ( let j = i + 1; j < nodes.length; ++j )
              {
                const b = nodes[ j ];
                const dx = b.x - a.x;
                const dy = b.y - a.y;
                const halfWidthSum = (a.w + b.w) / 2;
                const halfHeightSum = (a.h + b.h) / 2;
                const sepX = Math.abs( dx ) - halfWidthSum;
                const sepY = Math.abs( dy ) - halfHeightSum;
                const gapX = Math.max( 0, sepX );
                const gapY = Math.max( 0, sepY );
                const edgeGap = Math.hypot( gapX, gapY );
                if ( edgeGap >= minGap )
                  continue;

                const fallbackAngle = ((i + 1) * 31 + (j + 1) * 17) * 2.399963229728653;
                const fallbackDx = Math.cos( fallbackAngle );
                const fallbackDy = Math.sin( fallbackAngle );
                if ( sepX < 0 && sepY < 0 )
                {
                  const overlapX = -sepX + minGap;
                  const overlapY = -sepY + minGap;
                  if ( overlapX < overlapY )
                  {
                    const shift = overlapX * 0.5 * strength;
                    const direction = signedDirection( dx, fallbackDx );
                    a.x -= direction * shift;
                    b.x += direction * shift;
                  }
                  else
                  {
                    const shift = overlapY * 0.5 * strength;
                    const direction = signedDirection( dy, fallbackDy );
                    a.y -= direction * shift;
                    b.y += direction * shift;
                  }
                }
                else
                {
                  const shift = (minGap - edgeGap) * 0.5 * strength;
                  const directionX = Math.abs( dx ) >= 1.0e-6 ? dx : fallbackDx;
                  const directionY = Math.abs( dy ) >= 1.0e-6 ? dy : fallbackDy;
                  const length = Math.hypot( directionX, directionY ) || 1;
                  const nx = directionX / length;
                  const ny = directionY / length;
                  a.x -= nx * shift;
                  a.y -= ny * shift;
                  b.x += nx * shift;
                  b.y += ny * shift;
                }
              }
            }
          }
        }

        function computeLinkBaseStrength( link, linkStrength, loopLinkStrengthFactor )
        {
          if ( link.forceStrength != null )
            return link.forceStrength;
          return linkStrength;
        }

        function computeLinkDistance( link, minLinkDistance )
        {
          const halfWidthSum = (link.source.w + link.target.w) / 2;
          const halfHeightSum = (link.source.h + link.target.h) / 2;
          const bodyRadius = Math.hypot( halfWidthSum, halfHeightSum ) * 0.5;
          return clampValue( bodyRadius + minLinkDistance, bodyRadius + 24, 420 );
        }

        function computeRectangleIntersection( node, toward )
        {
          const dx = toward.x - node.x;
          const dy = toward.y - node.y;

          if ( Math.abs( dx ) < 1.0e-6 && Math.abs( dy ) < 1.0e-6 )
            return { x: node.x, y: node.y - node.h / 2 };

          const halfWidth = node.w / 2;
          const halfHeight = node.h / 2;
          const scale = 1 / Math.max( Math.abs( dx ) / halfWidth, Math.abs( dy ) / halfHeight );
          return {
            x: node.x + dx * scale,
            y: node.y + dy * scale
          };
        }

        function computeRenderedLinkSegment( link )
        {
          return [
            computeRectangleIntersection( link.source, link.target ),
            computeRectangleIntersection( link.target, link.source )
          ];
        }

        function createOrbitForce()
        {
          let nodes = [];
          let strengthAccessor = () => 0;

          function force( alpha )
          {
            for ( const node of nodes )
            {
              if ( node._orbitAnchor == null )
                continue;
              const strength = strengthAccessor( node );
              if ( strength <= 0 )
                continue;
              const targetX = node._orbitAnchor.x + node._orbitOffsetX;
              const targetY = node._orbitAnchor.y + node._orbitOffsetY;
              node.vx += (targetX - node.x) * strength * alpha;
              node.vy += (targetY - node.y) * strength * alpha;
            }
          }

          force.initialize = function( newNodes )
          {
            nodes = newNodes ?? [];
          };

          force.strength = function( value )
          {
            if ( arguments.length === 0 )
              return strengthAccessor;
            strengthAccessor = typeof value == "function"
              ? value
              : () => value;
            return force;
          };

          return force;
        }

        function createBisectorForce()
        {
          let nodes = [];
          let strengthAccessor = () => 0;

          function force( alpha )
          {
            for ( const node of nodes )
            {
              if ( node._bisectorA == null || node._bisectorB == null )
                continue;

              const strength = strengthAccessor( node );
              if ( strength <= 0 )
                continue;

              const a = node._bisectorA;
              const b = node._bisectorB;
              const midpointX = (a.x + b.x) / 2;
              const midpointY = (a.y + b.y) / 2;
              const dx = b.x - a.x;
              const dy = b.y - a.y;
              const length = Math.hypot( dx, dy );
              if ( length < 1.0e-6 )
                continue;

              const normalX = -dy / length;
              const normalY = dx / length;
              const targetX = midpointX + normalX * node._bisectorOffset;
              const targetY = midpointY + normalY * node._bisectorOffset;
              node.vx += (targetX - node.x) * strength * alpha;
              node.vy += (targetY - node.y) * strength * alpha;
            }
          }

          force.initialize = function( newNodes )
          {
            nodes = newNodes ?? [];
          };

          force.strength = function( value )
          {
            if ( arguments.length === 0 )
              return strengthAccessor;
            strengthAccessor = typeof value == "function"
              ? value
              : () => value;
            return force;
          };

          return force;
        }

        function createCentroidForce()
        {
          let nodes = [];
          let strengthAccessor = () => 0;

          function force( alpha )
          {
            for ( const node of nodes )
            {
              if ( !Array.isArray( node._centroidNeighbors ) || node._centroidNeighbors.length == 0 )
                continue;

              const strength = strengthAccessor( node );
              if ( strength <= 0 )
                continue;

              let sumX = 0;
              let sumY = 0;
              for ( const neighbor of node._centroidNeighbors )
              {
                sumX += neighbor.x;
                sumY += neighbor.y;
              }
              const targetX = sumX / node._centroidNeighbors.length;
              const targetY = sumY / node._centroidNeighbors.length;
              node.vx += (targetX - node.x) * strength * alpha;
              node.vy += (targetY - node.y) * strength * alpha;
            }
          }

          force.initialize = function( newNodes )
          {
            nodes = newNodes ?? [];
          };

          force.strength = function( value )
          {
            if ( arguments.length === 0 )
              return strengthAccessor;
            strengthAccessor = typeof value == "function"
              ? value
              : () => value;
            return force;
          };

          return force;
        }

        function createLinkTensionForce( links, compressionFactor, exponent )
        {
          let strengthAccessor = () => 0;

          function force( alpha )
          {
            for ( const link of links )
            {
              if ( link.source == null || link.target == null )
                continue;

              const dx = link.target.x - link.source.x;
              const dy = link.target.y - link.source.y;
              const length = Math.hypot( dx, dy );
              if ( length < 1.0e-6 )
                continue;

              const targetDistance = Math.max( 1, link._targetDistance ?? length );
              const error = length - targetDistance;
              if ( Math.abs( error ) < 1.0e-6 )
                continue;

              let strength = strengthAccessor( link );
              if ( error < 0 )
                strength *= compressionFactor;
              if ( strength <= 0 )
                continue;

              const normalizedError = Math.abs( error ) / targetDistance;
              const nonlinearScale = Math.pow( Math.max( normalizedError, 1.0e-6 ), exponent - 1 );
              const impulse = Math.min(
                strength * alpha * Math.abs( error ) * nonlinearScale,
                targetDistance * 0.22 );
              const direction = error >= 0 ? 1 : -1;
              const nx = dx / length;
              const ny = dy / length;
              const shift = impulse * direction * 0.5;

              link.source.vx += nx * shift;
              link.source.vy += ny * shift;
              link.target.vx -= nx * shift;
              link.target.vy -= ny * shift;
            }
          }

          force.initialize = function()
          {
          };

          force.strength = function( value )
          {
            if ( arguments.length === 0 )
              return strengthAccessor;
            strengthAccessor = typeof value == "function"
              ? value
              : () => value;
            return force;
          };

          return force;
        }

        function createLinkAvoidanceForce( links, clearanceDistance, endpointReaction )
        {
          let nodes = [];
          let strengthAccessor = () => 0;

          function shouldSkipNodeLinkPair( node, link )
          {
            if ( link.source == null || link.target == null )
              return true;
            if ( link.source === node || link.target === node )
              return true;

            const orbitAnchor = node._orbitAnchor;
            if ( orbitAnchor != null && (link.source === orbitAnchor || link.target === orbitAnchor) )
              return true;

            return false;
          }

          function force( alpha )
          {
            for ( let nodeIndex = 0; nodeIndex < nodes.length; ++nodeIndex )
            {
              const node = nodes[ nodeIndex ];
              for ( let linkIndex = 0; linkIndex < links.length; ++linkIndex )
              {
                const link = links[ linkIndex ];
                if ( shouldSkipNodeLinkPair( node, link ) )
                  continue;

                const segment = computeRenderedLinkSegment( link );
                const a = segment[ 0 ];
                const b = segment[ 1 ];
                const dx = b.x - a.x;
                const dy = b.y - a.y;
                const segmentLengthSquared = dx * dx + dy * dy;
                if ( segmentLengthSquared < 1.0e-6 )
                  continue;

                const projectionT = clampValue(
                  ((node.x - a.x) * dx + (node.y - a.y) * dy) / segmentLengthSquared,
                  0,
                  1 );
                const projectionX = a.x + dx * projectionT;
                const projectionY = a.y + dy * projectionT;
                const segmentLength = Math.sqrt( segmentLengthSquared );
                const normalX = -dy / segmentLength;
                const normalY = dx / segmentLength;
                let signedDistance = (node.x - projectionX) * normalX + (node.y - projectionY) * normalY;
                const halfNormalExtent = Math.abs( normalX ) * node.w / 2 + Math.abs( normalY ) * node.h / 2;
                const corridorRadius = halfNormalExtent + clearanceDistance;
                const penetration = corridorRadius - Math.abs( signedDistance );
                if ( penetration <= 0 )
                  continue;

                let direction = Math.sign( signedDistance );
                if ( direction == 0 )
                {
                  const midpointX = (a.x + b.x) / 2;
                  const midpointY = (a.y + b.y) / 2;
                  signedDistance = (node.x - midpointX) * normalX + (node.y - midpointY) * normalY;
                  direction = Math.sign( signedDistance );
                }
                if ( direction == 0 )
                {
                  const fallbackAngle = ((node._index + 1) * 37 + (linkIndex + 1) * 19) * 2.399963229728653;
                  direction = Math.cos( fallbackAngle ) >= 0 ? 1 : -1;
                }

                const strength = strengthAccessor( node, link, penetration, projectionT );
                const nodeFactor = node._linkAvoidanceFactor ?? 1;
                if ( strength <= 0 || nodeFactor <= 0 )
                  continue;

                const impulse = penetration * strength * nodeFactor * alpha;
                node.vx += normalX * direction * impulse;
                node.vy += normalY * direction * impulse;

                if ( endpointReaction > 0 )
                {
                  const reaction = impulse * endpointReaction;
                  const sourceShare = 1 - projectionT;
                  const targetShare = projectionT;
                  link.source.vx -= normalX * direction * reaction * sourceShare;
                  link.source.vy -= normalY * direction * reaction * sourceShare;
                  link.target.vx -= normalX * direction * reaction * targetShare;
                  link.target.vy -= normalY * direction * reaction * targetShare;
                }
              }
            }
          }

          force.initialize = function( newNodes )
          {
            nodes = newNodes ?? [];
          };

          force.strength = function( value )
          {
            if ( arguments.length === 0 )
              return strengthAccessor;
            strengthAccessor = typeof value == "function"
              ? value
              : () => value;
            return force;
          };

          return force;
        }

        function enforceLinkAvoidance( nodes, links, clearanceDistance, strength, endpointReaction, iterations )
        {
          if ( strength <= 0 || iterations <= 0 )
            return;

          function shouldSkipNodeLinkPair( node, link )
          {
            if ( link.source == null || link.target == null )
              return true;
            if ( link.source === node || link.target === node )
              return true;

            const orbitAnchor = node._orbitAnchor;
            if ( orbitAnchor != null && (link.source === orbitAnchor || link.target === orbitAnchor) )
              return true;

            return false;
          }

          for ( let iteration = 0; iteration < iterations; ++iteration )
          {
            for ( let nodeIndex = 0; nodeIndex < nodes.length; ++nodeIndex )
            {
              const node = nodes[ nodeIndex ];
              for ( let linkIndex = 0; linkIndex < links.length; ++linkIndex )
              {
                const link = links[ linkIndex ];
                if ( shouldSkipNodeLinkPair( node, link ) )
                  continue;

                const segment = computeRenderedLinkSegment( link );
                const a = segment[ 0 ];
                const b = segment[ 1 ];
                const dx = b.x - a.x;
                const dy = b.y - a.y;
                const segmentLengthSquared = dx * dx + dy * dy;
                if ( segmentLengthSquared < 1.0e-6 )
                  continue;

                const projectionT = clampValue(
                  ((node.x - a.x) * dx + (node.y - a.y) * dy) / segmentLengthSquared,
                  0,
                  1 );
                const projectionX = a.x + dx * projectionT;
                const projectionY = a.y + dy * projectionT;
                const segmentLength = Math.sqrt( segmentLengthSquared );
                const normalX = -dy / segmentLength;
                const normalY = dx / segmentLength;
                let signedDistance = (node.x - projectionX) * normalX + (node.y - projectionY) * normalY;
                const halfNormalExtent = Math.abs( normalX ) * node.w / 2 + Math.abs( normalY ) * node.h / 2;
                const corridorRadius = halfNormalExtent + clearanceDistance;
                const penetration = corridorRadius - Math.abs( signedDistance );
                const nodeFactor = node._linkAvoidanceFactor ?? 1;
                if ( penetration <= 0 || nodeFactor <= 0 )
                  continue;

                let direction = Math.sign( signedDistance );
                if ( direction == 0 )
                {
                  const midpointX = (a.x + b.x) / 2;
                  const midpointY = (a.y + b.y) / 2;
                  signedDistance = (node.x - midpointX) * normalX + (node.y - midpointY) * normalY;
                  direction = Math.sign( signedDistance );
                }
                if ( direction == 0 )
                {
                  const fallbackAngle = ((node._index + 1) * 37 + (linkIndex + 1) * 19) * 2.399963229728653;
                  direction = Math.cos( fallbackAngle ) >= 0 ? 1 : -1;
                }

                const shift = penetration * strength * nodeFactor * 0.5;
                node.x += normalX * direction * shift;
                node.y += normalY * direction * shift;

                if ( endpointReaction > 0 )
                {
                  const reaction = shift * endpointReaction;
                  const sourceShare = 1 - projectionT;
                  const targetShare = projectionT;
                  link.source.x -= normalX * direction * reaction * sourceShare;
                  link.source.y -= normalY * direction * reaction * sourceShare;
                  link.target.x -= normalX * direction * reaction * targetShare;
                  link.target.y -= normalY * direction * reaction * targetShare;
                }
              }
            }
          }
        }

        function applyBoundCorrection( node, targetX, targetY, relaxation, maxStep )
        {
          const blend = clampValue( relaxation, 0, 1 );
          if ( blend <= 0 )
            return;

          const dx = targetX - node.x;
          const dy = targetY - node.y;
          const distance = Math.hypot( dx, dy );
          if ( distance < 1.0e-6 )
            return;

          let scale = blend;
          if ( maxStep > 0 )
            scale = Math.min( scale, maxStep / distance );

          node.x += dx * scale;
          node.y += dy * scale;
        }

        function enforceOrbitRadiusBounds( nodes, maxRadiusFactor, relaxation, maxStep )
        {
          if ( maxRadiusFactor <= 0 )
            return;

          for ( const node of nodes )
          {
            const anchor = node._orbitAnchor;
            const targetDistance = node._orbitTargetDistance ?? 0;
            if ( anchor == null || targetDistance <= 0 )
              continue;

            const dx = node.x - anchor.x;
            const dy = node.y - anchor.y;
            const distance = Math.hypot( dx, dy );
            const maxDistance = targetDistance * maxRadiusFactor;
            if ( distance <= maxDistance || distance < 1.0e-6 )
              continue;

            const scale = maxDistance / distance;
            applyBoundCorrection(
              node,
              anchor.x + dx * scale,
              anchor.y + dy * scale,
              relaxation,
              maxStep );
          }
        }

        function normalizeAngleDelta( angle )
        {
          while ( angle <= -Math.PI )
            angle += Math.PI * 2;
          while ( angle > Math.PI )
            angle -= Math.PI * 2;
          return angle;
        }

        function enforceOrbitAngleBounds( nodes, relaxation, maxStep )
        {
          for ( const node of nodes )
          {
            const anchor = node._orbitAnchor;
            const targetDistance = node._orbitTargetDistance ?? 0;
            const maxDeviation = node._orbitMaxAngleDeviation ?? 0;
            if ( anchor == null || targetDistance <= 0 || maxDeviation <= 0 )
              continue;

            const dx = node.x - anchor.x;
            const dy = node.y - anchor.y;
            const distance = Math.hypot( dx, dy );
            if ( distance < 1.0e-6 )
              continue;

            const currentAngle = Math.atan2( dy, dx );
            const targetAngle = node._orbitTargetAngle ?? currentAngle;
            const delta = normalizeAngleDelta( currentAngle - targetAngle );
            if ( Math.abs( delta ) <= maxDeviation )
              continue;

            const clampedAngle = targetAngle + Math.sign( delta ) * maxDeviation;
            applyBoundCorrection(
              node,
              anchor.x + Math.cos( clampedAngle ) * distance,
              anchor.y + Math.sin( clampedAngle ) * distance,
              relaxation,
              maxStep );
          }
        }

        function enforceBisectorBounds( nodes, relaxation, maxStep )
        {
          for ( const node of nodes )
          {
            if ( node._bisectorA == null || node._bisectorB == null )
              continue;

            const maxDeviation = node._bisectorMaxDeviation ?? 0;
            if ( maxDeviation <= 0 )
              continue;

            const a = node._bisectorA;
            const b = node._bisectorB;
            const midpointX = (a.x + b.x) / 2;
            const midpointY = (a.y + b.y) / 2;
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const length = Math.hypot( dx, dy );
            if ( length < 1.0e-6 )
              continue;

            const normalX = -dy / length;
            const normalY = dx / length;
            const targetX = midpointX + normalX * node._bisectorOffset;
            const targetY = midpointY + normalY * node._bisectorOffset;
            const offsetX = node.x - targetX;
            const offsetY = node.y - targetY;
            const deviation = Math.hypot( offsetX, offsetY );
            if ( deviation <= maxDeviation || deviation < 1.0e-6 )
              continue;

            const scale = maxDeviation / deviation;
            applyBoundCorrection(
              node,
              targetX + offsetX * scale,
              targetY + offsetY * scale,
              relaxation,
              maxStep );
          }
        }

        function enforceCentroidBounds( nodes, relaxation, maxStep )
        {
          for ( const node of nodes )
          {
            if ( !Array.isArray( node._centroidNeighbors ) || node._centroidNeighbors.length == 0 )
              continue;

            const maxDeviation = node._centroidMaxDeviation ?? 0;
            if ( maxDeviation <= 0 )
              continue;

            let sumX = 0;
            let sumY = 0;
            for ( const neighbor of node._centroidNeighbors )
            {
              sumX += neighbor.x;
              sumY += neighbor.y;
            }
            const targetX = sumX / node._centroidNeighbors.length;
            const targetY = sumY / node._centroidNeighbors.length;
            const dx = node.x - targetX;
            const dy = node.y - targetY;
            const deviation = Math.hypot( dx, dy );
            if ( deviation <= maxDeviation || deviation < 1.0e-6 )
              continue;

            const scale = maxDeviation / deviation;
            applyBoundCorrection(
              node,
              targetX + dx * scale,
              targetY + dy * scale,
              relaxation,
              maxStep );
          }
        }

        function createFlowXForce( falloffDistance )
        {
          let nodes = [];
          let strengthAccessor = () => 0;

          function force( alpha )
          {
            for ( const node of nodes )
            {
              if ( !Array.isArray( node._flowHints ) || node._flowHints.length == 0 )
                continue;
              const strength = strengthAccessor( node );
              if ( strength <= 0 )
                continue;

              let totalPull = 0;
              for ( const hint of node._flowHints )
              {
                const dx = hint.targetX - node.x;
                const boundedDx = falloffDistance * Math.tanh( dx / falloffDistance );
                totalPull += boundedDx * hint.weight;
              }

              node.vx += totalPull * strength * alpha;
            }
          }

          force.initialize = function( newNodes )
          {
            nodes = newNodes ?? [];
          };

          force.strength = function( value )
          {
            if ( arguments.length === 0 )
              return strengthAccessor;
            strengthAccessor = typeof value == "function"
              ? value
              : () => value;
            return force;
          };

          return force;
        }

        function computeRampProgress( tickIndex, delayTicks, rampTicks )
        {
          return clampValue( (tickIndex - delayTicks) / Math.max( 1, rampTicks ), 0, 1 );
        }

        function applyForceRamp( forces, tickIndex )
        {
          const placementProgress = computeRampProgress( tickIndex, 0, forces.forceRampTicks );
          const linkProgress = computeRampProgress( tickIndex, forces.linkRampDelayTicks, forces.linkRampTicks );
          const linkTensionProgress = computeRampProgress( tickIndex, forces.linkTensionRampDelayTicks, forces.linkTensionRampTicks );
          const orbitProgress = computeRampProgress( tickIndex, forces.orbitRampDelayTicks, forces.orbitRampTicks );
          const bisectorProgress = computeRampProgress( tickIndex, forces.bisectorRampDelayTicks, forces.bisectorRampTicks );
          const centroidProgress = computeRampProgress( tickIndex, forces.centroidRampDelayTicks, forces.centroidRampTicks );
          const linkAvoidanceProgress = computeRampProgress( tickIndex, forces.linkAvoidanceRampDelayTicks, forces.linkAvoidanceRampTicks );
          const flowProgress = computeRampProgress( tickIndex, 0, forces.flowGravityRampTicks );
          const placementEased = Math.pow( placementProgress, 2 );
          const linkEased = Math.pow( linkProgress, 2 );
          const linkTensionEased = Math.pow( linkTensionProgress, 1.15 );
          const orbitEased = Math.pow( orbitProgress, 1.6 );
          const bisectorEased = Math.pow( bisectorProgress, 1.3 );
          const centroidEased = Math.pow( centroidProgress, 1.15 );
          const linkAvoidanceEased = Math.pow( linkAvoidanceProgress, 0.95 );
          const flowEased = Math.pow( flowProgress, 2 );
          const collideStrength = 0.12 + 0.78 * placementEased;
          forces.link.strength( link => link._baseStrength * linkEased );
          forces.charge.strength( forces.baseChargeStrength * placementEased );
          forces.collide.strength( collideStrength );
          forces.flowX.strength( () => forces.baseFlowGravityStrength * flowEased );
          forces.linkTension.strength( () => forces.baseLinkTensionStrength * linkTensionEased );
          forces.orbit.strength( node => node._orbitWeight * forces.baseOrbitStrength * orbitEased );
          forces.bisector.strength( node => node._bisectorWeight * forces.baseBisectorStrength * bisectorEased );
          forces.centroid.strength( node => node._centroidWeight * forces.baseCentroidStrength * centroidEased );
          forces.linkAvoidance.strength( () => forces.baseLinkAvoidanceStrength * linkAvoidanceEased );
        }

        function computeCameraTransform( contentNode, diagram )
        {
          const settings = diagram.simulation ?? {};
          const rect = computeViewerRect( diagram );
          const padding = settings.cameraPadding ?? 26;
          const minScale = settings.minCameraScale ?? 0.55;
          const maxScale = settings.maxCameraScale ?? 1.02;
          const bounds = contentNode.getBBox();
          const width = Math.max( bounds.width, 120 );
          const height = Math.max( bounds.height, 80 );
          const rawScale = Math.min(
            rect.width / (width + 2 * padding),
            rect.height / (height + 2 * padding) );
          const scale = clampValue( rawScale, minScale, maxScale );
          const centerX = bounds.x + bounds.width / 2;
          const centerY = bounds.y + bounds.height / 2;
          return {
            scale: scale,
            tx: rect.x + rect.width / 2 - scale * centerX,
            ty: rect.y + rect.height / 2 - scale * centerY
          };
        }

        function createPositionSnapshot( nodes )
        {
          return nodes.map( node => ({ x: node.x, y: node.y }) );
        }

        function measureStepMotion( nodes, previousPositions )
        {
          let maxShift = 0;
          let sumSquares = 0;
          const count = Math.min( nodes.length, previousPositions.length );
          for ( let i = 0; i < count; ++i )
          {
            const dx = nodes[ i ].x - previousPositions[ i ].x;
            const dy = nodes[ i ].y - previousPositions[ i ].y;
            const shift = Math.hypot( dx, dy );
            if ( shift > maxShift )
              maxShift = shift;
            sumSquares += shift * shift;
          }

          return {
            maxShift: maxShift,
            rmsShift: count > 0 ? Math.sqrt( sumSquares / count ) : 0
          };
        }

        function settleNodes( diagram, nodes, rawLinks )
        {
          const settings = diagram.simulation ?? {};
          const chargeStrength = settings.chargeStrength ?? -120;
          const linkStrength = settings.linkStrength ?? 0.18;
          const padding = settings.padding ?? 18;
          const minTicks = settings.minTicks ?? Math.max( 240, settings.ticks ?? 0 );
          const maxTicks = settings.maxTicks ?? Math.max( minTicks, settings.ticks ?? 720 );
          const alphaMin = settings.alphaMin ?? 0.0015;
          const alphaDecay = settings.alphaDecay ?? 0.018;
          const velocityDecay = settings.velocityDecay ?? 0.32;
          const settleMaxShiftThreshold = settings.settleMaxShiftThreshold ?? 0.24;
          const settleRmsShiftThreshold = settings.settleRmsShiftThreshold ?? 0.08;
          const settleStableTicks = Math.max( 1, settings.settleStableTicks ?? 96 );
          const defaultGap = d3.max( nodes, node => node.h ) ?? 72;
          const minNodeGap = settings.minNodeGap ?? defaultGap;
          const minLinkDistance = settings.minLinkDistance ?? minNodeGap;
          const minGapStrength = settings.minGapStrength ?? 0.92;
          const minGapIterations = settings.minGapIterations ?? 2;
          const minGapRampTicks = Math.max( 1, settings.minGapRampTicks ?? 1000 );
          const minGapInitialFactor = clampValue( settings.minGapInitialFactor ?? 0.32, 0, 1 );
          const loopLinkStrengthFactor = settings.loopLinkStrengthFactor ?? 0.3;
          const forceRampTicks = Math.max( 1, settings.forceRampTicks ?? 240 );
          const linkRampTicks = Math.max( 1, settings.linkRampTicks ?? forceRampTicks );
          const linkRampDelayTicks = Math.max( 0, settings.linkRampDelayTicks ?? 0 );
          const linkTensionStrength = settings.linkTensionStrength ?? 0;
          const linkTensionExponent = settings.linkTensionExponent ?? 1.4;
          const linkTensionCompressionFactor = clampValue( settings.linkTensionCompressionFactor ?? 0.42, 0, 1 );
          const linkTensionRampTicks = Math.max( 1, settings.linkTensionRampTicks ?? linkRampTicks );
          const linkTensionRampDelayTicks = Math.max( 0, settings.linkTensionRampDelayTicks ?? linkRampDelayTicks );
          const orbitRampTicks = Math.max( 1, settings.orbitRampTicks ?? Math.max( 1, Math.round( linkRampTicks * 0.7 ) ) );
          const orbitRampDelayTicks = Math.max( 0, settings.orbitRampDelayTicks ?? Math.round( linkRampDelayTicks * 0.5 ) );
          const bisectorStrength = settings.bisectorStrength ?? 0.14;
          const bisectorRampTicks = Math.max( 1, settings.bisectorRampTicks ?? Math.max( 120, Math.round( linkRampTicks * 0.6 ) ) );
          const bisectorRampDelayTicks = Math.max( 0, settings.bisectorRampDelayTicks ?? Math.round( linkRampDelayTicks * 0.35 ) );
          const centroidStrength = settings.centroidStrength ?? 0;
          const centroidRampTicks = Math.max( 1, settings.centroidRampTicks ?? Math.max( 120, Math.round( linkRampTicks * 0.6 ) ) );
          const centroidRampDelayTicks = Math.max( 0, settings.centroidRampDelayTicks ?? Math.round( linkRampDelayTicks * 0.25 ) );
          const flowGravityStrength = settings.flowGravityStrength ?? 0.11;
          const flowGravityRampTicks = Math.max( 1, settings.flowGravityRampTicks ?? forceRampTicks );
          const flowFalloffDistance = Math.max( 1, settings.flowFalloffDistance ?? Math.max( minLinkDistance * 1.9, 180 ) );
          const orbitStrength = settings.orbitStrength ?? 0.18;
          const orbitMaxRadiusFactor = Math.max( 1, settings.orbitMaxRadiusFactor ?? 1.18 );
          const boundRelaxation = clampValue( settings.boundRelaxation ?? 0.44, 0.05, 1 );
          const boundMaxStep = Math.max( 1, settings.boundMaxStep ?? Math.max( 14, minNodeGap * 0.2 ) );
          const linkAvoidanceStrength = settings.linkAvoidanceStrength ?? 0.11;
          const linkAvoidanceClearance = settings.linkAvoidanceClearance ?? Math.max( 12, Math.round( minNodeGap * 0.24 ) );
          const linkAvoidanceEndpointReaction = clampValue( settings.linkAvoidanceEndpointReaction ?? 0.18, 0, 1 );
          const linkAvoidanceRampTicks = Math.max( 1, settings.linkAvoidanceRampTicks ?? Math.max( 140, Math.round( linkRampTicks * 0.9 ) ) );
          const linkAvoidanceRampDelayTicks = Math.max( 0, settings.linkAvoidanceRampDelayTicks ?? Math.round( linkRampDelayTicks + linkRampTicks * 0.25 ) );
          const linkAvoidanceResolveStrength = settings.linkAvoidanceResolveStrength ?? 0.62;
          const linkAvoidanceResolveIterations = Math.max( 1, settings.linkAvoidanceResolveIterations ?? 2 );
          const settleMinTicks = Math.max( minTicks, linkRampDelayTicks + linkRampTicks, linkTensionRampDelayTicks + linkTensionRampTicks, orbitRampDelayTicks + orbitRampTicks, bisectorRampDelayTicks + bisectorRampTicks, centroidRampDelayTicks + centroidRampTicks, flowGravityRampTicks + (settings.flowGravitySettleTicks ?? 120), linkAvoidanceRampDelayTicks + linkAvoidanceRampTicks );
          const initialAlpha = clampValue( settings.initialAlpha ?? 0.2, alphaMin * 2, 1 );
          const viewerCenter = computeViewerCenter( diagram );
          const viewerRect = computeViewerRect( diagram );
          assignOrbitTargets( nodes, rawLinks, minNodeGap, settings );
          assignFlowHints( nodes, rawLinks, viewerRect, settings );
          assignBisectorTargets( nodes, rawLinks, minNodeGap, settings );
          assignCentroidTargets( nodes, rawLinks, settings );
          const links = (rawLinks ?? []).map(
            link => ({
              ...link,
              _baseStrength: computeLinkBaseStrength( link, linkStrength, loopLinkStrengthFactor )
            }) );
          const linkForce = d3.forceLink( links )
            .id( node => node.id )
            .distance( link =>
            {
              const distance = computeLinkDistance( link, minLinkDistance );
              link._targetDistance = distance;
              return distance;
            } )
            .strength( 0 );
          const chargeForce = d3.forceManyBody().strength( 0 );
          const collideForce = d3.forceCollide(
            node => Math.max( node.w, node.h ) * 0.34 + padding )
            .strength( 0.12 )
            .iterations( 4 );
          const flowXForce = createFlowXForce( flowFalloffDistance ).strength( 0 );
          const linkTensionForce = createLinkTensionForce( links, linkTensionCompressionFactor, linkTensionExponent ).strength( 0 );
          const orbitForce = createOrbitForce().strength( 0 );
          const bisectorForce = createBisectorForce().strength( 0 );
          const centroidForce = createCentroidForce().strength( 0 );
          const linkAvoidanceForce = createLinkAvoidanceForce( links, linkAvoidanceClearance, linkAvoidanceEndpointReaction ).strength( 0 );
          const simulation = d3
            .forceSimulation( nodes )
            .alpha( initialAlpha )
            .alphaMin( alphaMin )
            .alphaDecay( alphaDecay )
            .velocityDecay( velocityDecay )
            .force( "center", d3.forceCenter( viewerCenter.x, viewerCenter.y ) )
            .force( "link", linkForce )
            .force( "charge", chargeForce )
            .force( "flowX", flowXForce )
            .force( "linkTension", linkTensionForce )
            .force( "orbit", orbitForce )
            .force( "bisector", bisectorForce )
            .force( "centroid", centroidForce )
            .force( "linkAvoidance", linkAvoidanceForce )
            .force( "collide", collideForce )
            .stop();
          const forces = {
            link: linkForce,
            charge: chargeForce,
            flowX: flowXForce,
            linkTension: linkTensionForce,
            orbit: orbitForce,
            bisector: bisectorForce,
            centroid: centroidForce,
            linkAvoidance: linkAvoidanceForce,
            collide: collideForce,
            baseChargeStrength: chargeStrength,
            baseFlowGravityStrength: flowGravityStrength,
            baseLinkTensionStrength: linkTensionStrength,
            baseOrbitStrength: orbitStrength,
            baseBisectorStrength: bisectorStrength,
            baseCentroidStrength: centroidStrength,
            baseLinkAvoidanceStrength: linkAvoidanceStrength,
            forceRampTicks: forceRampTicks,
            flowGravityRampTicks: flowGravityRampTicks,
            linkRampTicks: linkRampTicks,
            linkRampDelayTicks: linkRampDelayTicks,
            linkTensionRampTicks: linkTensionRampTicks,
            linkTensionRampDelayTicks: linkTensionRampDelayTicks,
            orbitRampTicks: orbitRampTicks,
            orbitRampDelayTicks: orbitRampDelayTicks,
            bisectorRampTicks: bisectorRampTicks,
            bisectorRampDelayTicks: bisectorRampDelayTicks,
            centroidRampTicks: centroidRampTicks,
            centroidRampDelayTicks: centroidRampDelayTicks,
            linkAvoidanceRampTicks: linkAvoidanceRampTicks,
            linkAvoidanceRampDelayTicks: linkAvoidanceRampDelayTicks
          };

          let tickCount = 0;
          let stableTickCount = 0;
          while ( tickCount < maxTicks && stableTickCount < settleStableTicks )
          {
            const previousPositions = createPositionSnapshot( nodes );
            applyForceRamp( forces, tickCount + 1 );
            simulation.tick();
            const linkAvoidanceResolveProgress = Math.pow(
              computeRampProgress( tickCount + 1, linkAvoidanceRampDelayTicks, linkAvoidanceRampTicks ),
              0.95 );
            enforceLinkAvoidance(
              nodes,
              links,
              linkAvoidanceClearance,
              linkAvoidanceResolveStrength * linkAvoidanceResolveProgress,
              linkAvoidanceEndpointReaction,
              linkAvoidanceResolveIterations );
            const gapProgress = Math.min( 1, (tickCount + 1) / minGapRampTicks );
            const effectiveMinGap = minNodeGap * (minGapInitialFactor + (1 - minGapInitialFactor) * gapProgress);
            const gapStrength = minGapStrength * gapProgress;
            enforceMinimumNodeGap( nodes, effectiveMinGap, gapStrength, minGapIterations );
            enforceLinkAvoidance(
              nodes,
              links,
              linkAvoidanceClearance,
              linkAvoidanceResolveStrength * linkAvoidanceResolveProgress * 0.65,
              linkAvoidanceEndpointReaction,
              1 );
            const boundProgress = Math.max(
              computeRampProgress( tickCount + 1, orbitRampDelayTicks, orbitRampTicks ),
              computeRampProgress( tickCount + 1, bisectorRampDelayTicks, bisectorRampTicks ),
              computeRampProgress( tickCount + 1, centroidRampDelayTicks, centroidRampTicks ) );
            const effectiveBoundRelaxation = boundRelaxation * (0.4 + 0.6 * boundProgress);
            const effectiveBoundMaxStep = boundMaxStep * (0.55 + 0.45 * boundProgress);
            enforceOrbitRadiusBounds( nodes, orbitMaxRadiusFactor, effectiveBoundRelaxation, effectiveBoundMaxStep );
            enforceOrbitAngleBounds( nodes, effectiveBoundRelaxation, effectiveBoundMaxStep );
            enforceBisectorBounds( nodes, effectiveBoundRelaxation, effectiveBoundMaxStep );
            enforceCentroidBounds( nodes, effectiveBoundRelaxation, effectiveBoundMaxStep );
            const motion = measureStepMotion( nodes, previousPositions );
            const motionIsStable = motion.maxShift <= settleMaxShiftThreshold
              && motion.rmsShift <= settleRmsShiftThreshold;
            if ( tickCount + 1 >= settleMinTicks && motionIsStable )
              ++stableTickCount;
            else
              stableTickCount = 0;
            ++tickCount;
          }

          return links;
        }

        function buildLinkPoints( link )
        {
          return computeRenderedLinkSegment( link );
        }

        function polylinePath( points )
        {
          return points
            .map( (point, index) => `${index == 0 ? "M" : "L"}${point.x} ${point.y}` )
            .join( " " );
        }

        function pointAlongPolyline( points, fraction )
        {
          if ( points.length == 0 )
            return { x: 0, y: 0 };
          if ( points.length == 1 )
            return points[ 0 ];

          let total = 0;
          const lengths = [];
          for ( let i = 1; i < points.length; ++i )
          {
            const dx = points[ i ].x - points[ i - 1 ].x;
            const dy = points[ i ].y - points[ i - 1 ].y;
            const length = Math.hypot( dx, dy );
            lengths.push( length );
            total += length;
          }

          if ( total == 0 )
            return points[ 0 ];

          const targetLength = clampValue( fraction, 0, 1 ) * total;
          let traversed = 0;
          for ( let i = 1; i < points.length; ++i )
          {
            const length = lengths[ i - 1 ];
            if ( traversed + length >= targetLength )
            {
              const t = (targetLength - traversed) / length;
              return {
                x: points[ i - 1 ].x + (points[ i ].x - points[ i - 1 ].x) * t,
                y: points[ i - 1 ].y + (points[ i ].y - points[ i - 1 ].y) * t
              };
            }
            traversed += length;
          }

          return points[ points.length - 1 ];
        }

        const nodes = prepareNodes( diagram, diagram.nodes );
        const links = settleNodes( diagram, nodes, diagram.links );

        const svg = d3
          .select( "#root" )
          .append( "svg" )
          .attr( "xmlns", "http://www.w3.org/2000/svg" )
          .attr( "viewBox", `0 0 ${diagram.width} ${diagram.height}` )
          .attr( "width", diagram.width )
          .attr( "height", diagram.height );

        const defs = svg.append( "defs" );
        defs
          .append( "marker" )
          .attr( "id", "arrow" )
          .attr( "markerWidth", 10 )
          .attr( "markerHeight", 10 )
          .attr( "refX", 9 )
          .attr( "refY", 5 )
          .attr( "orient", "auto" )
          .attr( "markerUnits", "strokeWidth" )
          .append( "path" )
          .attr( "d", "M0,0 L10,5 L0,10 z" )
          .attr( "fill", "#334155" );

        defs.append( "style" ).text( styleText );

        svg
          .append( "text" )
          .attr( "class", "title" )
          .attr( "x", diagram.titleX ?? 48 )
          .attr( "y", diagram.titleY ?? 42 )
          .text( diagram.title );

        if ( diagram.separatorY != null )
        {
          svg
            .append( "line" )
            .attr( "x1", diagram.separatorX1 ?? 48 )
            .attr( "y1", diagram.separatorY )
            .attr( "x2", diagram.separatorX2 ?? diagram.width - 48 )
            .attr( "y2", diagram.separatorY )
            .attr( "stroke", "#cbd5e1" )
            .attr( "stroke-width", 2 );
        }

        const cameraLayer = svg.append( "g" );
        const contentLayer = cameraLayer.append( "g" );
        const linkLayer = contentLayer.append( "g" );
        const labelLayer = contentLayer.append( "g" );
        const nodeLayer = contentLayer.append( "g" );

        for ( const node of nodes )
        {
          nodeLayer
            .append( "rect" )
            .attr( "class", node._boxClass )
            .attr( "x", node.x - node.w / 2 )
            .attr( "y", node.y - node.h / 2 )
            .attr( "width", node.w )
            .attr( "height", node.h )
            .attr( "rx", 6 )
            .attr( "ry", 6 );

          nodeLayer
            .append( "text" )
            .attr( "class", "label" )
            .attr( "x", node.x )
            .attr( "y", node.y - node.h / 2 + node._labelBaselineOffset )
            .text( node.title );

          if ( node.subtitle )
          {
            nodeLayer
              .append( "text" )
              .attr( "class", "sub" )
              .attr( "x", node.x )
              .attr( "y", node.y - node.h / 2 + node._subBaselineOffset )
              .text( node.subtitle );
          }
        }

        for ( const link of links )
        {
          const points = buildLinkPoints( link );
          linkLayer
            .append( "path" )
            .attr( "class", link.class ?? "line" )
            .attr( "d", polylinePath( points ) );

          if ( link.label )
          {
            const point = pointAlongPolyline( points, link.labelT ?? 0.5 );
            labelLayer
              .append( "text" )
              .attr( "class", link.labelClass ?? "tag" )
              .attr( "x", point.x + (link.labelDx ?? 0) )
              .attr( "y", point.y + (link.labelDy ?? 0) )
              .attr( "text-anchor", link.labelAnchor ?? "middle" )
              .text( link.label );
          }
        }

        for ( const item of diagram.texts ?? [] )
        {
          labelLayer
            .append( "text" )
            .attr( "class", item.class ?? "note" )
            .attr( "x", item.x )
            .attr( "y", item.y )
            .attr( "text-anchor", item.anchor ?? "middle" )
            .text( item.text );
        }

        const camera = computeCameraTransform( contentLayer.node(), diagram );
        cameraLayer.attr( "transform", `translate(${camera.tx} ${camera.ty}) scale(${camera.scale})` );

        return document.querySelector( "svg" ).outerHTML + "\n";
      },
      { diagram: data, styleText: createStyleText( await loadDiagramFontDataUrl() ), fontFamily: FONT_FAMILY } );
  }
  finally
  {
    await page.close();
  }
}

async function main()
{
  const jobs = pairArguments( process.argv.slice( 2 ) );
  const browser = await chromium.launch( {
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
    args: [ "--no-sandbox", "--disable-gpu" ]
  } );

  try
  {
    for ( const job of jobs )
    {
      const data = await loadDiagramData( job.inputPath );
      const svg = await renderSvg( browser, data );
      await ensureOutputDirectory( job.outputPath );
      await fs.writeFile( job.outputPath, svg, "utf8" );
      process.stdout.write( `Rendered ${job.outputPath}\n` );
    }
  }
  finally
  {
    await browser.close();
  }
}

main().catch( error =>
{
  process.stderr.write( `${error.stack || error}\n` );
  process.exit( 1 );
} );
