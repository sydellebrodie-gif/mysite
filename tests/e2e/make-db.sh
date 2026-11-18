#!/usr/bin/env bash
# יוצר מסד בדיקה מקומי (Postgres) עם כל שלבי ההקמה, כמו ב־Supabase. נתונים מומצאים בלבד.
# שימוש: tests/e2e/make-db.sh [db-name]   (רץ כמשתמש postgres)
set -euo pipefail
DB=${1:-giftse2e}
cd "$(dirname "$0")/../../supabase"
run() { su postgres -c "psql -q -v ON_ERROR_STOP=1 -d $DB -f $1" >/dev/null; }
su postgres -c "dropdb --if-exists $DB && createdb $DB"
run tests/supabase_stub.sql
for f in setup_all.sql setup_step*.sql; do run "$f"; done
echo "db $DB ready"
