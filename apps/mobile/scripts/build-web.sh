#!/bin/sh
# Builds the installable web app into dist/ (BLUEPRINT §3.10, PWA route).
# Stamps one build id into the service worker (a fresh shell cache per deploy), the page
# (<meta name="app-build">) and version.json, which an open app polls to offer a refresh (T15).
set -e
cd "$(dirname "$0")/.."
npx expo export --platform web --clear
BUILD="$(date -u +%Y%m%d%H%M%S)"
sed -i.bak "s/__BUILD__/$BUILD/" dist/sw.js && rm dist/sw.js.bak
sed -i.bak "s/__BUILD__/$BUILD/" dist/index.html && rm dist/index.html.bak
printf '{"build":"%s"}\n' "$BUILD" > dist/version.json
echo "Web build $BUILD ready in dist/"
