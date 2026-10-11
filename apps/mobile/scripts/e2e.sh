#!/bin/sh
# T2: builds the web app against the local Supabase stack and runs the E2E tests on it.
# Needs `supabase start` first (from the repo root). Extra arguments go to Playwright, e.g.
#   sh scripts/e2e.sh --project=he e2e/expense.spec.ts
# Never points at the live project: the address and keys are the local stack's own.
set -e
cd "$(dirname "$0")/.."
if command -v supabase >/dev/null; then SB=supabase; else SB="npx --yes supabase"; fi
eval "$(cd ../.. && $SB status -o env | grep -E '^(API_URL|ANON_KEY|SERVICE_ROLE_KEY)=')"
case "$API_URL" in
  http://127.0.0.1:*|http://localhost:*) ;;
  *) echo "E2E runs only against a local Supabase (got $API_URL)"; exit 1 ;;
esac
if [ -z "$E2E_SKIP_BUILD" ]; then
  WEB_OUT=dist-e2e EXPO_PUBLIC_SUPABASE_URL="$API_URL" EXPO_PUBLIC_SUPABASE_KEY="$ANON_KEY" sh scripts/build-web.sh
fi
E2E_API_URL="$API_URL" E2E_ANON_KEY="$ANON_KEY" E2E_SERVICE_KEY="$SERVICE_ROLE_KEY" \
  npx playwright test "$@"
