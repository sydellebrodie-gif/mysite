"use client";
import Link from "next/link";
import { useState } from "react";
import type { CartLine, Catalog } from "@/lib/types";
import { useCart } from "@/lib/cart";
import { computeQuote } from "@/lib/pricing";
import { emptyCustomer, validateCustomer, type CheckoutCustomer } from "@/lib/checkout-input";
import { formatILS } from "@/lib/format";
import Totals from "@/components/Totals";

// התמונות הממוזערות נשארות בדפדפן ולא נשלחות לשרת
const stripThumbs = (lines: CartLine[]): CartLine[] => JSON.parse(JSON.stringify(lines, (k, v) => (k === "thumb" ? "" : v)));

export default function CheckoutClient({ catalog }: { catalog: Catalog }) {
  const state = useCart();
  const [c, setC] = useState<CheckoutCustomer>(emptyCustomer);
  const [agreed, setAgreed] = useState(false);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ kind: "demo" | "error"; text: string } | null>(null);

  if (!state) return <div className="container"><p className="muted">טוען…</p></div>;
  const { lines, delivery } = state;
  const q = computeQuote(lines, catalog, delivery);
  const errors = validateCustomer(c, delivery, agreed);
  const set = (k: keyof CheckoutCustomer) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setC({ ...c, [k]: e.target.value });
  const err = (k: string) => (show && errors[k] ? <p className="error" id={`${k}-err`}>{errors[k]}</p> : null);

  if (!lines.length) return <div className="container"><h1>סיום הזמנה</h1><p>הסל ריק.</p><Link className="btn" href="/">לחנות</Link></div>;
  if (!q.ok || !delivery) return <div className="container"><h1>סיום הזמנה</h1><p>יש להשלים פרטים בסל.</p><Link className="btn" href="/cart">חזרה לסל</Link></div>;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setShow(true); setResult(null);
    if (Object.keys(errors).length) return;
    setBusy(true);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ lines: stripThumbs(lines), delivery, customer: c, agreed }),
      });
      const data = await res.json();
      if (data.status === "demo") setResult({ kind: "demo", text: `מצב הדגמה: המחיר אומת בשרת (${formatILS(data.totalAgorot)}). לא בוצע תשלום ולא נוצרה הזמנה, כי הסליקה עדיין לא חוברה.` });
      else setResult({ kind: "error", text: [data.error, ...(data.quoteErrors ?? [])].filter(Boolean).join(" · ") || "משהו השתבש. נסו שוב" });
    } catch {
      setResult({ kind: "error", text: "אין חיבור לשרת. הסל שמור, נסו שוב בעוד רגע." });
    } finally { setBusy(false); }
  }

  const field = (k: keyof CheckoutCustomer, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div className="field">
      <label htmlFor={k}>{label}</label>
      <input id={k} value={c[k]} onChange={set(k)} aria-invalid={show && !!errors[k]} aria-describedby={show && errors[k] ? `${k}-err` : undefined} {...props} />
      {err(k)}
    </div>
  );

  return (
    <div className="container checkout-page">
      <h1>סיום הזמנה</h1>
      <div className="product-layout">
        <form onSubmit={submit} noValidate>
          <h2 className="h-small">פרטים ליצירת קשר</h2>
          {field("name", "שם מלא *", { autoComplete: "name" })}
          {field("phone", "טלפון *", { type: "tel", inputMode: "tel", autoComplete: "tel", dir: "ltr" })}
          {field("email", "מייל (לאישור ההזמנה) *", { type: "email", inputMode: "email", autoComplete: "email", dir: "ltr" })}
          {delivery === "courier" && (
            <>
              <h2 className="h-small">כתובת למשלוח</h2>
              {field("city", "עיר *", { autoComplete: "address-level2" })}
              {field("street", "רחוב ומספר בית *", { autoComplete: "street-address" })}
              {field("addressNotes", "קומה, דירה, קוד כניסה (רשות)")}
            </>
          )}
          <div className="field">
            <label htmlFor="note">הערה להזמנה (רשות)</label>
            <textarea id="note" rows={2} value={c.note} onChange={set("note")} maxLength={500} />
          </div>
          <label className="check">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
            <span>אני מאשר/ת שיש לי זכות להשתמש בתמונות ששלחתי, ושהן ישמשו להכנת ההזמנה בלבד, ואת תנאי השימוש ומדיניות הפרטיות.</span>
          </label>
          {err("agreed")}
          <button className="btn wide" type="submit" disabled={busy}>{busy ? "בודקת…" : `לתשלום · ${formatILS(q.totalAgorot)}`}</button>
          {result && <p className={result.kind === "demo" ? "notice" : "error"} role="status">{result.text}</p>}
        </form>
        <aside>
          <h2 className="h-small">סיכום</h2>
          <ul className="summary-lines">
            {q.lines.map((l) => (
              <li key={l.lineId}>
                <span>{l.kind === "bundle" ? `מארז: ${l.name}` : l.name}{l.qty > 1 && <span className="ltr"> ×{l.qty}</span>}</span>
                <span className="ltr">{formatILS(l.totalAgorot)}</span>
              </li>
            ))}
          </ul>
          <Totals q={q} deliveryChosen />
          <p className="muted">
            {delivery === "pickup"
              ? `איסוף עצמי מ${catalog.settings.pickupCity}, עד ${catalog.settings.pickupBusinessDays} ימי עסקים להכנה.`
              : `משלוח עם שליח, עד ${catalog.settings.courierBusinessDays} ימי עסקים כולל ההכנה.`}
            {" "}הספירה מתחילה מקבלת התמונות.
          </p>
          <Link href="/cart" className="link-btn">חזרה לסל לעריכה</Link>
        </aside>
      </div>
    </div>
  );
}
