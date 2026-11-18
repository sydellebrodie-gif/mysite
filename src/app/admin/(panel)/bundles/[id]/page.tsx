import Link from "next/link";
import { notFound } from "next/navigation";
import AdminForm from "@/components/admin/AdminForm";
import ImageManager from "@/components/admin/ImageManager";
import { Area, Check, Money, Num, Select, Text } from "@/components/admin/fields";
import { requireAdmin } from "@/lib/admin/auth";
import { formatILS } from "@/lib/format";
import * as A from "../../../actions/bundles";
import * as P from "../../../actions/products";

export default async function BundleEditPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { sb } = await requireAdmin();
  const [{ data: b }, { data: items }, { data: products }] = await Promise.all([
    sb.from("bundle_templates").select("*").eq("id", id).maybeSingle(),
    sb.from("fixed_bundle_items").select("*").eq("bundle_template_id", id).order("sort_order").order("id"),
    sb.from("products").select("id,name,code,base_price_agorot").order("sort_order"),
  ]);
  if (!b) notFound();
  const productOptions = (products ?? []).map((p) => ({ value: p.id, label: `${p.name} (${p.code})` }));
  const priceOf = new Map((products ?? []).map((p) => [p.id, p.base_price_agorot]));
  const regular = (items ?? []).reduce((s, it) => s + (priceOf.get(it.product_id) ?? 0) * it.quantity, 0);
  const nextSort = (items ?? []).reduce((m, r) => Math.max(m, r.sort_order), 0) + 1;
  const hid = { id };
  const itemFields = (it: Record<string, any> | null) => ( // eslint-disable-line @typescript-eslint/no-explicit-any
    <div className="grid-2">
      <Select name="product_id" label="מוצר" defaultValue={it?.product_id ?? productOptions[0]?.value} options={productOptions} />
      <Num name="quantity" label="כמות" defaultValue={it?.quantity ?? 1} min={1} />
      <Num name="max_designs" label="עד כמה עיצובים שונים" defaultValue={it?.max_designs} optional min={1}
        help="ריק = עיצוב לכל יחידה. למשל 10 דפים בעד 5 עיצובים" />
      <Num name="sort_order" label="סדר במארז" defaultValue={it?.sort_order ?? nextSort} />
    </div>
  );

  return (
    <>
      <nav className="crumbs"><Link href="/admin/bundles">מארזים</Link> › {b.name}</nav>
      <div className="admin-head">
        <h1>{b.name} <small className="muted ltr">{b.code}</small></h1>
        {b.is_active && <Link href={`/bundles/${b.slug}`} target="_blank">צפייה באתר ↗</Link>}
      </div>
      {sp.created && <p className="saved" role="status">✓ המארז נוצר (מוסתר מהאתר)</p>}
      <p className="muted">כל חלק בעמוד נשמר בנפרד. האריזה ({"מחיר אחיד לכל מארז"}) נקבעת בהגדרות.</p>

      <section className="admin-card">
        <h2>פרטים</h2>
        <AdminForm action={A.saveBasics} hidden={hid}>
          <Text name="name" label="שם המארז" defaultValue={b.name} required />
          <div className="grid-2">
            <Text name="code" label="קוד" defaultValue={b.code} ltr required max={12} />
            <Text name="slug" label="כתובת בדף (באנגלית)" defaultValue={b.slug} ltr required />
            <Num name="sort_order" label="סדר באתר" defaultValue={b.sort_order} />
          </div>
          <Area name="description" label="תיאור" defaultValue={b.description} rows={3} />
          <Check name="is_active" label="מוצג באתר" defaultChecked={b.is_active} />
        </AdminForm>
      </section>

      <section className="admin-card">
        <h2>{b.type === "fixed" ? "מחיר" : "כמות פריטים"}</h2>
        <AdminForm action={A.savePricing} hidden={hid}>
          {b.type === "fixed" ? (
            <>
              <Money name="price" label="מחיר המארז (בלי אריזה)" agorot={b.fixed_price_agorot} />
              <p className="muted">סכום המחירים הרגילים של הפריטים: <span className="ltr">{formatILS(regular)}</span></p>
            </>
          ) : (
            <div className="grid-2">
              <Num name="min_items" label="מינימום פריטים" defaultValue={b.min_items} />
              <Num name="max_items" label="מקסימום פריטים" defaultValue={b.max_items} optional min={1} help="ריק = בלי הגבלה" />
            </div>
          )}
        </AdminForm>
        {b.type === "free" && <p className="muted">המוצרים שאפשר לבחור: כל מוצר שמסומן אצלו &quot;אפשר לבחור במארז בהרכבה חופשית&quot;.</p>}
      </section>

      {b.type === "fixed" && (
        <section className="admin-card">
          <h2>פריטים במארז</h2>
          <p className="muted">הלקוח ממלא עיצוב לכל פריט, לפי הסדר כאן. כל יחידה יורדת מהמלאי של המוצר.</p>
          {(items ?? []).map((it) => (
            <div key={it.id} className="sub-card">
              <AdminForm action={A.saveItem} hidden={{ bundle_id: id, id: it.id }}>{itemFields(it)}</AdminForm>
              <AdminForm action={A.deleteItem} hidden={{ id: it.id }} submit="הסרה מהמארז" danger confirm="להסיר את הפריט מהמארז?" className="inline" />
            </div>
          ))}
          <details className="add-new">
            <summary>+ פריט</summary>
            <AdminForm action={A.saveItem} hidden={{ bundle_id: id, id: "" }} submit="הוספה למארז" resetOnSuccess>{itemFields(null)}</AdminForm>
          </details>
        </section>
      )}

      <section className="admin-card">
        <h2>תמונות</h2>
        <ImageManager table="bundle_templates" id={id} images={b.images ?? []} folder="bundles" label={b.name}
          actions={{ add: P.addImage, remove: P.removeImage, move: P.moveImage }} />
      </section>

      <section className="admin-card danger-zone">
        <h2>מחיקת המארז</h2>
        <p className="muted">אפשר למחוק רק מארז שלא הוזמן. אחרת מסתירים אותו.</p>
        <AdminForm action={A.deleteBundle} hidden={hid} submit="מחיקה לצמיתות" danger confirm={`למחוק את "${b.name}" לצמיתות?`} />
      </section>
    </>
  );
}
