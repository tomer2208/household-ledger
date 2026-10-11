#!/bin/sh
# Builds the installable web app into dist/ (BLUEPRINT §3.10, PWA route).
# Stamps one build id into the service worker (a fresh shell cache per deploy), the page
# (<meta name="app-build">) and version.json, which an open app polls to offer a refresh (T15).
set -e
cd "$(dirname "$0")/.."
# WEB_OUT: another folder (the E2E build, against a local Supabase, goes to dist-e2e/).
OUT="${WEB_OUT:-dist}"
npx expo export --platform web --clear --output-dir "$OUT"
BUILD="$(date -u +%Y%m%d%H%M%S)"
sed -i.bak "s/__BUILD__/$BUILD/" "$OUT/sw.js" && rm "$OUT/sw.js.bak"
sed -i.bak "s/__BUILD__/$BUILD/" "$OUT/index.html" && rm "$OUT/index.html.bak"
printf '{"build":"%s"}\n' "$BUILD" > "$OUT/version.json"
echo "Web build $BUILD ready in $OUT/"
