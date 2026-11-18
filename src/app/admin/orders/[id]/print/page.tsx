// דף ייצור להדפסה: כל מה שצריך כדי להכין את ההזמנה, בלי לשאול.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin/auth";
import { loadOrder, type LineView, type ProductDef } from "@/lib/admin/orders";
import { statusLabel } from "@/lib/order-format";
import PrintButton from "./PrintButton";

export const metadata: Metadata = { title: "דף ייצור", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
const dt = new Intl.DateTimeFormat("he-IL", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Jerusalem" });

function Item({ line, def, title }: { line: LineView; def?: ProductDef; title: string }) {
  const c = line.custom;
  const opt = def?.options.find((o) => o.key === c.option)?.label;
  const field = (k: string) => def?.fields.find((f) => f.key === k);
  return (
    <div className="print-item">
      <h3>{title}</h3>
      <table>
        <tbody>
          {opt && <tr><th>מסלול</th><td>{opt}</td></tr>}
          {Object.entries(c.values).map(([k, v]) => (
            <tr key={k}><th>{field(k)?.label ?? k}</th>
              <td className="print-text"><bdi>{field(k)?.type === "design" ? def?.designs.find((d) => d.id === v)?.name ?? v : v}</bdi></td></tr>
          ))}
          {c.note && <tr><th>הערה</th><td className="print-text"><bdi>{c.note}</bdi></td></tr>}
          {line.files.length > 0 && <tr><th>קבצים</th><td>{line.files.map((f) => (
            <div key={f.id} className="ltr">{f.downloadName}{f.status === "deleted" ? " (נמחק מהענן)" : ""}</div>))}</td></tr>}
          {line.awaitingUpload && <tr><th>שימו לב</th><td>ממתין לתמונה מהלקוח</td></tr>}
        </tbody>
      </table>
      {line.files.some((f) => f.previewUrl) && (
        <div className="print-thumbs">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {line.files.filter((f) => f.previewUrl).map((f) => <img key={f.id} src={f.previewUrl!} alt={f.downloadName} />)}
        </div>
      )}
    </div>
  );
}

export default async function PrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { sb } = await requireAdmin();
  const data = await loadOrder(sb, id);
  if (!data) notFound();
  const { order: o, lines, defs } = data;
  const addr = (o.delivery_address ?? {}) as Record<string, string>;
  return (
    <main className="print-page">
      <PrintButton />
      <h1>הזמנה {o.order_number}</h1>
      <p>{dt.format(new Date(o.created_at))} · {statusLabel(o.status)}{o.needs_attention ? " · נדרש בירור" : ""}</p>
      <p><strong>{o.customer_name}</strong> · <span className="ltr">{o.customer_phone}</span></p>
      <p>{o.delivery_method === "courier" ? `שליח: ${[addr.street, addr.house, addr.apartment && `דירה ${addr.apartment}`, addr.city].filter(Boolean).join(" ")}${addr.notes ? ` (${addr.notes})` : ""}` : "איסוף עצמי"}</p>
      {o.customer_note && <p>הערת הלקוח: <bdi>{o.customer_note}</bdi></p>}
      {o.internal_note && <p className="print-internal">הערה פנימית: <bdi>{o.internal_note}</bdi></p>}
      {lines.map((l) => l.kind === "bundle" ? (
        <section key={l.id} className="print-bundle">
          <h2>מארז: {l.name} <small>(מספר {l.position.replace("מארז", "")})</small></h2>
          {l.children.map((c, k) => <Item key={c.id} line={c} def={defs.get(c.productId ?? "")} title={`${k + 1}. ${c.name}`} />)}
        </section>
      ) : (
        <Item key={l.id} line={l} def={defs.get(l.productId ?? "")} title={`${l.position}. ${l.name}${l.quantity > 1 ? ` × ${l.quantity}` : ""}`} />
      ))}
    </main>
  );
}
