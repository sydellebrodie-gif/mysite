// הורדת קובץ מקורי של לקוח: הפניה לקישור חתום ל־60 שניות. הדפדפן שומר אותו בשם שמזהה את הפריט
// (OrderFiles.tsx). כל הורדה נרשמת ביומן.
import { NextResponse } from "next/server";
import { adminAuthConfigured, sessionClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!adminAuthConfigured() || !/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("not found", { status: 404 });
  const sb = await sessionClient();
  const { data: { user } } = await sb.auth.getUser();
  const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
  if (!user || aal?.currentLevel !== "aal2") return new NextResponse("unauthorized", { status: 401 });
  // RLS: רק מנהלת רואה את השורה
  const { data: u } = await sb.from("uploads").select("id,storage_path,status,order_line_id").eq("id", id).maybeSingle();
  if (!u || u.status === "deleted") return new NextResponse("not found", { status: 404 });
  const { data: s, error } = await sb.storage.from("customer-uploads").createSignedUrl(u.storage_path, 60);
  if (error || !s) return new NextResponse("not found", { status: 404 });
  const { data: line } = await sb.from("order_lines").select("order_id").eq("id", u.order_line_id).maybeSingle();
  await sb.from("uploads").update({ downloaded_at: new Date().toISOString() }).eq("id", id);
  await sb.from("access_log").insert({ user_id: user.id, action: "download", upload_id: id, order_id: line?.order_id ?? null, detail: "" });
  return NextResponse.redirect(s.signedUrl, { status: 302, headers: { "Cache-Control": "no-store" } });
}
