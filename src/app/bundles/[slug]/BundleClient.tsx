"use client";
// מארז קבוע (תכולה קבועה, טופס לכל יחידה) ומארז בהרכבה חופשית (הלקוח בוחר פריטים).
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Bundle, CartBundleItem, Catalog, Product } from "@/lib/types";
import Gallery from "@/components/Gallery";
import CustomizeForm from "@/components/CustomizeForm";
import DeliveryInfo from "@/components/DeliveryInfo";
import { emptyCustomization, validateCustomization } from "@/lib/customization";
import { cart, newLineId } from "@/lib/cart";
import { formatILS } from "@/lib/format";
import { bundleStockLimit, computeQuote, expandFixedBundle, isPurchasable } from "@/lib/pricing";

export default function BundleClient({ bundle: b, catalog }: { bundle: Bundle; catalog: Catalog }) {
  const productById = useMemo(() => new Map(catalog.products.map((p) => [p.id, p])), [catalog]);
  const fixed = b.type === "fixed";
  const [items, setItems] = useState<CartBundleItem[]>(() =>
    fixed ? expandFixedBundle(b).map((productId) => ({ productId, custom: emptyCustomization(productById.get(productId)) })) : []);
  const [editId, setEditId] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [open, setOpen] = useState(0);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("edit");
    const line = id ? cart.find(id) : undefined;
    if (line && line.kind === "bundle" && line.bundleId === b.id) { setEditId(line.lineId); setItems(line.items); }
  }, [b.id]);

  const lineId = editId ?? "draft";
  const quote = computeQuote([{ lineId, kind: "bundle", bundleId: b.id, items }], catalog, null);
  const price = quote.totalAgorot;
  const errorsByItem = items.map((it) => validateCustomization(productById.get(it.productId)!, it.custom));
  const limit = fixed ? bundleStockLimit(b, catalog) : null;
  const soldOut = fixed && limit === 0;
  const totals = new Map<string, number>();
  items.forEach((it) => totals.set(it.productId, (totals.get(it.productId) ?? 0) + 1));
  const seen = new Map<string, number>();
  const labels = items.map((it) => {
    const k = (seen.get(it.productId) ?? 0) + 1; seen.set(it.productId, k);
    const p = productById.get(it.productId)!;
    const t = totals.get(it.productId)!;
    return t > 1 ? `${p.name} (${k} מתוך ${t})` : p.name;
  });

  const update = (i: number, patch: Partial<CartBundleItem>) =>
    setItems((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  function addProduct(p: Product) {
    setItems((xs) => [...xs, { productId: p.id, custom: emptyCustomization(p) }]);
    setOpen(items.length);
  }

  function submit() {
    const bad = errorsByItem.findIndex((e) => Object.keys(e).length > 0);
    const blocking = quote.lines[0]?.errors.length || quote.errors.some((e) => !e.includes("הסל ריק"));
    if (bad >= 0 || blocking || (!fixed && items.length < b.minItems)) {
      setShowErrors(true);
      if (bad >= 0) setOpen(bad);
      return;
    }
    cart.upsert({ lineId: editId ?? newLineId(), kind: "bundle", bundleId: b.id, items });
    if (editId) { window.location.href = "/cart"; return; }
    setAdded(true);
  }

  const choices = catalog.products.filter((p) => p.allowedInBundles);

  return (
    <div className="container product-page">
      <nav className="crumbs" aria-label="מיקום"><Link href="/">ראשי</Link> › <Link href="/#bundles">מארזים</Link></nav>
      <div className="product-layout">
        <div>
          {fixed && <Gallery images={b.images.map((src, i) => ({ src, alt: `${b.name}, תמונה ${i + 1}` }))} title={b.name} />}
          <h1>{b.name}</h1>
          <p>{b.description}</p>
          {fixed && quote.lines[0]?.regularAgorot !== undefined && (
            <p className="price big">
              {formatILS(b.priceAgorot ?? 0)}{" "}
              {quote.lines[0].regularAgorot! > (b.priceAgorot ?? 0) && <s className="muted">{formatILS(quote.lines[0].regularAgorot!)}</s>}
            </p>
          )}
          <DeliveryInfo s={catalog.settings} />
          {!fixed && (
            <div className="builder-pick">
              <h2 className="h-small">בחירת מוצרים</h2>
              <p className="muted">אפשר להוסיף את אותו מוצר כמה פעמים, כל אחד בעיצוב אחר. לפחות {b.minItems} פריטים.</p>
              <ul className="pick-list">
                {choices.map((p) => (
                  <li key={p.id}>
                    <span>{p.name} <span className="muted ltr">{formatILS(p.priceAgorot)}</span></span>
                    <button type="button" className="btn small secondary" disabled={!isPurchasable(p)} onClick={() => addProduct(p)}>
                      {isPurchasable(p) ? "הוספה" : p.isAvailable ? "אזל" : "בקרוב"}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div>
          {soldOut ? <p className="notice">המארז אזל מהמלאי כרגע.</p> : (
            <form onSubmit={(e) => { e.preventDefault(); submit(); }} noValidate>
              <h2 className="h-small">{fixed ? "עיצוב לכל פריט במארז" : `המארז שלכם (${items.length} פריטים)`}</h2>
              {!fixed && items.length === 0 && <p className="muted">עדיין לא נבחרו מוצרים.</p>}
              <ol className="bundle-items">
                {items.map((it, i) => {
                  const p = productById.get(it.productId)!;
                  const errs = errorsByItem[i];
                  const hasErr = showErrors && Object.keys(errs).length > 0;
                  const prevSame = items.slice(0, i).map((x, j) => ({ x, j })).reverse().find(({ x }) => x.productId === it.productId);
                  return (
                    <li key={i} className={`bundle-item ${hasErr ? "has-error" : ""}`}>
                      <button type="button" className="bundle-item-head" aria-expanded={open === i} onClick={() => setOpen(open === i ? -1 : i)}>
                        <span>{labels[i]}</span>
                        <span className={Object.keys(errs).length ? "status todo" : "status done"}>
                          {Object.keys(errs).length ? "להשלים" : "✓ מוכן"}
                        </span>
                      </button>
                      {open === i && (
                        <div className="bundle-item-body">
                          {prevSame && (
                            <button type="button" className="link-btn" onClick={() => update(i, { custom: structuredClone(prevSame.x.custom) })}>
                              העתקת העיצוב מהפריט הקודם
                            </button>
                          )}
                          <CustomizeForm product={p} value={it.custom} onChange={(c) => update(i, { custom: c })}
                            errors={errs} showErrors={showErrors} idPrefix={`b${i}`} />
                          {!fixed && (
                            <button type="button" className="link-btn danger" onClick={() => { setItems((xs) => xs.filter((_, j) => j !== i)); setOpen(-1); }}>
                              הסרה מהמארז
                            </button>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
              {showErrors && (quote.lines[0]?.errors.length || quote.errors.length) ? (
                <ul className="error" role="alert">
                  {[...(quote.lines[0]?.errors ?? []), ...quote.errors.filter((e) => !e.includes("הסל ריק"))].slice(0, 4).map((e) => <li key={e}>{e}</li>)}
                </ul>
              ) : null}
              <div className="sticky-total">
                <span>סה״כ למארז: <strong className="ltr">{formatILS(price)}</strong>
                  {quote.dealDiscountAgorot > 0 && <small> (כולל מבצע)</small>}</span>
                <button className="btn" type="submit" disabled={!fixed && items.length === 0}>
                  {editId ? "שמירת השינויים" : "הוספת המארז לסל"}
                </button>
              </div>
              {added && <p className="success" role="status">המארז נוסף לסל. <Link href="/cart">מעבר לסל</Link></p>}
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
