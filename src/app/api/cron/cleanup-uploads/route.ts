// ניקוי יומי (Vercel Cron, vercel.json): מוחק תמונות זמניות שלא הגיעו להזמנה.
// מוגן ב־CRON_SECRET: ‏Vercel שולח "Authorization: Bearer <CRON_SECRET>".
import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { uploadsEnabled } from "@/lib/server/supabase-admin";
import { cleanupTempUploads } from "@/lib/server/uploads";

export const dynamic = "force-dynamic";

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!uploadsEnabled()) return NextResponse.json({ deleted: 0, mode: "local" });
  try {
    return NextResponse.json(await cleanupTempUploads());
  } catch (e) {
    console.error("cleanup failed", e);
    return NextResponse.json({ error: "cleanup failed" }, { status: 500 });
  }
}
