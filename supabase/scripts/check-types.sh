#!/usr/bin/env bash
# T5: apps/mobile/src/api/database.types.ts must be what the migrations produce, or the app's
# type checks are checking against a schema that no longer exists. CI runs this after
# `supabase db start`. To regenerate, with the local stack running:
#   supabase gen types typescript --local --schema public > apps/mobile/src/api/database.types.ts
set -euo pipefail
cd "$(dirname "$0")/../.."
committed=apps/mobile/src/api/database.types.ts
fresh=$(mktemp)
supabase gen types typescript --local --schema public > "$fresh"
# The hosted project and the local stack may run different PostgREST versions; that line aside,
# the two must be identical.
strip() { grep -v 'PostgrestVersion:' "$1"; }
if diff -u <(strip "$committed") <(strip "$fresh"); then
  echo "schema types are up to date"
else
  # kept for the workflow to upload, so the fix is one download away
  mkdir -p .schema-types && cp "$fresh" .schema-types/database.types.ts
  echo "::error file=$committed::Schema types are stale. Regenerate them (see supabase/scripts/check-types.sh) and commit."
  exit 1
fi
