"use server";
// עריכת מארזים: פרטים, מחיר/כמויות, פריטים, תמונות. כל חלק נשמר בנפרד.
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import { adminAction, agorot, bool, check, int, required, slugOf, str, FormError } from "@/lib/admin/form";

const id = (fd: FormData, k = "id") => {
  const v = str(fd, k, 40);
  if (!/^[0-9a-f-]{36}$/i.test(v)) throw new FormError("מזהה לא תקין");
  return v;
};

export async function createBundle(_prev: unknown, fd: FormData) {
  const { sb } = await requireAdmin();
  let newId: string;
  try {
    const type = str(fd, "type") === "free" ? "free" : "fixed";
    const { data: last } = await sb.from("bundle_templates").select("code").like("code", "B%");
    const n = Math.max(0, ...(last ?? []).map((r) => Number(String(r.code).slice(1)) || 0)) + 1;
    const r = check(await sb.from("bundle_templates").insert({
      name: required(fd, "name", "שם המארז"), slug: slugOf(fd), code: `B${String(n).padStart(2, "0")}`, type,
      fixed_price_agorot: type === "fixed" ? agorot(fd, "price", "מחיר המארז") : null,
      min_items: type === "free" ? 3 : 0, is_active: false, sort_order: n * 10,
    }).select("id").single());
    newId = r.data!.id;
  } catch (e) {
    return { ok: false, msg: e instanceof FormError ? e.message : "יצירת המארז נכשלה", at: Date.now() };
  }
  revalidatePath("/", "layout");
  redirect(`/admin/bundles/${newId}?created=1`);
}

export const saveBasics = adminAction(async (db, fd) => {
  check(await db.from("bundle_templates").update({
    name: required(fd, "name", "שם המארז"), code: required(fd, "code", "קוד", 12), slug: slugOf(fd),
    description: str(fd, "description", 2000), is_active: bool(fd, "is_active"),
    sort_order: int(fd, "sort_order", "סדר", { max: 100000 }),
  }).eq("id", id(fd)));
});

export const savePricing = adminAction(async (db, fd) => {
  const bid = id(fd);
  const { data: b } = check(await db.from("bundle_templates").select("type").eq("id", bid).single());
  if (b!.type === "fixed") {
    check(await db.from("bundle_templates").update({ fixed_price_agorot: agorot(fd, "price", "מחיר המארז") }).eq("id", bid));
  } else {
    const min = int(fd, "min_items", "מינימום פריטים", { max: 100 })!;
    const max = int(fd, "max_items", "מקסימום פריטים", { min: 1, max: 100, optional: true });
    if (max !== null && max < min) throw new FormError("המקסימום קטן מהמינימום");
    check(await db.from("bundle_templates").update({ min_items: min, max_items: max }).eq("id", bid));
  }
});

export const saveItem = adminAction(async (db, fd) => {
  const qty = int(fd, "quantity", "כמות", { min: 1, max: 100 })!;
  const maxDesigns = int(fd, "max_designs", "עד כמה עיצובים", { min: 1, max: 100, optional: true });
  const row = {
    bundle_template_id: id(fd, "bundle_id"), product_id: id(fd, "product_id"), quantity: qty,
    max_designs: maxDesigns !== null && maxDesigns < qty ? maxDesigns : null,
    sort_order: int(fd, "sort_order", "סדר", { max: 10000 }),
  };
  const iid = str(fd, "id");
  if (iid) check(await db.from("fixed_bundle_items").update(row).eq("id", iid));
  else check(await db.from("fixed_bundle_items").insert(row));
  return iid ? "נשמר" : "הפריט נוסף";
});

export const deleteItem = adminAction(async (db, fd) => {
  check(await db.from("fixed_bundle_items").delete().eq("id", id(fd)));
  return "הפריט הוסר מהמארז";
});

export async function deleteBundle(_prev: unknown, fd: FormData) {
  const { sb } = await requireAdmin();
  try {
    const bid = id(fd);
    const { data: b } = check(await sb.from("bundle_templates").select("images").eq("id", bid).single());
    check(await sb.from("bundle_templates").delete().eq("id", bid));
    if (b!.images?.length) await sb.storage.from("product-images").remove(b!.images);
  } catch (e) {
    return { ok: false, msg: e instanceof FormError ? e.message : "המחיקה נכשלה", at: Date.now() };
  }
  revalidatePath("/", "layout");
  redirect("/admin/bundles?deleted=1");
}
