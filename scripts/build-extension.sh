#!/usr/bin/env bash
set -euo pipefail

TARGET="${1:-chrome}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="$ROOT_DIR/dist/$TARGET"

case "$TARGET" in
  chrome|edge|firefox) ;;
  *)
    echo "Unsupported target: $TARGET (use chrome|edge|firefox)" >&2
    exit 1
    ;;
esac

rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"

cp "$ROOT_DIR/background.js" "$OUT_DIR/"
cp "$ROOT_DIR/extension-api.js" "$OUT_DIR/"
cp "$ROOT_DIR/popup.html" "$OUT_DIR/"
cp "$ROOT_DIR/popup.js" "$OUT_DIR/"
cp -R "$ROOT_DIR/media" "$OUT_DIR/"
cp "$ROOT_DIR/LICENSE" "$OUT_DIR/"

if [ "$TARGET" = "firefox" ]; then
  cp "$ROOT_DIR/manifest.firefox.json" "$OUT_DIR/manifest.json"
else
  cp "$ROOT_DIR/manifest.json" "$OUT_DIR/manifest.json"
fi

echo "Built $TARGET extension at $OUT_DIR"
