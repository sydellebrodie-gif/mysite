"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Catalog, Customization, Product } from "@/lib/types";
import Gallery from "@/components/Gallery";
import CustomizeForm from "@/components/CustomizeForm";
import DeliveryInfo from "@/components/DeliveryInfo";
import { emptyCustomization, validateCustomization } from "@/lib/customization";
import { cart, newLineId } from "@/lib/cart";
import { formatILS } from "@/lib/format";
import { isPurchasable } from "@/lib/pricing";

export default function ProductClient({ product: p, catalog }: { product: Product; catalog: Catalog }) {
  const [custom, setCustom] = useState<Customization>(() => emptyCustomization(p));
  const [qty, setQty] = useState(1);
  const [editId, setEditId] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [added, setAdded] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);

  // עריכה מהסל: ‎?edit=<lineId>‎ טוען את מה שכבר הוזן
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("edit");
    const line = id ? cart.find(id) : undefined;
    if (line && line.kind === "product" && line.productId === p.id) {
      setEditId(line.lineId); setCustom(line.custom); setQty(line.qty);
    }
  }, [p.id]);

  const errors = useMemo(() => validateCustomization(p, custom), [p, custom]);
  const can = isPurchasable(p);
  const maxQty = p.stockMode === "counted" ? Math.max(1, p.stockQty ?? 1) : 99;
  const gallery = [
    ...p.images.map((src, i) => ({ src, alt: `${p.name}, תמונה ${i + 1}` })),
    ...p.designs.filter((d) => d.image).map((d) => ({ src: d.image!, alt: d.name, caption: `עיצוב: ${d.name}` })),
  ];

  function submit(another: boolean) {
    if (Object.keys(errors).length) {
      setShowErrors(true);
      requestAnimationFrame(() => document.querySelector<HTMLElement>(".customize .error")?.scrollIntoView({ block: "center", behavior: "smooth" }));
      return;
    }
    cart.upsert({ lineId: editId ?? newLineId(), kind: "product", productId: p.id, qty, custom });
    if (editId) { window.location.href = "/cart"; return; }
    setShowErrors(false);
    if (another) {
      setCustom(emptyCustomization(p)); setQty(1); setFormKey((k) => k + 1);
      setAdded("נוסף לסל. אפשר לעצב עכשיו עוד אחד.");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else setAdded("נוסף לסל.");
  }

  return (
    <div className="container product-page">
      <nav className="crumbs" aria-label="מיקום"><Link href="/">ראשי</Link> › <Link href="/#products">מוצרים</Link></nav>
      <div className="product-layout">
        <Gallery images={gallery} title={p.name} />
        <div>
          <h1>{p.name}</h1>
          <p className="price big">{formatILS(p.priceAgorot)}</p>
          {p.deal && <p className="tag">מבצע: {p.deal.qty} ב־{formatILS(p.deal.priceAgorot)} (גם בעיצובים שונים)</p>}
          <p>{p.description}</p>
          <DeliveryInfo s={catalog.settings} />
          {p.stockMode === "counted" && can && (p.stockQty ?? 0) <= 3 && <p className="warn">נשארו {p.stockQty} במלאי</p>}

          {!can ? (
            <p className="notice">{p.isAvailable ? "המוצר אזל מהמלאי כרגע." : "המוצר יגיע בקרוב."}</p>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); submit(false); }} noValidate>
              <h2 className="h-small">העיצוב שלכם</h2>
              <CustomizeForm key={formKey} product={p} value={custom} onChange={setCustom} errors={errors}
                showErrors={showErrors} idPrefix="p" />
              <div className="field qty">
                <label htmlFor="qty">כמות (באותו עיצוב בדיוק)</label>
                <div className="stepper">
                  <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="הפחתה">−</button>
                  <input id="qty" type="number" inputMode="numeric" min={1} max={maxQty} value={qty}
                    onChange={(e) => setQty(Math.max(1, Math.min(maxQty, Number(e.target.value) || 1)))} />
                  <button type="button" onClick={() => setQty((q) => Math.min(maxQty, q + 1))} aria-label="הוספה">+</button>
                </div>
              </div>
              {showErrors && Object.keys(errors).length > 0 && <p className="error" role="alert">יש להשלים את השדות המסומנים</p>}
              <div className="actions">
                <button className="btn" type="submit">{editId ? "שמירת השינויים" : `הוספה לסל · ${formatILS(p.priceAgorot * qty)}`}</button>
                {!editId && <button className="btn secondary" type="button" onClick={() => submit(true)}>הוספה לסל ועוד אחד בעיצוב אחר</button>}
              </div>
              {added && <p className="success" role="status">{added} <Link href="/cart">מעבר לסל</Link></p>}
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
