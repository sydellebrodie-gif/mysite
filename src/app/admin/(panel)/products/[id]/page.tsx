import Link from "next/link";
import { notFound } from "next/navigation";
import AdminForm from "@/components/admin/AdminForm";
import ImageManager, { ImagePick } from "@/components/admin/ImageManager";
import { Area, Check, Money, Num, Select, Text } from "@/components/admin/fields";
import { requireAdmin } from "@/lib/admin/auth";
import { formatILS } from "@/lib/format";
import * as A from "../../../actions/products";

const TYPE_LABELS: Record<string, string> = {
  text: "טקסט קצר", textarea: "טקסט ארוך", image: "תמונות", select: "בחירה מרשימה", design: "בחירת עיצוב קבוע",
};

export default async function ProductEditPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { sb } = await requireAdmin();
  const [{ data: p }, { data: cats }, { data: pc }, { data: options }, { data: fields }, { data: designs }, { data: cost }] = await Promise.all([
    sb.from("products").select("*").eq("id", id).maybeSingle(),
    sb.from("categories").select("id,name").order("sort_order"),
    sb.from("product_categories").select("category_id").eq("product_id", id),
    sb.from("product_design_options").select("*").eq("product_id", id).order("sort_order"),
    sb.from("customization_fields").select("*").eq("product_id", id).order("sort_order"),
    sb.from("product_designs").select("*").eq("product_id", id).order("sort_order"),
    sb.from("product_costs").select("*").eq("product_id", id).maybeSingle(),
  ]);
  if (!p) notFound();
  const optionChoices = [{ value: "", label: "בכל המסלולים" }, ...(options ?? []).map((o) => ({ value: o.key, label: o.label }))];
  const nextSort = (rows: { sort_order: number }[] | null) => ((rows ?? []).reduce((m, r) => Math.max(m, r.sort_order), 0) + 10);
  const margin = cost ? p.base_price_agorot - cost.base_cost_agorot : null;
  const hid = { id };

  const fieldForm = (f: Record<string, any> | null) => ( // eslint-disable-line @typescript-eslint/no-explicit-any
    <AdminForm action={A.saveField} hidden={{ product_id: id, id: f?.id ?? "" }} submit={f ? "שמירת השדה" : "הוספת השדה"} resetOnSuccess={!f}>
      <div className="grid-2">
        <Text name="label" label="תווית (מה הלקוח רואה)" defaultValue={f?.label} required />
        <Text name="key" label="מפתח (באנגלית)" defaultValue={f?.key} ltr required placeholder="caption" />
        <Select name="type" label="סוג" defaultValue={f?.type ?? "text"} options={Object.entries(TYPE_LABELS).map(([value, label]) => ({ value, label }))} />
        <Select name="design_option_key" label="מופיע במסלול" defaultValue={f?.design_option_key ?? ""} options={optionChoices} />
        <Num name="max_length" label="מקסימום תווים" defaultValue={f?.max_length} optional min={1} />
        <Num name="max_words" label="מקסימום מילים" defaultValue={f?.max_words} optional min={1} />
        <Num name="min_images" label="מינימום תמונות" defaultValue={f?.min_images ?? 1} optional />
        <Num name="max_images" label="מקסימום תמונות" defaultValue={f?.max_images ?? 1} optional />
        <Num name="sort_order" label="סדר" defaultValue={f?.sort_order ?? nextSort(fields)} />
      </div>
      <Area name="options" label="אפשרויות (לשדה בחירה: שורה לכל אפשרות)" defaultValue={(f?.options ?? []).join("\n")} rows={2} />
      <Text name="help_text" label="טקסט עזרה" defaultValue={f?.help_text} max={300} />
      <Check name="required" label="חובה" defaultChecked={f?.required ?? true} />
    </AdminForm>
  );

  return (
    <>
      <nav className="crumbs"><Link href="/admin/products">מוצרים</Link> › {p.name}</nav>
      <div className="admin-head">
        <h1>{p.name} <small className="muted ltr">{p.code}</small></h1>
        {p.is_active && <Link href={`/products/${p.slug}`} target="_blank">צפייה באתר ↗</Link>}
      </div>
      {sp.created && <p className="saved" role="status">✓ המוצר נוצר (מוסתר מהאתר עד שמסמנים &quot;מוצג באתר&quot;)</p>}
      <p className="muted">כל חלק בעמוד נשמר בנפרד, בכפתור השמירה שלו.</p>

      <section className="admin-card" id="basics">
        <h2>פרטים</h2>
        <AdminForm action={A.saveBasics} hidden={hid}>
          <Text name="name" label="שם המוצר" defaultValue={p.name} required />
          <div className="grid-2">
            <Text name="code" label="קוד" defaultValue={p.code} ltr required max={12} />
            <Text name="slug" label="כתובת בדף (באנגלית)" defaultValue={p.slug} ltr required />
            <Select name="category_id" label="קטגוריה" defaultValue={pc?.[0]?.category_id ?? ""}
              options={[{ value: "", label: "בלי קטגוריה" }, ...(cats ?? []).map((c) => ({ value: c.id, label: c.name }))]} />
            <Num name="sort_order" label="סדר באתר (קטן = קודם)" defaultValue={p.sort_order} />
          </div>
          <Area name="description" label="תיאור" defaultValue={p.description} rows={4} />
          <Check name="is_active" label="מוצג באתר" defaultChecked={p.is_active} />
        </AdminForm>
      </section>

      <section className="admin-card" id="pricing">
        <h2>מחיר ומבצע</h2>
        <AdminForm action={A.savePricing} hidden={hid}>
          <Money name="price" label="מחיר ליחידה" agorot={p.base_price_agorot} />
          <div className="grid-2">
            <Num name="deal_qty" label="מבצע: כמות" defaultValue={p.deal_qty} optional min={2} help="למשל 2 (בשביל 2 ב־25 ₪). ריק = בלי מבצע" />
            <Money name="deal_price" label="מבצע: מחיר לכל הכמות" agorot={p.deal_price_agorot} optional />
          </div>
        </AdminForm>
      </section>

      <section className="admin-card" id="stock">
        <h2>מלאי וזמינות</h2>
        <AdminForm action={A.saveStock} hidden={hid}>
          <Select name="stock_mode" label="ספירת מלאי" defaultValue={p.stock_mode}
            options={[{ value: "counted", label: "נספר (כמות במלאי)" }, { value: "plenty", label: "בלי ספירה" }]} />
          <Num name="stock_qty" label="כמות במלאי" defaultValue={p.stock_qty ?? 0} help="משותף למוצר לבד ובתוך מארזים" />
          <Check name="is_available" label="זמין להזמנה" help="(כבוי = מופיע באתר כ&quot;בקרוב&quot;)" defaultChecked={p.is_available} />
          <Check name="allowed_in_bundles" label="אפשר לבחור במארז בהרכבה חופשית" defaultChecked={p.allowed_in_bundles} />
        </AdminForm>
      </section>

      <section className="admin-card" id="cost">
        <h2>עלות (פנימי, לא מוצג באתר)</h2>
        <AdminForm action={A.saveCost} hidden={hid}>
          <Money name="cost" label="עלות ליחידה" agorot={cost?.base_cost_agorot} optional />
          <Text name="cost_note" label="הערה" defaultValue={cost?.note} max={500} />
          {margin !== null && <p className="muted">רווח גולמי ליחידה במחיר הרגיל: <span className="ltr">{formatILS(margin)}</span></p>}
        </AdminForm>
      </section>

      <section className="admin-card" id="images">
        <h2>תמונות</h2>
        <ImageManager table="products" id={id} images={p.images ?? []} folder="products" label={p.name}
          actions={{ add: A.addImage, remove: A.removeImage, move: A.moveImage }} />
      </section>

      <section className="admin-card" id="options">
        <h2>מסלולי עיצוב</h2>
        <p className="muted">למשל &quot;תמונה וכיתוב&quot; או &quot;שם וצורות&quot;. הלקוח בוחר מסלול, ורואה רק את השדות של המסלול. בלי מסלולים: כל השדות מוצגים.</p>
        {(options ?? []).map((o) => (
          <div key={o.id} className="sub-card">
            <AdminForm action={A.saveOption} hidden={{ product_id: id, id: o.id }}>
              <div className="grid-2">
                <Text name="label" label="שם המסלול" defaultValue={o.label} required />
                <Text name="key" label="מפתח" defaultValue={o.key} ltr required />
                <Text name="help_text" label="הסבר קצר" defaultValue={o.help_text} max={300} />
                <Num name="sort_order" label="סדר" defaultValue={o.sort_order} />
              </div>
            </AdminForm>
            <AdminForm action={A.deleteOption} hidden={{ id: o.id }} submit="מחיקת המסלול" danger confirm={`למחוק את המסלול "${o.label}"?`} className="inline" />
          </div>
        ))}
        <details className="add-new">
          <summary>+ מסלול חדש</summary>
          <AdminForm action={A.saveOption} hidden={{ product_id: id, id: "" }} submit="הוספת המסלול" resetOnSuccess>
            <div className="grid-2">
              <Text name="label" label="שם המסלול" required />
              <Text name="key" label="מפתח (באנגלית)" ltr required placeholder="photo_text" />
              <Text name="help_text" label="הסבר קצר" max={300} />
              <Num name="sort_order" label="סדר" defaultValue={nextSort(options)} />
            </div>
          </AdminForm>
        </details>
      </section>

      <section className="admin-card" id="fields">
        <h2>שדות התאמה</h2>
        {(fields ?? []).map((f) => (
          <details key={f.id} className="sub-card">
            <summary><strong>{f.label}</strong> <span className="muted">· {TYPE_LABELS[f.type] ?? f.type}{f.required ? " · חובה" : ""}
              {f.design_option_key ? ` · ${options?.find((o) => o.key === f.design_option_key)?.label ?? f.design_option_key}` : ""}</span></summary>
            {fieldForm(f)}
            <AdminForm action={A.deleteField} hidden={{ id: f.id }} submit="מחיקת השדה" danger confirm={`למחוק את השדה "${f.label}"?`} className="inline" />
          </details>
        ))}
        <details className="add-new">
          <summary>+ שדה חדש</summary>
          {fieldForm(null)}
        </details>
      </section>

      <section className="admin-card" id="designs">
        <h2>עיצובים קבועים לבחירה</h2>
        <p className="muted">מופיעים בשדה מסוג &quot;בחירת עיצוב קבוע&quot;.</p>
        {(designs ?? []).map((d) => (
          <div key={d.id} className="sub-card">
            <AdminForm action={A.saveDesign} hidden={{ product_id: id, id: d.id }}>
              <div className="grid-2">
                <Text name="name" label="שם העיצוב" defaultValue={d.name} required />
                <Num name="sort_order" label="סדר" defaultValue={d.sort_order} />
              </div>
              <ImagePick name="image_path" ownerId={id} initial={d.image_path} label="תמונת דוגמה" />
              <Check name="is_active" label="מוצג ללקוחות" defaultChecked={d.is_active} />
            </AdminForm>
            <AdminForm action={A.deleteDesign} hidden={{ id: d.id }} submit="מחיקת העיצוב" danger confirm={`למחוק את העיצוב "${d.name}"?`} className="inline" />
          </div>
        ))}
        <details className="add-new">
          <summary>+ עיצוב חדש</summary>
          <AdminForm action={A.saveDesign} hidden={{ product_id: id, id: "" }} submit="הוספת העיצוב" resetOnSuccess>
            <div className="grid-2">
              <Text name="name" label="שם העיצוב" required />
              <Num name="sort_order" label="סדר" defaultValue={nextSort(designs)} />
            </div>
            <ImagePick name="image_path" ownerId={id} initial={null} label="תמונת דוגמה" />
            <Check name="is_active" label="מוצג ללקוחות" defaultChecked />
          </AdminForm>
        </details>
      </section>

      <section className="admin-card danger-zone" id="delete">
        <h2>מחיקת המוצר</h2>
        <p className="muted">אפשר למחוק רק מוצר שלא הוזמן ולא נמצא במארז. אחרת מסתירים אותו (בטל את &quot;מוצג באתר&quot;).</p>
        <AdminForm action={A.deleteProduct} hidden={hid} submit="מחיקה לצמיתות" danger confirm={`למחוק את "${p.name}" לצמיתות?`} />
      </section>
    </>
  );
}
