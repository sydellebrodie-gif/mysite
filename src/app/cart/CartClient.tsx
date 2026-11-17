"use client";
import Link from "next/link";
import type { Catalog } from "@/lib/types";
import { cart, useCart } from "@/lib/cart";
import { computeQuote } from "@/lib/pricing";
import { formatILS } from "@/lib/format";
import LineSummary from "@/components/LineSummary";
import Totals from "@/components/Totals";

export default function CartClient({ catalog }: { catalog: Catalog }) {
  const state = useCart();
  if (!state) return <div className="container"><h1>סל קניות</h1><p className="muted">טוען…</p></div>;
  const { lines, delivery } = state;
  const productById = new Map(catalog.products.map((p) => [p.id, p]));
  const bundleById = new Map(catalog.bundles.map((b) => [b.id, b]));
  const q = computeQuote(lines, catalog, delivery);
  const s = catalog.settings;

  if (lines.length === 0) {
    return (
      <div className="container">
        <h1>סל קניות</h1>
        <p>הסל ריק.</p>
        <Link className="btn" href="/">לחנות</Link>
      </div>
    );
  }

  return (
    <div className="container cart-page">
      <h1>סל קניות</h1>
      <ul className="cart-lines">
        {lines.map((line) => {
          const ql = q.lines.find((x) => x.lineId === line.lineId);
          if (line.kind === "product") {
            const p = productById.get(line.productId);
            if (!p) return <li key={line.lineId} className="cart-line">מוצר שכבר לא קיים <button className="link-btn danger" onClick={() => cart.remove(line.lineId)}>הסרה</button></li>;
            return (
              <li key={line.lineId} className="cart-line">
                <div className="cart-line-head">
                  <strong>{p.name}</strong>
                  <span className="ltr">{formatILS(ql?.totalAgorot ?? 0)}</span>
                </div>
                <LineSummary product={p} custom={line.custom} />
                <div className="cart-line-actions">
                  <div className="stepper small">
                    <button type="button" onClick={() => cart.setQty(line.lineId, line.qty - 1)} aria-label="הפחתה">−</button>
                    <span className="ltr" aria-label="כמות">{line.qty}</span>
                    <button type="button" onClick={() => cart.setQty(line.lineId, line.qty + 1)} aria-label="הוספה">+</button>
                  </div>
                  <Link className="link-btn" href={`/products/${p.slug}?edit=${line.lineId}`}>עריכה</Link>
                  <button type="button" className="link-btn danger" onClick={() => cart.remove(line.lineId)}>הסרה</button>
                </div>
                {ql?.errors.map((e) => <p key={e} className="error">{e}</p>)}
              </li>
            );
          }
          const b = bundleById.get(line.bundleId);
          if (!b) return <li key={line.lineId} className="cart-line">מארז שכבר לא קיים <button className="link-btn danger" onClick={() => cart.remove(line.lineId)}>הסרה</button></li>;
          return (
            <li key={line.lineId} className="cart-line bundle">
              <div className="cart-line-head">
                <strong>מארז: {b.name}</strong>
                <span className="ltr">{formatILS(ql?.totalAgorot ?? 0)}</span>
              </div>
              <ol className="cart-children">
                {line.items.map((it, k) => {
                  const p = productById.get(it.productId);
                  return p ? <li key={k}><strong>{p.name}</strong><LineSummary product={p} custom={it.custom} /></li> : null;
                })}
              </ol>
              <div className="cart-line-actions">
                <Link className="link-btn" href={`/bundles/${b.slug}?edit=${line.lineId}`}>עריכת המארז</Link>
                <button type="button" className="link-btn danger" onClick={() => cart.remove(line.lineId)}>הסרה</button>
              </div>
              {ql?.errors.map((e) => <p key={e} className="error">{e}</p>)}
            </li>
          );
        })}
      </ul>

      <fieldset className="field delivery">
        <legend>מסירה</legend>
        {s.pickupEnabled && (
          <label className={`choice ${delivery === "pickup" ? "selected" : ""}`}>
            <input type="radio" name="delivery" checked={delivery === "pickup"} onChange={() => cart.setDelivery("pickup")} />
            <span>איסוף עצמי מ{s.pickupCity} (חינם)</span>
            <small>בתיאום מראש. עד {s.pickupBusinessDays} ימי עסקים להכנה. הכתובת המדויקת תישלח אחרי ההזמנה.</small>
          </label>
        )}
        {s.courierEnabled && (
          <label className={`choice ${delivery === "courier" ? "selected" : ""}`}>
            <input type="radio" name="delivery" checked={delivery === "courier"} onChange={() => cart.setDelivery("courier")} />
            <span>שליח עד הבית ({formatILS(s.courierFeeAgorot)})</span>
            <small>עד {s.courierBusinessDays} ימי עסקים, כולל ההכנה.</small>
          </label>
        )}
      </fieldset>

      <Totals q={q} deliveryChosen={!!delivery} />
      {q.errors.filter((e) => e !== "הסל ריק").map((e) => <p key={e} className="error">{e}</p>)}
      {q.lines.some((l) => l.awaitingImages) && (
        <p className="notice">בחלק מהפריטים סימנתם שתשלחו את התמונות אחרי התשלום. תקבלו קישור אישי להעלאה.</p>
      )}
      <div className="actions">
        {q.ok && delivery
          ? <Link className="btn" href="/checkout">להמשך ההזמנה</Link>
          : <button className="btn" disabled>{!delivery ? "יש לבחור אופן מסירה" : "יש לתקן את הפריטים המסומנים"}</button>}
        <Link className="btn secondary" href="/">להמשך קניות</Link>
      </div>
    </div>
  );
}
