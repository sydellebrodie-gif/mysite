// שמירה על ממשק הניהול: מחוברת + אימות דו־שלבי (aal2) + רשומה בטבלת admins.
// גם בלי הבדיקה הזו, ה־RLS במסד לא מחזיר ולא משנה כלום למי שאינה מנהלת.
import "server-only";
import { redirect } from "next/navigation";
import { adminAuthConfigured, sessionClient } from "@/lib/supabase/server";

export async function requireAdmin() {
  if (!adminAuthConfigured()) redirect("/admin/login");
  const sb = await sessionClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/admin/login");
  const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel !== "aal2") redirect("/admin/login?step=mfa");
  const { data: row } = await sb.from("admins").select("user_id").eq("user_id", user.id).maybeSingle();
  if (!row) redirect("/admin/login?denied=1");
  return { sb, user };
}

export type AdminDb = Awaited<ReturnType<typeof requireAdmin>>["sb"];
