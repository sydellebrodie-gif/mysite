"use client";
// מארז קבוע (תכולה קבועה, טופס לכל יחידה) ומארז בהרכבה חופשית (הלקוח בוחר פריטים).
import Link from "next/link";
import { Fragment, useEffect, useMemo, useState } from "react";
import type { Bundle, Catalog, Product } from "@/lib/types";
import { type DesignGroup, fromGroups, toGroups } from "@/lib/bundle-designs";
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
  // מצב הטופס: קבוצות עיצוב. ברוב המארזים כל קבוצה היא יחידה אחת; בפריט עם "עד N עיצובים" קבוצה מכסה כמה יחידות.
  const [groups, setGroups] = useState<DesignGroup[]>(() => toGroups(b,
    fixed ? expandFixedBundle(b).map((productId) => ({ productId, custom: emptyCustomization(productById.get(productId)) })) : []));
  const items = useMemo(() => fromGroups(groups), [groups]);
  const [editId, setEditId] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [open, setOpen] = useState(0);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("edit");
    const line = id ? cart.find(id) : undefined;
    if (line && line.kind === "bundle" && line.bundleId === b.id) { setEditId(line.lineId); setGroups(toGroups(b, line.items)); }
  }, [b]);

  const lineId = editId ?? "draft";
  const quote = computeQuote([{ lineId, kind: "bundle", bundleId: b.id, items }], catalog, null);
  const price = quote.totalAgorot;
  const errorsByItem = groups.map((g) => validateCustomization(productById.get(g.productId)!, g.custom));
  const limit = fixed ? bundleStockLimit(b, catalog) : null;
  const soldOut = fixed && limit === 0;
  const totals = new Map<string, number>();
  groups.forEach((g) => { if (!g.shared) totals.set(g.productId, (totals.get(g.productId) ?? 0) + 1); });
  const seen = new Map<string, number>();
  const labels = groups.map((g) => {
    const key = g.shared ? `d${g.def}` : g.productId;
    const k = (seen.get(key) ?? 0) + 1; seen.set(key, k);
    const p = productById.get(g.productId)!;
    if (g.shared) return `עיצוב ${k} · ${g.count === 1 ? "יחידה אחת" : `${g.count} יחידות`}`;
    const t = totals.get(g.productId)!;
    return t > 1 ? `${p.name} (${k} מתוך ${t})` : p.name;
  });

  const update = (i: number, patch: Partial<DesignGroup>) =>
    setGroups((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  /** בפריט עם עיצובים משותפים: מעבירים יחידה אחת מקבוצה לקבוצה, כך שהסך נשאר קבוע */
  function moveUnit(from: number, to: number) {
    setGroups((xs) => xs.map((x, j) => (j === from ? { ...x, count: x.count - 1 } : j === to ? { ...x, count: x.count + 1 } : x)));
  }
  /** הקבוצה הגדולה ביותר של אותו פריט (חוץ מ־except) שאפשר לקחת ממנה יחידה; ‎-1 אם אין */
  const donor = (def: number, except = -1) => {
    let best = -1;
    groups.forEach((g, j) => {
      if (j !== except && g.def === def && g.count > 1 && (best < 0 || g.count > groups[best].count)) best = j;
    });
    return best;
  };
  function addDesign(def: number) {
    const from = donor(def);
    if (from < 0) return;
    const idx = groups.map((g, j) => ({ g, j })).filter(({ g }) => g.def === def);
    const last = idx[idx.length - 1].j;
    const p = productById.get(groups[last].productId);
    setGroups((xs) => {
      const ys = xs.map((x, j) => (j === from ? { ...x, count: x.count - 1 } : x));
      ys.splice(last + 1, 0, { productId: xs[last].productId, custom: emptyCustomization(p), count: 1, def, shared: true });
      return ys;
    });
    setOpen(last + 1);
  }
  function removeDesign(i: number) {
    const same = groups.map((g, j) => ({ g, j })).filter(({ g, j }) => j !== i && g.def === groups[i].def);
    const to = [...same].reverse().find(({ j }) => j < i) ?? same[0];
    if (!to) return;
    setGroups((xs) => xs.flatMap((x, j) => (j === i ? [] : j === to.j ? [{ ...x, count: x.count + xs[i].count }] : [x])));
    setOpen(-1);
  }

  function addProduct(p: Product) {
    setGroups((xs) => [...xs, { productId: p.id, custom: emptyCustomization(p), count: 1, def: -1, shared: false }]);
    setOpen(groups.length);
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
              {catalog.settings.bundlePackagingAgorot > 0 && <small className="muted"> + אריזה {formatILS(catalog.settings.bundlePackagingAgorot)}</small>}
            </p>
          )}
          <DeliveryInfo s={catalog.settings} />
          {!fixed && (
            <div className="builder-pick">
              <h2 className="h-small">בחירת מוצרים</h2>
              <p className="muted">אפשר להוסיף את אותו מוצר כמה פעמים, כל אחד בעיצוב אחר. לפחות {b.minItems} פריטים.
                {catalog.settings.bundlePackagingAgorot > 0 && <> המחיר הוא סכום המוצרים, ועוד אריזה {formatILS(catalog.settings.bundlePackagingAgorot)}.</>}</p>
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
                {groups.map((it, i) => {
                  const p = productById.get(it.productId)!;
                  const errs = errorsByItem[i];
                  const hasErr = showErrors && Object.keys(errs).length > 0;
                  const prevSame = it.shared ? undefined
                    : groups.slice(0, i).map((x, j) => ({ x, j })).reverse().find(({ x }) => x.productId === it.productId);
                  const d = it.shared ? b.items[it.def] : undefined;
                  const defGroups = d ? groups.filter((g) => g.def === it.def) : [];
                  const lastOfDef = d && groups[i + 1]?.def !== it.def;
                  return (
                    <Fragment key={i}>
                    {d && groups[i - 1]?.def !== it.def && (
                      <li className="designs-note muted">
                        {d.qty} יחידות של {p.name}, בעד {d.maxDesigns} עיצובים שונים. אפשר עיצוב אחד לכולן,
                        או להוסיף עיצובים ולבחור כמה יחידות מכל אחד.
                      </li>
                    )}
                    <li className={`bundle-item ${hasErr ? "has-error" : ""}`}>
                      <button type="button" className="bundle-item-head" aria-expanded={open === i} onClick={() => setOpen(open === i ? -1 : i)}>
                        <span>{labels[i]}</span>
                        <span className={Object.keys(errs).length ? "status todo" : "status done"}>
                          {Object.keys(errs).length ? "להשלים" : "✓ מוכן"}
                        </span>
                      </button>
                      {open === i && (
                        <div className="bundle-item-body">
                          {d && (
                            <div className="design-count">
                              <span id={`dc${i}`}>כמה יחידות בעיצוב הזה</span>
                              <div className="stepper" role="group" aria-labelledby={`dc${i}`}>
                                <button type="button" aria-label="פחות" disabled={it.count <= 1 || defGroups.length < 2}
                                  onClick={() => moveUnit(i, groups.findIndex((g, j) => j !== i && g.def === it.def))}>−</button>
                                <output className="ltr" aria-live="polite">{it.count}</output>
                                <button type="button" aria-label="יותר" disabled={donor(it.def, i) < 0}
                                  onClick={() => moveUnit(donor(it.def, i), i)}>+</button>
                              </div>
                            </div>
                          )}
                          {prevSame && (
                            <button type="button" className="link-btn" onClick={() => update(i, { custom: structuredClone(prevSame.x.custom) })}>
                              העתקת העיצוב מהפריט הקודם
                            </button>
                          )}
                          <CustomizeForm product={p} value={it.custom} onChange={(c) => update(i, { custom: c })}
                            errors={errs} showErrors={showErrors} idPrefix={`b${i}`} />
                          {!fixed && (
                            <button type="button" className="link-btn danger" onClick={() => { setGroups((xs) => xs.filter((_, j) => j !== i)); setOpen(-1); }}>
                              הסרה מהמארז
                            </button>
                          )}
                          {d && defGroups.length > 1 && (
                            <button type="button" className="link-btn danger" onClick={() => removeDesign(i)}>
                              הסרת העיצוב (היחידות עוברות לעיצוב אחר)
                            </button>
                          )}
                        </div>
                      )}
                    </li>
                    {d && lastOfDef && (
                      <li>
                        <button type="button" className="btn small secondary"
                          disabled={defGroups.length >= (d.maxDesigns ?? 1) || donor(it.def) < 0}
                          onClick={() => addDesign(it.def)}>
                          + עיצוב נוסף ({defGroups.length} מתוך עד {d.maxDesigns})
                        </button>
                      </li>
                    )}
                    </Fragment>
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
                  <small> ({[quote.packagingAgorot > 0 && "כולל אריזה", quote.dealDiscountAgorot > 0 && "כולל מבצע"].filter(Boolean).join(", ")})</small></span>
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
