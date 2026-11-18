import Link from "next/link";
import { notFound } from "next/navigation";
import AdminForm from "@/components/admin/AdminForm";
import { AttachFile, DownloadAll, FileThumb, type ClientFile } from "@/components/admin/OrderFiles";
import { Area, Check, Select, Text } from "@/components/admin/fields";
import { requireAdmin } from "@/lib/admin/auth";
import { allFiles, loadOrder, type LineView, type ProductDef } from "@/lib/admin/orders";
import { formatILS } from "@/lib/format";
import { ORDER_STATUSES, statusLabel } from "@/lib/order-format";
import * as A from "../../../actions/orders";

const dt = new Intl.DateTimeFormat("he-IL", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Jerusalem" });
const toClient = (f: LineView["files"][number]): ClientFile => ({
  id: f.id, mime: f.mime, previewUrl: f.previewUrl, downloadName: f.downloadName, downloaded: !!f.downloadedAt, width: f.width, height: f.height,
});

function LineEditor({ line, def, orderId }: { line: LineView; def?: ProductDef; orderId: string }) {
  const c = line.custom;
  const active = (def?.fields ?? []).filter((f) => !f.design_option_key || f.design_option_key === c.option);
  const textFields = active.filter((f) => f.type !== "image");
  const imageFields = (def?.fields ?? []).filter((f) => f.type === "image" && (!f.design_option_key || f.design_option_key === c.option));
  const known = new Set((def?.fields ?? []).map((f) => f.key));
  const extraValues = Object.entries(c.values).filter(([k]) => !known.has(k));
  const live = line.files.filter((f) => f.status !== "deleted");
  return (
    <div className="line-editor">
      {live.length > 0 && (
        <ul className="file-grid">{live.map((f) => <FileThumb key={f.id} f={toClient(f)} lineId={line.id} remove={A.removeFile} />)}</ul>
      )}
      {line.files.some((f) => f.status === "deleted") && <p className="muted">חלק מהקבצים כבר נמחקו מהענן.</p>}
      {imageFields.length > 0 && (
        <AttachFile orderId={orderId} lineId={line.id} fields={imageFields.map((f) => ({ key: f.key, label: f.label }))} attach={A.attachFile} />
      )}
      <details className="edit-line">
        <summary>עריכת ההתאמה של הפריט</summary>
        <AdminForm action={A.saveLine} hidden={{ line_id: line.id }} submit="שמירת הפריט">
          {def && def.options.length > 0 && (
            <Select name="option" label="מסלול עיצוב" defaultValue={c.option ?? ""}
              options={[{ value: "", label: "לא נבחר" }, ...def.options.map((o) => ({ value: o.key, label: o.label }))]} />
          )}
          {textFields.map((f) => f.type === "design" ? (
            <Select key={f.key} name={`v_${f.key}`} label={f.label} defaultValue={c.values[f.key] ?? ""}
              options={[{ value: "", label: "—" }, ...(def?.designs ?? []).map((d) => ({ value: d.id, label: d.name }))]} />
          ) : f.type === "select" ? (
            <Select key={f.key} name={`v_${f.key}`} label={f.label} defaultValue={c.values[f.key] ?? ""}
              options={[{ value: "", label: "—" }, ...f.options.map((o) => ({ value: o, label: o }))]} />
          ) : f.type === "textarea" ? (
            <Area key={f.key} name={`v_${f.key}`} label={f.label} defaultValue={c.values[f.key]} rows={2} />
          ) : (
            <Text key={f.key} name={`v_${f.key}`} label={f.label} defaultValue={c.values[f.key]} max={2000} />
          ))}
          {extraValues.map(([k, v]) => <Text key={k} name={`v_${k}`} label={`${k} (שדה שכבר לא קיים במוצר)`} defaultValue={v} max={2000} />)}
          <Area name="note" label="הערת הלקוח לעיצוב" defaultValue={c.note} rows={2} />
          <Check name="awaiting_upload" label="ממתין לתמונה מהלקוח" defaultChecked={line.awaitingUpload} />
        </AdminForm>
      </details>
    </div>
  );
}

function LineSummaryView({ line, def }: { line: LineView; def?: ProductDef }) {
  const c = line.custom;
  const opt = def?.options.find((o) => o.key === c.option)?.label;
  const label = (k: string) => def?.fields.find((f) => f.key === k)?.label ?? k;
  const val = (k: string, v: string) => def?.fields.find((f) => f.key === k)?.type === "design" ? def?.designs.find((d) => d.id === v)?.name ?? v : v;
  return (
    <ul className="custom-summary">
      {opt && <li><span className="muted">מסלול:</span> {opt}</li>}
      {Object.entries(c.values).map(([k, v]) => <li key={k}><span className="muted">{label(k)}:</span> <bdi>{val(k, v)}</bdi></li>)}
      {c.note && <li><span className="muted">הערה:</span> <bdi>{c.note}</bdi></li>}
      {line.awaitingUpload && <li className="warn">ממתין לתמונה מהלקוח{c.sendLater ? " (בחר לשלוח אחר כך)" : ""}</li>}
    </ul>
  );
}

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { sb } = await requireAdmin();
  const data = await loadOrder(sb, id);
  if (!data) notFound();
  const { order: o, lines, history, defs } = data;
  const files = allFiles(lines).filter((f) => f.status !== "deleted");
  const addr = (o.delivery_address ?? {}) as Record<string, string>;
  const hid = { id };

  return (
    <>
      <nav className="crumbs"><Link href="/admin">הזמנות</Link> › {o.order_number}</nav>
      <div className="admin-head">
        <h1>הזמנה {o.order_number} <span className={`badge st-${o.status}`}>{statusLabel(o.status)}</span></h1>
        <Link className="btn small secondary" href={`/admin/orders/${id}/print`} target="_blank">דף ייצור להדפסה</Link>
      </div>
      <p className="muted">התקבלה {dt.format(new Date(o.created_at))} · שולם <span className="ltr">{formatILS(o.total_agorot)}</span> · {o.delivery_method === "courier" ? "שליח" : "איסוף עצמי"}
        {o.receipt_url && <> · <a href={o.receipt_url} target="_blank" rel="noreferrer">קבלה</a></>}</p>
      <p className="muted">כל חלק בעמוד נשמר בנפרד.</p>

      <div className="admin-cols">
        <section className="admin-card">
          <h2>סטטוס</h2>
          <AdminForm action={A.saveStatus} hidden={hid} submit="עדכון סטטוס">
            <Select name="status" label="סטטוס ההזמנה" defaultValue={o.status} options={ORDER_STATUSES.map((s) => ({ value: s.value, label: s.label }))} />
          </AdminForm>
          {history.length > 0 && (
            <details><summary>היסטוריה</summary>
              <ul className="history">{history.map((h: { id: number; at: string; to_status: string }) => (
                <li key={h.id}><span className="ltr">{dt.format(new Date(h.at))}</span> · {statusLabel(h.to_status)}</li>))}</ul>
            </details>
          )}
        </section>

        <section className="admin-card">
          <h2>מעקב פנימי</h2>
          <AdminForm action={A.saveTracking} hidden={hid}>
            <Check name="needs_attention" label="נדרש בירור" defaultChecked={o.needs_attention} />
            <Check name="awaiting_materials" label="ממתינה לחומרים מהלקוח" defaultChecked={o.awaiting_materials} />
            <Area name="internal_note" label="הערה פנימית (הלקוח לא רואה)" defaultValue={o.internal_note} rows={3} max={4000} />
          </AdminForm>
        </section>

        <section className="admin-card">
          <h2>פרטי לקוח</h2>
          <AdminForm action={A.saveCustomer} hidden={hid}>
            <Text name="customer_name" label="שם" defaultValue={o.customer_name} required max={120} />
            <Text name="customer_phone" label="טלפון" defaultValue={o.customer_phone} required ltr max={30} />
            <Text name="customer_email" label="מייל" defaultValue={o.customer_email} required ltr />
            <Area name="customer_note" label="הערת הלקוח להזמנה" defaultValue={o.customer_note} rows={2} />
          </AdminForm>
          <p className="row-actions">
            <a href={`tel:${o.customer_phone}`}>חיוג</a>
            <a href={`https://wa.me/${String(o.customer_phone).replace(/\D/g, "").replace(/^0/, "972")}`} target="_blank" rel="noreferrer">וואטסאפ</a>
            <a href={`mailto:${o.customer_email}`}>מייל</a>
          </p>
        </section>

        <section className="admin-card">
          <h2>מסירה</h2>
          <AdminForm action={A.saveDelivery} hidden={hid}>
            <Select name="delivery_method" label="דרך מסירה" defaultValue={o.delivery_method}
              options={[{ value: "pickup", label: "איסוף עצמי" }, { value: "courier", label: "שליח" }]} />
            <div className="grid-2">
              <Text name="city" label="עיר" defaultValue={addr.city} />
              <Text name="street" label="רחוב" defaultValue={addr.street} />
              <Text name="house" label="מספר בית" defaultValue={addr.house} max={10} />
              <Text name="apartment" label="דירה/כניסה" defaultValue={addr.apartment} max={20} />
            </div>
            <Text name="address_notes" label="הערות לשליח" defaultValue={addr.notes} max={300} />
            <small className="muted">הכתובת נדרשת רק למשלוח. שינוי דרך המסירה לא משנה את הסכום ששולם ({o.delivery_fee_agorot ? formatILS(o.delivery_fee_agorot) : "בלי דמי משלוח"}).</small>
          </AdminForm>
        </section>
      </div>

      <section className="admin-card">
        <div className="admin-head">
          <h2>פריטים</h2>
          {files.length > 0 && <DownloadAll files={files.map(toClient)} />}
        </div>
        <ol className="order-lines">
          {lines.map((l) => (
            <li key={l.id} className="order-line">
              <div className="order-line-head">
                <strong>{l.kind === "bundle" ? `מארז: ${l.name}` : l.name}{l.quantity > 1 && ` × ${l.quantity}`}</strong>
                <span className="ltr">{formatILS(l.lineTotal)}</span>
              </div>
              {l.kind === "product" && (<>
                <LineSummaryView line={l} def={defs.get(l.productId ?? "")} />
                <LineEditor line={l} def={defs.get(l.productId ?? "")} orderId={id} />
              </>)}
              {l.children.length > 0 && (
                <ol className="bundle-children">
                  {l.children.map((c, k) => (
                    <li key={c.id}>
                      <strong>{k + 1}. {c.name}</strong>
                      <LineSummaryView line={c} def={defs.get(c.productId ?? "")} />
                      <LineEditor line={c} def={defs.get(c.productId ?? "")} orderId={id} />
                    </li>
                  ))}
                </ol>
              )}
            </li>
          ))}
        </ol>
        <dl className="totals">
          <div><dt>מוצרים ומארזים</dt><dd className="ltr">{formatILS(o.items_total_agorot)}</dd></div>
          {o.discount_agorot > 0 && <div><dt>הנחות</dt><dd className="ltr">−{formatILS(o.discount_agorot)}</dd></div>}
          {o.packaging_total_agorot > 0 && <div><dt>אריזה</dt><dd className="ltr">{formatILS(o.packaging_total_agorot)}</dd></div>}
          <div><dt>משלוח</dt><dd className="ltr">{o.delivery_fee_agorot ? formatILS(o.delivery_fee_agorot) : "—"}</dd></div>
          <div className="grand"><dt>שולם</dt><dd className="ltr">{formatILS(o.total_agorot)}</dd></div>
        </dl>
        <p className="muted">הסכומים תואמים לתשלום ולקבלה, ולכן לא נערכים כאן. החזר כספי נעשה במערכת הסליקה.</p>
      </section>

      <section className="admin-card danger-zone">
        <h2>מחיקת הקבצים מהענן</h2>
        <p className="muted">אחרי שכל הקבצים הורדו ונשמרו במחשב, מוחקים אותם מהענן (המקור והתצוגה). נשאר רק תיעוד שהיו. הדפסה חוזרת תהיה אפשרית רק מהקובץ שבמחשב.</p>
        {files.length ? (
          <AdminForm action={A.deleteOrderFiles} hidden={hid} submit={`מחיקת ${files.length} קבצים מהענן`} danger confirm="למחוק את כל קבצי ההזמנה מהענן? אי אפשר לבטל">
            <Check name="confirm" label="הורדתי ושמרתי את כל הקבצים במחשב" />
          </AdminForm>
        ) : <p>אין קבצים בענן להזמנה הזו.</p>}
      </section>
    </>
  );
}
