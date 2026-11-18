// חישוב מחיר ובדיקת זמינות לסל. פונקציה טהורה: רצה בדפדפן לתצוגה, ובשרת שוב לפני תשלום (השרת קובע).
//
// כללים (docs/decisions.md):
// * מארז קבוע: המחיר המאושר של המארז. מבצעים לא חלים על פריטים בתוך מארז קבוע.
// * מארז בהרכבה חופשית: סכום המחירים הרגילים של הפריטים.
// * אריזה: תוספת קבועה לכל מארז (קבוע או חופשי), מוצגת כשורה נפרדת (הגדרות: bundlePackagingAgorot).
// * מבצעי כמות קיימים (2 דפי מדבקות ב־25, 3 תחתיות ב־65) נספרים על כל היחידות של אותו מוצר
//   מחוץ למארזים קבועים, גם בשורות נפרדות עם עיצובים שונים וגם בתוך מארז חופשי.
// * הנחת כמות: 10% מ־3 מוצרים ומעלה (הגדרות). נספרות כל היחידות מחוץ למארזים קבועים
//   (שורות נפרדות ופריטים במארז חופשי), וההנחה חלה עליהן.
// * אין כפל הנחות: לכל מוצר נבחרת ההנחה הטובה יותר ללקוח, מבצע הכמות שלו או הנחת הכמות.
// * מלאי משותף: כל יחידה, לבד או במארז, יורדת מאותו מלאי.

import { designLimitErrors } from "./bundle-designs.ts";
import type { Bundle, CartLine, Catalog, DeliveryMethod, Product } from "./types";
import { validateCustomization, missingImages } from "./customization.ts";

export interface QuoteChild {
  productId: string;
  name: string;
  unitPriceAgorot: number;
  awaitingImages: boolean;
}

export interface QuoteLine {
  lineId: string;
  kind: "product" | "bundle";
  name: string;
  qty: number;
  unitPriceAgorot: number;
  totalAgorot: number;
  /** סכום המחירים הרגילים, למארז קבוע (להצגת החיסכון) */
  regularAgorot?: number;
  children: QuoteChild[];
  awaitingImages: boolean;
  errors: string[];
}

export interface Quote {
  lines: QuoteLine[];
  itemsTotalAgorot: number;
  dealDiscountAgorot: number;
  dealNotes: string[];
  /** הנחת הכמות הכללית (באחוזים), על מוצרים שבהם היא טובה מהמבצע */
  quantityDiscountAgorot: number;
  /** כמה יחידות נספרות להנחת הכמות, וכמה חסרות כדי לקבל אותה (0 = כבר מגיעה) */
  discountUnits: number;
  unitsToDiscount: number;
  packagingAgorot: number;
  deliveryFeeAgorot: number;
  totalAgorot: number;
  errors: string[];
  ok: boolean;
}

export function dealTotal(product: Product, units: number): number {
  const d = product.deal;
  if (!d || d.qty < 2) return units * product.priceAgorot;
  const groups = Math.floor(units / d.qty);
  return groups * d.priceAgorot + (units % d.qty) * product.priceAgorot;
}

/** הרשימה המורחבת של יחידות במארז קבוע, בסדר קבוע (מוצר לכל יחידה) */
export function expandFixedBundle(bundle: Bundle): string[] {
  return bundle.items.flatMap((it) => Array.from({ length: it.qty }, () => it.productId));
}

export function bundleRegularPrice(bundle: Bundle, catalog: Catalog): number {
  return expandFixedBundle(bundle).reduce(
    (s, pid) => s + (catalog.products.find((p) => p.id === pid)?.priceAgorot ?? 0), 0);
}

/** כמה מארזים קבועים אפשר להרכיב מהמלאי הנוכחי. null = בלי הגבלה */
export function bundleStockLimit(bundle: Bundle, catalog: Catalog): number | null {
  let limit: number | null = null;
  for (const it of bundle.items) {
    const p = catalog.products.find((x) => x.id === it.productId);
    if (!p || !p.isAvailable) return 0;
    if (p.stockMode === "counted") {
      const n = Math.floor((p.stockQty ?? 0) / it.qty);
      limit = limit === null ? n : Math.min(limit, n);
    }
  }
  return limit;
}

export function isPurchasable(p: Product): boolean {
  return p.isAvailable && (p.stockMode !== "counted" || (p.stockQty ?? 0) > 0);
}

export function computeQuote(cart: CartLine[], catalog: Catalog, delivery: DeliveryMethod | null): Quote {
  const productById = new Map(catalog.products.map((p) => [p.id, p]));
  const bundleById = new Map(catalog.bundles.map((b) => [b.id, b]));
  const errors: string[] = [];
  const lines: QuoteLine[] = [];
  const demand = new Map<string, number>();      // מלאי משותף
  const dealUnits = new Map<string, number>();   // יחידות שנספרות למבצע
  const add = (m: Map<string, number>, k: string, n: number) => m.set(k, (m.get(k) ?? 0) + n);

  for (const line of cart) {
    if (line.kind === "product") {
      const p = productById.get(line.productId);
      if (!p) { errors.push("מוצר בסל כבר לא קיים באתר. יש להסיר אותו."); continue; }
      const qty = Math.max(1, Math.floor(line.qty || 1));
      const lineErrors = Object.values(validateCustomization(p, line.custom));
      add(demand, p.id, qty);
      add(dealUnits, p.id, qty);
      lines.push({
        lineId: line.lineId, kind: "product", name: p.name, qty,
        unitPriceAgorot: p.priceAgorot, totalAgorot: p.priceAgorot * qty, children: [],
        awaitingImages: missingImages(p, line.custom) > 0, errors: lineErrors,
      });
      continue;
    }

    const b = bundleById.get(line.bundleId);
    if (!b) { errors.push("מארז בסל כבר לא קיים באתר. יש להסיר אותו."); continue; }
    const lineErrors: string[] = [];
    const children: QuoteChild[] = [];

    if (b.type === "fixed") {
      const expected = expandFixedBundle(b);
      const got = line.items.map((i) => i.productId);
      if (expected.length !== got.length || expected.some((id, i) => id !== got[i]))
        lineErrors.push("תכולת המארז השתנתה. יש לפתוח את המארז מחדש ולשמור.");
      else lineErrors.push(...designLimitErrors(b, line.items, (id) => productById.get(id)?.name ?? "פריט"));
    } else {
      if (line.items.length < b.minItems) lineErrors.push(`במארז צריכים להיות לפחות ${b.minItems} פריטים`);
      if (b.maxItems !== null && line.items.length > b.maxItems) lineErrors.push(`במארז אפשר עד ${b.maxItems} פריטים`);
    }

    let sum = 0;
    for (const item of line.items) {
      const p = productById.get(item.productId);
      if (!p) { lineErrors.push("פריט במארז כבר לא קיים באתר"); continue; }
      if (b.type === "free" && !p.allowedInBundles) lineErrors.push(`${p.name} לא זמין למארזים`);
      const errs = Object.values(validateCustomization(p, item.custom));
      if (errs.length) lineErrors.push(`${p.name}: ${errs.join(", ")}`);
      add(demand, p.id, 1);
      if (b.type === "free") add(dealUnits, p.id, 1);
      sum += p.priceAgorot;
      children.push({
        productId: p.id, name: p.name, unitPriceAgorot: p.priceAgorot,
        awaitingImages: missingImages(p, item.custom) > 0,
      });
    }

    const price = b.type === "fixed" ? (b.priceAgorot ?? 0) : sum;
    lines.push({
      lineId: line.lineId, kind: "bundle", name: b.name, qty: 1,
      unitPriceAgorot: price, totalAgorot: price,
      regularAgorot: b.type === "fixed" ? sum : undefined,
      children, awaitingImages: children.some((c) => c.awaitingImages), errors: lineErrors,
    });
  }

  // מלאי וזמינות
  for (const [pid, n] of demand) {
    const p = productById.get(pid)!;
    if (!p.isAvailable) errors.push(`${p.name} לא זמין כרגע`);
    else if (p.stockMode === "counted" && n > (p.stockQty ?? 0))
      errors.push(`${p.name}: יש במלאי ${p.stockQty ?? 0} יחידות, ובסל ${n} (כולל בתוך מארזים)`);
  }

  // מבצעי כמות והנחת כמות כללית, בלי כפל: לכל מוצר ההנחה הגבוהה מבין השתיים
  const st = catalog.settings;
  const discountUnits = [...dealUnits.values()].reduce((a, b) => a + b, 0);
  const pct = st.quantityDiscountPercent > 0 && discountUnits >= st.quantityDiscountMinUnits ? st.quantityDiscountPercent : 0;
  const unitsToDiscount = st.quantityDiscountPercent > 0 ? Math.max(0, st.quantityDiscountMinUnits - discountUnits) : 0;
  let dealDiscount = 0;
  let quantityDiscount = 0;
  const dealNotes: string[] = [];
  for (const [pid, n] of dealUnits) {
    const p = productById.get(pid)!;
    const deal = n * p.priceAgorot - dealTotal(p, n);
    const qty = Math.round((n * p.priceAgorot * pct) / 100);
    if (qty > 0 && qty >= deal) quantityDiscount += qty;
    else if (deal > 0) {
      dealDiscount += deal;
      dealNotes.push(`${p.name}: ${p.deal!.qty} ב־${p.deal!.priceAgorot / 100} ₪`);
    }
  }

  const itemsTotal = lines.reduce((s, l) => s + l.totalAgorot, 0);
  const packaging = lines.filter((l) => l.kind === "bundle").length * catalog.settings.bundlePackagingAgorot;
  let deliveryFee = 0;
  if (delivery === "courier") {
    if (!catalog.settings.courierEnabled) errors.push("משלוח עם שליח לא זמין כרגע");
    deliveryFee = catalog.settings.courierFeeAgorot;
  } else if (delivery === "pickup" && !catalog.settings.pickupEnabled) {
    errors.push("איסוף עצמי לא זמין כרגע");
  }
  if (cart.length === 0) errors.push("הסל ריק");

  const ok = errors.length === 0 && lines.every((l) => l.errors.length === 0);
  return {
    lines, itemsTotalAgorot: itemsTotal, dealDiscountAgorot: dealDiscount, dealNotes,
    quantityDiscountAgorot: quantityDiscount, discountUnits, unitsToDiscount,
    packagingAgorot: packaging, deliveryFeeAgorot: deliveryFee,
    totalAgorot: itemsTotal - dealDiscount - quantityDiscount + packaging + deliveryFee, errors, ok,
  };
}
