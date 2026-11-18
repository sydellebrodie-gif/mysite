// לקוח Supabase בצד השרת עם סשן המשתמשת (עוגיות). משמש רק את ממשק הניהול: ההרשאות נאכפות ב־RLS
// (is_admin: רשומה בטבלת admins + אימות דו־שלבי, aal2), ולא במפתח שירות.
import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export const adminAuthConfigured = () =>
  !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

export async function sessionClient() {
  const store = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        // ב־Server Component אי אפשר לכתוב עוגיות; ה־middleware מרענן את הסשן במקרה כזה
        try { list.forEach(({ name, value, options }) => store.set(name, value, options)); } catch {}
      },
    },
  });
}
