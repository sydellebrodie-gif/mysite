// העלאת תמונות לקוחות לאחסון הפרטי (docs/architecture.md, "מחזור החיים של תמונה").
// 1. השרת יוצר שורה ב־uploads (status=temp) ושני קישורי העלאה חתומים: מקור + גרסת תצוגה.
// 2. הדפדפן מעלה ישירות לאחסון. שם הקובץ אקראי, בלי פרטי הלקוח.
// 3. השרת מאמת את הקובץ לפי התוכן (magic bytes) ומסמן verified_at. קובץ שאינו תמונה נמחק.
// 4. תמונה שלא שויכה להזמנה נמחקת אוטומטית אחרי temp_upload_hours (ניקוי יומי).
import "server-only";
import { createHmac, randomUUID } from "node:crypto";
import { adminClient } from "./supabase-admin";
import { ALLOWED_MIME, CUSTOMER_BUCKET, MAX_BYTES, UPLOADS_PER_DAY_DEFAULT, UPLOADS_PER_HOUR, mimeFamily, sniffImage } from "../upload-rules";

export class UploadError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/heif": "heif" };

/** מזהה מקור לצורך הגבלת קצב: HMAC של כתובת ה־IP, כך שה־IP עצמו לא נשמר */
export function clientHash(ip: string): string {
  const key = process.env.UPLOAD_HASH_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "dev";
  return createHmac("sha256", key).update(ip).digest("hex").slice(0, 32);
}

export interface CreateUploadInput { mime: string; size: number; name: string; width: number; height: number; rights: boolean }

export async function createUpload(input: CreateUploadInput, ip: string) {
  if (!input.rights) throw new UploadError("יש לאשר שיש לכם זכות להשתמש בתמונה");
  if (!(ALLOWED_MIME as readonly string[]).includes(input.mime)) throw new UploadError("אפשר להעלות רק תמונות (JPG, PNG, HEIC או WEBP)");
  if (!Number.isFinite(input.size) || input.size <= 0) throw new UploadError("קובץ ריק");
  if (input.size > MAX_BYTES) throw new UploadError("הקובץ גדול מ־25MB. נסו תמונה קטנה יותר");

  const sb = adminClient();
  const hash = clientHash(ip);
  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count, error: countErr } = await sb.from("uploads").select("id", { count: "exact", head: true })
    .eq("client_hash", hash).gte("created_at", since);
  if (countErr) throw new Error(countErr.message);
  if ((count ?? 0) >= UPLOADS_PER_HOUR) throw new UploadError("הועלו הרבה תמונות בזמן קצר. נסו שוב בעוד כשעה, או שלחו את התמונות אחרי התשלום", 429);
  const day = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { count: dayCount, error: dayErr } = await sb.from("uploads").select("id", { count: "exact", head: true }).gte("created_at", day);
  if (dayErr) throw new Error(dayErr.message);
  if ((dayCount ?? 0) >= (Number(process.env.UPLOADS_PER_DAY) || UPLOADS_PER_DAY_DEFAULT)) {
    console.error("upload daily cap reached");
    throw new UploadError("העלאת תמונות לא זמינה כרגע. אפשר להשלים את ההזמנה ולשלוח את התמונות אחרי התשלום", 503);
  }

  const id = randomUUID();
  const month = new Date().toISOString().slice(0, 7);
  const storagePath = `temp/${month}/${id}.${EXT[input.mime]}`;
  const previewPath = `temp/${month}/${id}-preview.jpg`;
  const name = String(input.name ?? "").replace(/[^\p{L}\p{N}._ -]/gu, "").slice(0, 120) || null;

  const { error: insErr } = await sb.from("uploads").insert({
    id, storage_path: storagePath, preview_path: previewPath, original_filename: name, mime_type: input.mime,
    size_bytes: Math.round(input.size), width_px: int(input.width), height_px: int(input.height),
    status: "temp", rights_confirmed: true, client_hash: hash,
  });
  if (insErr) throw new Error(insErr.message);

  const bucket = sb.storage.from(CUSTOMER_BUCKET);
  const [orig, prev] = await Promise.all([bucket.createSignedUploadUrl(storagePath), bucket.createSignedUploadUrl(previewPath)]);
  if (orig.error || prev.error) throw new Error((orig.error ?? prev.error)!.message);
  return { uploadId: id, uploadUrl: orig.data.signedUrl, previewUrl: prev.data.signedUrl };
}

const int = (n: unknown) => (typeof n === "number" && Number.isFinite(n) && n > 0 ? Math.round(n) : null);

/** אימות אחרי ההעלאה: הקובץ קיים, והתוכן שלו באמת תמונה מהסוג שהוצהר */
export async function completeUpload(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new UploadError("מזהה לא תקין", 404);
  const sb = adminClient();
  const { data: row, error } = await sb.from("uploads").select("id,storage_path,preview_path,mime_type,status,verified_at")
    .eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!row || row.status !== "temp") throw new UploadError("הקובץ לא נמצא. נסו להעלות שוב", 404);
  if (row.verified_at) return { ok: true };

  const head = await readHead(row.storage_path);
  if (!head) throw new UploadError("הקובץ לא הגיע לשרת. נסו להעלות שוב", 409);
  const kind = sniffImage(head);
  if (!kind || kind !== mimeFamily(row.mime_type)) {
    await sb.storage.from(CUSTOMER_BUCKET).remove([row.storage_path, row.preview_path].filter(Boolean));
    await sb.from("uploads").update({ status: "deleted", deleted_at: new Date().toISOString(), deleted_reason: "invalid_file" }).eq("id", id);
    throw new UploadError("הקובץ אינו תמונה תקינה. נסו קובץ אחר");
  }
  // גרסת התצוגה (רשות): חייבת להיות JPEG. אחרת נמחקת, והמקור נשאר
  let previewPath: string | null = row.preview_path;
  if (previewPath) {
    const ph = await readHead(previewPath);
    if (!ph || sniffImage(ph) !== "jpeg") {
      if (ph) await sb.storage.from(CUSTOMER_BUCKET).remove([previewPath]);
      previewPath = null;
    }
  }
  const { error: upErr } = await sb.from("uploads").update({ verified_at: new Date().toISOString(), preview_path: previewPath }).eq("id", id);
  if (upErr) throw new Error(upErr.message);
  return { ok: true };
}

/** קריאת הבתים הראשונים בלבד של הקובץ מהאחסון הפרטי */
async function readHead(path: string): Promise<Uint8Array | null> {
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/${CUSTOMER_BUCKET}/${path}`;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const res = await fetch(url, { headers: { apikey: key, Authorization: `Bearer ${key}`, Range: "bytes=0-63" }, cache: "no-store" });
  if (res.status === 404 || res.status === 400) return null;
  if (!res.ok || !res.body) throw new Error(`storage read failed: ${res.status}`);
  // 206: האחסון כיבד את ה־Range, הגוף הוא 64 בתים בלבד
  if (res.status === 206) return new Uint8Array(await res.arrayBuffer()).slice(0, 64);
  // אחרת: קוראים רק את ההתחלה ומפסיקים. בלי await על cancel (ב־Next הגוף מפוצל, וההמתנה עלולה להיתקע)
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let n = 0;
  while (n < 64) {
    const { value, done } = await reader.read();
    if (done || !value) break;
    chunks.push(value); n += value.length;
  }
  reader.cancel().catch(() => {});
  const out = new Uint8Array(n);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out.slice(0, 64);
}

/** לקופה: כל מזהי התמונות בסל קיימים, אומתו, ועדיין לא שויכו או נמחקו */
export async function checkUploads(ids: string[]): Promise<string[]> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return [];
  if (unique.some((id) => !/^[0-9a-f-]{36}$/i.test(id))) return unique;
  const { data, error } = await adminClient().from("uploads").select("id,status,verified_at").in("id", unique);
  if (error) throw new Error(error.message);
  const ok = new Set((data ?? []).filter((r) => r.status === "temp" && r.verified_at).map((r) => r.id));
  return unique.filter((id) => !ok.has(id));
}

/** ניקוי: תמונות זמניות ששהו יותר מ־temp_upload_hours ולא שויכו להזמנה */
export async function cleanupTempUploads(): Promise<{ deleted: number }> {
  const sb = adminClient();
  const { data: s } = await sb.from("shop_settings").select("temp_upload_hours").maybeSingle();
  const hours = s?.temp_upload_hours ?? 48;
  const before = new Date(Date.now() - hours * 3600_000).toISOString();
  let deleted = 0;
  for (let round = 0; round < 20; round++) {
    const { data, error } = await sb.from("uploads").select("id,storage_path,preview_path")
      .eq("status", "temp").lt("created_at", before).limit(200);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    const paths = data.flatMap((r) => [r.storage_path, r.preview_path].filter(Boolean)) as string[];
    const rm = await sb.storage.from(CUSTOMER_BUCKET).remove(paths);
    if (rm.error) throw new Error(rm.error.message);
    const { error: upErr } = await sb.from("uploads")
      .update({ status: "deleted", deleted_at: new Date().toISOString(), deleted_reason: "temp_expired" })
      .in("id", data.map((r) => r.id));
    if (upErr) throw new Error(upErr.message);
    deleted += data.length;
  }
  return { deleted };
}
