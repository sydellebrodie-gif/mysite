// לקוח Supabase עם מפתח service role. צד שרת בלבד: המפתח לא יוצא לדפדפן.
import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/** העלאה לשרת פעילה רק כשמוגדרים כתובת ומפתח service role (ב־Vercel). אחרת: מצב פיתוח, התמונות נשארות בדפדפן */
export function uploadsEnabled(): boolean {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function adminClient(): SupabaseClient {
  if (!uploadsEnabled()) throw new Error("Supabase admin is not configured");
  client ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}
