"use server";
// עריכת הזמנה: כל חלק נשמר בנפרד (סטטוס, מעקב, פרטי לקוח, מסירה, התאמה של כל פריט, קבצים).
// הסכומים ששולמו לא נערכים כאן: הם תואמים לתשלום ולקבלה.
import { adminAction, bool, check, required, str, FormError } from "@/lib/admin/form";
import type { AdminDb } from "@/lib/admin/auth";
import { asCustomization, ORDER_STATUSES } from "@/lib/order-format";

const CUSTOMER = "customer-uploads";
const uuid = (fd: FormData, k: string) => {
  const v = str(fd, k, 40);
  if (!/^[0-9a-f-]{36}$/i.test(v)) throw new FormError("מזהה לא תקין");
  return v;
};
const log = (db: AdminDb, userId: string, action: string, orderId: string, detail: string, uploadId?: string) =>
  db.from("access_log").insert({ user_id: userId, action, order_id: orderId, upload_id: uploadId ?? null, detail });

async function lineOf(db: AdminDb, lineId: string) {
  const { data } = check(await db.from("order_lines").select("id,order_id,product_id,customization,awaiting_upload").eq("id", lineId).single());
  return data!;
}

export const saveStatus = adminAction(async (db, fd, userId) => {
  const oid = uuid(fd, "id"), status = str(fd, "status");
  if (!ORDER_STATUSES.some((s) => s.value === status)) throw new FormError("סטטוס לא מוכר");
  const delivered = status === "shipped" || status === "picked_up";
  const { data: cur } = check(await db.from("orders").select("delivered_at").eq("id", oid).single());
  check(await db.from("orders").update({
    status, delivered_at: delivered ? cur!.delivered_at ?? new Date().toISOString() : null,
  }).eq("id", oid));
  await log(db, userId, "status_change", oid, status);
  return "הסטטוס עודכן";
});

export const saveTracking = adminAction(async (db, fd, userId) => {
  const oid = uuid(fd, "id");
  check(await db.from("orders").update({
    needs_attention: bool(fd, "needs_attention"), awaiting_materials: bool(fd, "awaiting_materials"),
    internal_note: str(fd, "internal_note", 4000),
  }).eq("id", oid));
  await log(db, userId, "edit", oid, "מעקב והערה פנימית");
});

export const saveCustomer = adminAction(async (db, fd, userId) => {
  const oid = uuid(fd, "id");
  const email = required(fd, "customer_email", "מייל", 200);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new FormError("כתובת מייל לא תקינה");
  const phone = required(fd, "customer_phone", "טלפון", 30);
  if (!/^[0-9+\-\s()]{9,20}$/.test(phone)) throw new FormError("מספר טלפון לא תקין");
  check(await db.from("orders").update({
    customer_name: required(fd, "customer_name", "שם", 120), customer_phone: phone, customer_email: email,
    customer_note: str(fd, "customer_note", 2000),
  }).eq("id", oid));
  await log(db, userId, "edit", oid, "פרטי לקוח");
});

export const saveDelivery = adminAction(async (db, fd, userId) => {
  const oid = uuid(fd, "id");
  const method = str(fd, "delivery_method") === "courier" ? "courier" : "pickup";
  const address = method === "courier" ? {
    city: required(fd, "city", "עיר", 60), street: required(fd, "street", "רחוב", 80),
    house: required(fd, "house", "מספר בית", 10), apartment: str(fd, "apartment", 20), notes: str(fd, "address_notes", 300),
  } : null;
  check(await db.from("orders").update({ delivery_method: method, delivery_address: address }).eq("id", oid));
  await log(db, userId, "edit", oid, "פרטי מסירה");
});

export const saveLine = adminAction(async (db, fd, userId) => {
  const line = await lineOf(db, uuid(fd, "line_id"));
  const c = asCustomization(line.customization);
  const values: Record<string, string> = {};
  for (const [k, v] of fd.entries()) {
    if (k.startsWith("v_") && typeof v === "string" && v.trim()) {
      if (v.length > 2000) throw new FormError("טקסט ארוך מדי");
      values[k.slice(2)] = v.trim();
    }
  }
  const next = { ...c, option: str(fd, "option", 40) || null, values, note: str(fd, "note", 2000) };
  check(await db.from("order_lines").update({ customization: next, awaiting_upload: bool(fd, "awaiting_upload") }).eq("id", line.id));
  await log(db, userId, "edit", line.order_id, "התאמה של פריט");
  return "הפריט עודכן";
});

/** קובץ שבעלת העסק העלתה לפריט (למשל תמונה שהגיעה בוואטסאפ). הקובץ כבר באחסון הפרטי */
export const attachFile = adminAction(async (db, fd, userId) => {
  const line = await lineOf(db, uuid(fd, "line_id"));
  const field = str(fd, "field", 40);
  const path = str(fd, "path", 200), preview = str(fd, "preview_path", 200);
  const prefix = `orders/${line.order_id}/`;
  if (!path.startsWith(prefix) || (preview && !preview.startsWith(prefix))) throw new FormError("נתיב קובץ לא תקין");
  const mime = str(fd, "mime", 40);
  const r = check(await db.from("uploads").insert({
    storage_path: path, preview_path: preview || null, original_filename: str(fd, "name", 200) || null, mime_type: mime,
    size_bytes: Number(str(fd, "size", 20)) || 1, width_px: Number(str(fd, "width", 8)) || null, height_px: Number(str(fd, "height", 8)) || null,
    status: "attached", order_line_id: line.id, rights_confirmed: true, attached_at: new Date().toISOString(), verified_at: new Date().toISOString(),
  }).select("id").single());
  const c = asCustomization(line.customization);
  c.images[field] = [...(c.images[field] ?? []), { uploadId: r.data!.id, name: str(fd, "name", 200) }];
  check(await db.from("order_lines").update({ customization: c, awaiting_upload: false }).eq("id", line.id));
  await log(db, userId, "upload", line.order_id, "קובץ נוסף לפריט", r.data!.id);
  return "הקובץ נוסף לפריט";
});

async function deleteUploads(db: AdminDb, ids: string[]) {
  if (!ids.length) return 0;
  const { data } = check(await db.from("uploads").select("id,storage_path,preview_path").in("id", ids).neq("status", "deleted"));
  const rows = data ?? [];
  const paths = rows.flatMap((u) => [u.storage_path, u.preview_path].filter(Boolean)) as string[];
  if (paths.length) {
    const rm = await db.storage.from(CUSTOMER).remove(paths);
    if (rm.error) throw new FormError("המחיקה מהאחסון נכשלה. שום דבר לא סומן כנמחק. אפשר לנסות שוב");
  }
  if (rows.length) check(await db.from("uploads").update({
    status: "deleted", deleted_at: new Date().toISOString(), deleted_reason: "owner_confirmed",
  }).in("id", rows.map((r) => r.id)));
  return rows.length;
}

export const removeFile = adminAction(async (db, fd, userId) => {
  const line = await lineOf(db, uuid(fd, "line_id"));
  const uploadId = uuid(fd, "upload_id");
  const c = asCustomization(line.customization);
  for (const k of Object.keys(c.images)) c.images[k] = c.images[k].filter((i) => i.uploadId !== uploadId);
  await deleteUploads(db, [uploadId]);
  check(await db.from("order_lines").update({ customization: c }).eq("id", line.id));
  await log(db, userId, "delete", line.order_id, "קובץ הוסר מפריט", uploadId);
  return "הקובץ הוסר ונמחק מהענן";
});

/** "קיבלתי את הקבצים, מחקו מהענן": כל הקבצים של ההזמנה (מקור ותצוגה). נשאר רק תיעוד שהיו */
export const deleteOrderFiles = adminAction(async (db, fd, userId) => {
  const oid = uuid(fd, "id");
  if (!bool(fd, "confirm")) throw new FormError("יש לסמן שהקבצים נשמרו במחשב");
  const { data: lines } = check(await db.from("order_lines").select("id").eq("order_id", oid));
  const ids = (lines ?? []).map((l) => l.id);
  const { data: ups } = ids.length ? check(await db.from("uploads").select("id").in("order_line_id", ids).neq("status", "deleted")) : { data: [] };
  const n = await deleteUploads(db, (ups ?? []).map((u) => u.id));
  await log(db, userId, "delete", oid, `נמחקו ${n} קבצים מהענן אחרי הורדה`);
  return n ? `נמחקו ${n} קבצים מהענן` : "אין קבצים למחיקה";
});
