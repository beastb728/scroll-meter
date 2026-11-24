#!/usr/bin/env bash
# Builds a zip ready to upload to the Chrome Web Store: dist/scroll-meter-<version>.zip
set -euo pipefail
cd "$(dirname "$0")/.."
version=$(node -p "require('./manifest.json').version")
mkdir -p dist
out="dist/scroll-meter-${version}.zip"
rm -f "$out"
zip -qr "$out" manifest.json src icons
echo "$out"
