#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ASSET_DIR="$ROOT_DIR/assets"
SOURCE_DIR="$ASSET_DIR/source"
TMP_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "$TMP_DIR"
}

trap cleanup EXIT

render_svg() {
  local input_file="$1"
  local size="$2"

  qlmanage -t -s "$size" -o "$TMP_DIR" "$input_file" >/dev/null 2>&1
}

render_svg "$SOURCE_DIR/icon.svg" 1024
cp "$TMP_DIR/icon.svg.png" "$ASSET_DIR/icon.png"

render_svg "$SOURCE_DIR/adaptive-icon.svg" 1024
cp "$TMP_DIR/adaptive-icon.svg.png" "$ASSET_DIR/adaptive-icon.png"

render_svg "$SOURCE_DIR/splash-art.svg" 1024
cp "$TMP_DIR/splash-art.svg.png" "$ASSET_DIR/splash-icon.png"

sips -z 48 48 "$ASSET_DIR/icon.png" --out "$ASSET_DIR/favicon.png" >/dev/null

echo "Generated app assets into $ASSET_DIR"
