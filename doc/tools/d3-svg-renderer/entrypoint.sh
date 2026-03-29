#!/bin/sh
set -eu

WORKSPACE_RENDERER="/workspace/doc/tools/d3-svg-renderer/render-diagram.mjs"
FALLBACK_RENDERER="/opt/rbc-d3-svg-renderer/render-diagram.mjs"
TMP_RENDERER_DIR="/tmp/rbc-d3-svg-renderer"
IMAGE_NODE_MODULES="/opt/rbc-d3-svg-renderer/node_modules"

if [ -f "$WORKSPACE_RENDERER" ]; then
  mkdir -p "$TMP_RENDERER_DIR"
  cp "$WORKSPACE_RENDERER" "$TMP_RENDERER_DIR/render-diagram.mjs"
  rm -f "$TMP_RENDERER_DIR/node_modules"
  ln -s "$IMAGE_NODE_MODULES" "$TMP_RENDERER_DIR/node_modules"
  exec node "$TMP_RENDERER_DIR/render-diagram.mjs" "$@"
fi

exec node "$FALLBACK_RENDERER" "$@"
