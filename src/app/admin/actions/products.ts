"use server";
// עריכת מוצרים: כל חלק (פרטים, מחיר, מלאי, עלות, תמונות, מסלולי עיצוב, שדות, עיצובים קבועים) נשמר בנפרד.
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import { adminAction, agorot, bool, check, int, required, slugOf, str, FormError } from "@/lib/admin/form";

const PRODUCT_IMAGES = "product-images";
const id = (fd: FormData, k = "id") => {
  const v = str(fd, k, 40);
  if (!/^[0-9a-f-]{36}$/i.test(v)) throw new FormError("מזהה לא תקין");
  return v;
};
const key = (fd: FormData, k = "key") => {
  const v = str(fd, k, 40);
  if (!/^[a-z][a-z0-9_]*$/.test(v)) throw new FormError("מפתח: אותיות קטנות באנגלית, ספרות וקו תחתון, למשל caption");
  return v;
};

export async function createProduct(_prev: unknown, fd: FormData) {
  const { sb } = await requireAdmin();
  let newId: string;
  try {
    const name = required(fd, "name", "שם המוצר");
    const { data: last } = await sb.from("products").select("code").like("code", "P%");
    const n = Math.max(0, ...(last ?? []).map((r) => Number(String(r.code).slice(1)) || 0)) + 1;
    const code = `P${String(n).padStart(2, "0")}`;
    const r = check(await sb.from("products").insert({
      name, code, slug: slugOf(fd), base_price_agorot: agorot(fd, "price", "מחיר"),
      is_active: false, stock_mode: "counted", stock_qty: 0, sort_order: n * 10,
    }).select("id").single());
    newId = r.data!.id;
  } catch (e) {
    return { ok: false, msg: e instanceof FormError ? e.message : "יצירת המוצר נכשלה", at: Date.now() };
  }
  revalidatePath("/", "layout");
  redirect(`/admin/products/${newId}?created=1`);
}

export const saveBasics = adminAction(async (db, fd) => {
  const pid = id(fd);
  check(await db.from("products").update({
    name: required(fd, "name", "שם המוצר"),
    code: required(fd, "code", "קוד", 12),
    slug: slugOf(fd),
    description: str(fd, "description", 2000),
    is_active: bool(fd, "is_active"),
    sort_order: int(fd, "sort_order", "סדר", { max: 100000 }),
  }).eq("id", pid));
  const cat = str(fd, "category_id", 40);
  check(await db.from("product_categories").delete().eq("product_id", pid));
  if (cat) check(await db.from("product_categories").insert({ product_id: pid, category_id: cat }));
});

export const savePricing = adminAction(async (db, fd) => {
  const dealQty = int(fd, "deal_qty", "כמות במבצע", { min: 2, max: 100, optional: true });
  const dealPrice = agorot(fd, "deal_price", "מחיר המבצע", { optional: true });
  if ((dealQty === null) !== (dealPrice === null)) throw new FormError("במבצע צריך גם כמות וגם מחיר, או להשאיר את שניהם ריקים");
  check(await db.from("products").update({
    base_price_agorot: agorot(fd, "price", "מחיר"), deal_qty: dealQty, deal_price_agorot: dealPrice,
  }).eq("id", id(fd)));
});

export const saveStock = adminAction(async (db, fd) => {
  const counted = str(fd, "stock_mode") !== "plenty";
  check(await db.from("products").update({
    stock_mode: counted ? "counted" : "plenty",
    stock_qty: counted ? int(fd, "stock_qty", "כמות במלאי", { max: 100000 }) : null,
    is_available: bool(fd, "is_available"),
    allowed_in_bundles: bool(fd, "allowed_in_bundles"),
  }).eq("id", id(fd)));
});

export const saveCost = adminAction(async (db, fd) => {
  const cost = agorot(fd, "cost", "עלות", { optional: true });
  const pid = id(fd);
  if (cost === null) { check(await db.from("product_costs").delete().eq("product_id", pid)); return "העלות נמחקה"; }
  check(await db.from("product_costs").upsert({
    product_id: pid, base_cost_agorot: cost, note: str(fd, "cost_note", 500), updated_at: new Date().toISOString(),
  }, { onConflict: "product_id" }));
});

// ---------- תמונות (מוצרים ומארזים) ----------
const imageTable = (fd: FormData) => {
  const t = str(fd, "table");
  if (t !== "products" && t !== "bundle_templates") throw new FormError("טבלה לא מוכרת");
  return t;
};
const validPath = (p: string) => /^(products|bundles|designs)\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp)$/.test(p);

export const addImage = adminAction(async (db, fd) => {
  const table = imageTable(fd), rid = id(fd), path = str(fd, "path", 200);
  if (!validPath(path)) throw new FormError("נתיב תמונה לא תקין");
  const { data } = check(await db.from(table).select("images").eq("id", rid).single());
  check(await db.from(table).update({ images: [...(data!.images ?? []), path] }).eq("id", rid));
  return "התמונה נוספה";
});

export const removeImage = adminAction(async (db, fd) => {
  const table = imageTable(fd), rid = id(fd), path = str(fd, "path", 200);
  const { data } = check(await db.from(table).select("images").eq("id", rid).single());
  check(await db.from(table).update({ images: (data!.images ?? []).filter((x: string) => x !== path) }).eq("id", rid));
  if (validPath(path)) await db.storage.from(PRODUCT_IMAGES).remove([path]);
  return "התמונה הוסרה";
});

export const moveImage = adminAction(async (db, fd) => {
  const table = imageTable(fd), rid = id(fd), path = str(fd, "path", 200), dir = str(fd, "dir") === "up" ? -1 : 1;
  const { data } = check(await db.from(table).select("images").eq("id", rid).single());
  const list: string[] = [...(data!.images ?? [])];
  const i = list.indexOf(path), j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return "אין שינוי";
  [list[i], list[j]] = [list[j], list[i]];
  check(await db.from(table).update({ images: list }).eq("id", rid));
  return i + dir === 0 ? "זו עכשיו התמונה הראשית" : "הסדר עודכן";
});

// ---------- מסלולי עיצוב ----------
export const saveOption = adminAction(async (db, fd) => {
  const row = {
    product_id: id(fd, "product_id"), key: key(fd), label: required(fd, "label", "שם המסלול"),
    help_text: str(fd, "help_text", 300), sort_order: int(fd, "sort_order", "סדר", { max: 10000 }),
  };
  const oid = str(fd, "id");
  if (oid) {
    const { data: old } = check(await db.from("product_design_options").select("key").eq("id", oid).single());
    check(await db.from("product_design_options").update(row).eq("id", oid));
    // שדות שמשויכים למסלול עוברים איתו אם המפתח השתנה
    if (old!.key !== row.key)
      check(await db.from("customization_fields").update({ design_option_key: row.key })
        .eq("product_id", row.product_id).eq("design_option_key", old!.key));
  } else check(await db.from("product_design_options").insert(row));
  return oid ? "נשמר" : "המסלול נוסף";
});

export const deleteOption = adminAction(async (db, fd) => {
  const oid = id(fd);
  const { data: o } = check(await db.from("product_design_options").select("product_id,key").eq("id", oid).single());
  const { data: used } = await db.from("customization_fields").select("id").eq("product_id", o!.product_id).eq("design_option_key", o!.key);
  if (used?.length) throw new FormError(`יש ${used.length} שדות ששייכים למסלול הזה. יש למחוק אותם או לשייך אותם למסלול אחר קודם`);
  check(await db.from("product_design_options").delete().eq("id", oid));
  return "המסלול נמחק";
});

// ---------- שדות התאמה ----------
const FIELD_TYPES = ["text", "textarea", "image", "select", "design"];
export const saveField = adminAction(async (db, fd) => {
  const type = str(fd, "type");
  if (!FIELD_TYPES.includes(type)) throw new FormError("סוג שדה לא מוכר");
  const options = str(fd, "options", 2000).split(/\n|,/).map((s) => s.trim()).filter(Boolean);
  if (type === "select" && !options.length) throw new FormError("בשדה בחירה צריך לפחות אפשרות אחת (שורה לכל אפשרות)");
  const minI = int(fd, "min_images", "מינימום תמונות", { max: 50, optional: true }) ?? 0;
  const maxI = int(fd, "max_images", "מקסימום תמונות", { max: 50, optional: true }) ?? 1;
  if (type === "image" && minI > maxI) throw new FormError("מינימום התמונות גדול מהמקסימום");
  const row = {
    product_id: id(fd, "product_id"), key: key(fd), label: required(fd, "label", "תווית"), type,
    required: bool(fd, "required"), design_option_key: str(fd, "design_option_key", 40) || null,
    max_length: int(fd, "max_length", "אורך מקסימלי", { min: 1, max: 2000, optional: true }),
    max_words: int(fd, "max_words", "מילים", { min: 1, max: 500, optional: true }),
    min_images: type === "image" ? minI : 0, max_images: type === "image" ? maxI : 1,
    options: type === "select" ? options : [], help_text: str(fd, "help_text", 300),
    sort_order: int(fd, "sort_order", "סדר", { max: 10000 }),
  };
  const fid = str(fd, "id");
  if (fid) check(await db.from("customization_fields").update(row).eq("id", fid));
  else check(await db.from("customization_fields").insert(row));
  return fid ? "נשמר" : "השדה נוסף";
});

export const deleteField = adminAction(async (db, fd) => {
  check(await db.from("customization_fields").delete().eq("id", id(fd)));
  return "השדה נמחק";
});

// ---------- עיצובים קבועים ----------
export const saveDesign = adminAction(async (db, fd) => {
  const path = str(fd, "image_path", 200);
  if (path && !validPath(path)) throw new FormError("נתיב תמונה לא תקין");
  const row = {
    product_id: id(fd, "product_id"), name: required(fd, "name", "שם העיצוב"),
    is_active: bool(fd, "is_active"), sort_order: int(fd, "sort_order", "סדר", { max: 10000 }),
    ...(fd.has("image_path") ? { image_path: path || null } : {}),
  };
  const did = str(fd, "id");
  if (did) {
    if (fd.has("image_path")) {
      const { data: old } = await db.from("product_designs").select("image_path").eq("id", did).single();
      if (old?.image_path && old.image_path !== path) await db.storage.from(PRODUCT_IMAGES).remove([old.image_path]);
    }
    check(await db.from("product_designs").update(row).eq("id", did));
  } else check(await db.from("product_designs").insert(row));
  return did ? "נשמר" : "העיצוב נוסף";
});

export const deleteDesign = adminAction(async (db, fd) => {
  const did = id(fd);
  const { data } = await db.from("product_designs").select("image_path").eq("id", did).single();
  check(await db.from("product_designs").delete().eq("id", did));
  if (data?.image_path) await db.storage.from(PRODUCT_IMAGES).remove([data.image_path]);
  return "העיצוב נמחק";
});

export async function deleteProduct(_prev: unknown, fd: FormData) {
  const { sb } = await requireAdmin();
  try {
    const pid = id(fd);
    const { data: p } = check(await sb.from("products").select("images").eq("id", pid).single());
    const { data: designs } = await sb.from("product_designs").select("image_path").eq("product_id", pid);
    check(await sb.from("products").delete().eq("id", pid));
    const paths = [...(p!.images ?? []), ...(designs ?? []).map((d) => d.image_path).filter(Boolean)];
    if (paths.length) await sb.storage.from(PRODUCT_IMAGES).remove(paths);
  } catch (e) {
    return { ok: false, msg: e instanceof FormError ? e.message : "המחיקה נכשלה", at: Date.now() };
  }
  revalidatePath("/", "layout");
  redirect("/admin/products?deleted=1");
}
