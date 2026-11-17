# Supabase: מבנה מסד הנתונים

## קבצים
- `migrations/` מבנה הטבלאות, הרשאות (RLS) ו־buckets. מריצים לפי הסדר (לפי שם הקובץ).
- `tests/` בדיקות הרשאות על Postgres מקומי, **עם נתונים בדויים בלבד**. ‏`supabase_stub.sql` מדמה את סביבת Supabase ולא מריצים אותו בפרויקט האמיתי.

## החלה על הפרויקט ב־Supabase
1. רק על פרויקט **נפרד וריק** של החנות.
2. Supabase → SQL Editor → New query → מדביקים את כל התוכן של `setup_all.sql` (שני הקבצים יחד, בטרנזקציה אחת) → Run. אמורה להופיע השורה "ההקמה הצליחה".
3. Authentication: מכבים הרשמה פתוחה (Allow new users to sign up = off), ומפעילים MFA (TOTP).
4. יוצרים משתמשת ניהול (Authentication → Users → Invite), ואז מוסיפים אותה לרשימת המורשים:
   `insert into public.admins (user_id) values ('<user id מהמסך>');`
5. המפתחות (URL, anon key, service role key) נכנסים **רק** למשתני הסביבה ב־Vercel. לא לצ'אט ולא למאגר.

## בדיקה מקומית
```bash
createdb giftstest
for f in tests/supabase_stub.sql migrations/*.sql tests/rls_test.sql; do psql -v ON_ERROR_STOP=1 -d giftstest -f "$f"; done
```

## עקרונות
- מחירים באגורות (מספר שלם).
- מבקר אנונימי רואה רק קטלוג פעיל. הזמנות, לקוחות ותמונות לא נגישים לו בכלל.
- ניהול = רשום ב־`admins` **וגם** מחובר עם אימות דו־שלבי (aal2). בלי MFA אין גישה, גם עם סיסמה נכונה.
- מוצר שהוזמן אי פעם לא נמחק, רק מוסתר (`is_active = false`).
- הזמנה אחת לכל עסקת תשלום (ייחודיות על `payment_provider + payment_ref`).
