#!/usr/bin/env bash
# מריץ את בדיקות ממשק הניהול מקצה לקצה: מסד מקומי חדש, שרת Supabase מדומה, בנייה, ובדיקות בדפדפן.
# נתונים ומשתמשים מומצאים בלבד. שימוש: tests/e2e/run-admin.sh [screenshots-dir]   (רשות: HEIC=<קובץ>)
set -euo pipefail
cd "$(dirname "$0")/../.."
SB_PORT=54330; WEB_PORT=3100; DB=giftse2e
tests/e2e/make-db.sh $DB >/dev/null
su postgres -c "psql -q -v ON_ERROR_STOP=1 -d $DB -f tests/e2e/admin-seed.sql"
pkill -f "pg-supabase.mjs $SB_PORT" || true; pkill -f next-server || true; sleep 0.5
TEST_USERS="owner@example.test,Test-pass-123,11111111-1111-4111-8111-111111111111;stranger@example.test,Test-pass-456,55555555-5555-4555-8555-555555555555" \
  node tests/e2e/pg-supabase.mjs $SB_PORT $DB > /tmp/pg-supabase.log 2>&1 &
export LANG=C.UTF-8 LC_ALL=C.UTF-8
export NEXT_PUBLIC_SUPABASE_URL=http://localhost:$SB_PORT NEXT_PUBLIC_SUPABASE_ANON_KEY=test-anon-key \
  SUPABASE_SERVICE_ROLE_KEY=test-service-key UPLOAD_HASH_SECRET=test-hash CRON_SECRET=test-cron
if [ "${SKIP_BUILD:-}" != "1" ]; then npm run -s build >/dev/null; fi
npx next start -p $WEB_PORT > /tmp/next-admin.log 2>&1 &
sleep 4
status=0
node tests/e2e/admin.cjs http://localhost:$WEB_PORT http://localhost:$SB_PORT ${1:-} || status=$?
pkill -f next-server || true; pkill -f "pg-supabase.mjs $SB_PORT" || true
exit $status
