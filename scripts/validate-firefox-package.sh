#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_DIR="$ROOT_DIR/dist/firefox"
ZIP_PATH="$ROOT_DIR/dist/tabpulse-firefox.zip"
MANIFEST_PATH="$BUILD_DIR/manifest.json"

if [ ! -f "$MANIFEST_PATH" ]; then
  echo "Missing Firefox manifest: $MANIFEST_PATH" >&2
  exit 1
fi

if [ ! -f "$ZIP_PATH" ]; then
  echo "Missing Firefox package: $ZIP_PATH" >&2
  exit 1
fi

if grep -q '"service_worker"' "$MANIFEST_PATH"; then
  echo "Firefox manifest must not use background.service_worker" >&2
  exit 1
fi

if ! grep -q '"scripts"[[:space:]]*:[[:space:]]*\[[[:space:]]*"background.js"[[:space:]]*\]' "$MANIFEST_PATH"; then
  echo 'Firefox manifest must include background.scripts: ["background.js"]' >&2
  exit 1
fi

zip_entries="$(unzip -Z1 "$ZIP_PATH")"
required_files=(
  "manifest.json"
  "background.js"
  "extension-api.js"
  "popup.html"
  "popup.js"
  "media/icons/icon16.png"
  "media/icons/icon48.png"
  "media/icons/icon128.png"
  "LICENSE"
)

for file in "${required_files[@]}"; do
  if ! printf '%s\n' "$zip_entries" | grep -Fxq "$file"; then
    echo "Missing required file at archive root: $file" >&2
    exit 1
  fi
done

echo "Firefox package validation passed."
