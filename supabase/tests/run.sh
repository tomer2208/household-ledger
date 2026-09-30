#!/usr/bin/env bash
# Runs every SQL test against a local database and compares what each block reports (its
# TEST_ROLLBACK / SMOKE REPORT error) with supabase/tests/expected/<name>.out.
# Usage: supabase/tests/run.sh            (CI, after `supabase db start`)
#        UPDATE=1 supabase/tests/run.sh   (rewrite the expected files after a deliberate change)
set -uo pipefail
cd "$(dirname "$0")"
DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
TESTS=(phase1_smoke members_account delete_category maintenance_isolation capture_health search_transactions)

psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -f fixtures.sql || { echo "fixtures failed"; exit 1; }

status=0
mkdir -p expected
for t in "${TESTS[@]}"; do
  # Every block ends in an error by design; keep only the reports, without psql's file:line prefix.
  # Dates are replaced so the files don't go stale; WARNING lines (random ids) are dropped.
  got=$(psql "$DB_URL" -X -q -v VERBOSITY=terse -f "$t.sql" 2>&1 \
    | sed -E 's/^psql:[^:]+:[0-9]+: //' | grep -v '^WARNING:' \
    | sed -E 's/[0-9]{4}-[0-9]{2}-[0-9]{2}/<date>/g')
  if [ "${UPDATE:-}" = 1 ]; then
    printf '%s\n' "$got" > "expected/$t.out"
    echo "updated $t"
  elif [ ! -f "expected/$t.out" ]; then
    echo "NEW  $t (no expected file yet; this is what it reported):"
    printf '%s\n' "$got"
    status=1
  elif diff -u "expected/$t.out" <(printf '%s\n' "$got"); then
    echo "PASS $t"
  else
    echo "FAIL $t"
    status=1
  fi
done
exit $status
