#!/bin/sh
# Builds the installable web app into dist/ (BLUEPRINT §3.10, PWA route).
# Stamps the service worker with a build id so each deploy gets a fresh shell cache.
set -e
cd "$(dirname "$0")/.."
npx expo export --platform web --clear
BUILD="$(date -u +%Y%m%d%H%M%S)"
sed -i.bak "s/__BUILD__/$BUILD/" dist/sw.js && rm dist/sw.js.bak
echo "Web build $BUILD ready in dist/"
