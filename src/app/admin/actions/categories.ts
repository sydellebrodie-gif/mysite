"use server";
import { adminAction, bool, check, int, required, slugOf, str, FormError } from "@/lib/admin/form";

export const saveCategory = adminAction(async (db, fd) => {
  const row = {
    name: required(fd, "name", "שם הקטגוריה", 60), slug: slugOf(fd),
    sort_order: int(fd, "sort_order", "סדר", { max: 10000 }), is_active: bool(fd, "is_active"),
  };
  const cid = str(fd, "id");
  if (cid) check(await db.from("categories").update(row).eq("id", cid));
  else check(await db.from("categories").insert(row));
  return cid ? "נשמר" : "הקטגוריה נוספה";
});

export const deleteCategory = adminAction(async (db, fd) => {
  const cid = str(fd, "id", 40);
  const { data: used } = await db.from("product_categories").select("product_id").eq("category_id", cid);
  if (used?.length) throw new FormError(`יש ${used.length} מוצרים בקטגוריה. יש להעביר אותם לקטגוריה אחרת קודם`);
  check(await db.from("categories").delete().eq("id", cid));
  return "הקטגוריה נמחקה";
});
