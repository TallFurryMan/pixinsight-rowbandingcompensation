import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { chromium } from "playwright";

const require = createRequire( import.meta.url );
const d3EntryPath = require.resolve( "d3" );
const d3ScriptPath = path.join( path.dirname( d3EntryPath ), "..", "dist", "d3.min.js" );

const STYLE_TEXT = [
  ".title { font: 700 22px Helvetica, Arial, sans-serif; fill: #0f172a; }",
  ".box { fill: #f8fafc; stroke: #334155; stroke-width: 1.6; }",
  ".line { stroke: #334155; stroke-width: 2.2; fill: none; marker-end: url(#arrow); }",
  ".loop { stroke: #64748b; stroke-width: 2; fill: none; stroke-dasharray: 7 6; marker-end: url(#arrow); }",
  ".label { font: 600 14px Helvetica, Arial, sans-serif; fill: #0f172a; text-anchor: middle; }",
  ".sub { font: 12px Helvetica, Arial, sans-serif; fill: #475569; text-anchor: middle; }",
  ".note { font: 12px Helvetica, Arial, sans-serif; fill: #64748b; text-anchor: middle; }",
  ".tag { font: 12px Helvetica, Arial, sans-serif; fill: #64748b; text-anchor: middle; }"
].join( "\n" );

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
      ({ diagram, styleText }) =>
      {
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

        for ( const node of diagram.nodes ?? [] )
        {
          svg
            .append( "rect" )
            .attr( "class", "box" )
            .attr( "x", node.x )
            .attr( "y", node.y )
            .attr( "width", node.w )
            .attr( "height", node.h )
            .attr( "rx", 6 )
            .attr( "ry", 6 );

          svg
            .append( "text" )
            .attr( "class", "label" )
            .attr( "x", node.x + node.w / 2 )
            .attr( "y", node.y + 26 )
            .text( node.title );

          if ( node.subtitle )
          {
            svg
              .append( "text" )
              .attr( "class", "sub" )
              .attr( "x", node.x + node.w / 2 )
              .attr( "y", node.y + 48 )
              .text( node.subtitle );
          }
        }

        for ( const segment of diagram.paths ?? [] )
        {
          svg
            .append( "path" )
            .attr( "class", segment.class ?? "line" )
            .attr( "d", segment.d );
        }

        for ( const item of diagram.texts ?? [] )
        {
          svg
            .append( "text" )
            .attr( "class", item.class ?? "note" )
            .attr( "x", item.x )
            .attr( "y", item.y )
            .attr( "text-anchor", item.anchor ?? "middle" )
            .text( item.text );
        }

        return document.querySelector( "svg" ).outerHTML + "\n";
      },
      { diagram: data, styleText: STYLE_TEXT } );
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
