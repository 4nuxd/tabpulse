#!/usr/bin/env bash
set -euo pipefail

TARGET="${1:-chrome}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist/$TARGET"
ZIP_PATH="$ROOT_DIR/dist/tabpulse-$TARGET.zip"

"$ROOT_DIR/scripts/build-extension.sh" "$TARGET"

rm -f "$ZIP_PATH"
(
  cd "$DIST_DIR"
  zip -qr "$ZIP_PATH" .
)

echo "Packaged $TARGET extension at $ZIP_PATH"
