import AdminForm from "@/components/admin/AdminForm";
import { Check, Num, Text } from "@/components/admin/fields";
import { requireAdmin } from "@/lib/admin/auth";
import { deleteCategory, saveCategory } from "../../actions/categories";

export default async function CategoriesPage() {
  const { sb } = await requireAdmin();
  const [{ data: cats }, { data: links }] = await Promise.all([
    sb.from("categories").select("*").order("sort_order"),
    sb.from("product_categories").select("category_id"),
  ]);
  const count = (id: string) => (links ?? []).filter((l) => l.category_id === id).length;
  const next = (cats ?? []).reduce((m, c) => Math.max(m, c.sort_order), 0) + 10;
  return (
    <>
      <h1>קטגוריות</h1>
      <p className="muted">משייכים מוצר לקטגוריה בעמוד המוצר.</p>
      {(cats ?? []).map((c) => (
        <section key={c.id} className="admin-card">
          <h2>{c.name} <small className="muted">· {count(c.id)} מוצרים</small></h2>
          <AdminForm action={saveCategory} hidden={{ id: c.id }}>
            <div className="grid-2">
              <Text name="name" label="שם" defaultValue={c.name} required max={60} />
              <Text name="slug" label="כתובת (באנגלית)" defaultValue={c.slug} ltr required />
              <Num name="sort_order" label="סדר" defaultValue={c.sort_order} />
            </div>
            <Check name="is_active" label="מוצגת באתר" defaultChecked={c.is_active} />
          </AdminForm>
          <AdminForm action={deleteCategory} hidden={{ id: c.id }} submit="מחיקה" danger confirm={`למחוק את הקטגוריה "${c.name}"?`} className="inline" />
        </section>
      ))}
      <section className="admin-card">
        <h2>קטגוריה חדשה</h2>
        <AdminForm action={saveCategory} hidden={{ id: "" }} submit="הוספה" resetOnSuccess>
          <div className="grid-2">
            <Text name="name" label="שם" required max={60} />
            <Text name="slug" label="כתובת (באנגלית)" ltr required placeholder="birthday" />
            <Num name="sort_order" label="סדר" defaultValue={next} />
          </div>
          <Check name="is_active" label="מוצגת באתר" defaultChecked />
        </AdminForm>
      </section>
    </>
  );
}
