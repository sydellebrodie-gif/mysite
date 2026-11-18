// מארז קבוע שבו כמה יחידות חולקות עיצוב (למשל 10 דפי מדבקות בעד 5 עיצובים).
// בסל נשמרות תמיד כל היחידות, אחת־אחת, כך שהייצור והמלאי לא משתנים.
// יחידות עם אותו עיצוב הן העתקים זהים, ולכן אפשר לספור עיצובים שונים.
import type { Bundle, CartBundleItem, Customization } from "./types";

export interface DesignGroup {
  productId: string;
  count: number;
  custom: Customization;
  /** אינדקס הפריט בהגדרת המארז (לא רלוונטי במארז חופשי) */
  def: number;
  /** האם היחידות של הפריט הזה מתחלקות לעיצובים (maxDesigns) */
  shared: boolean;
}

/** מפתח השוואה לעיצוב (בלי מצב ההעלאה, שמשתנה תוך כדי) */
export function designKey(c: Customization): string {
  return JSON.stringify(c, (k, v) => (k === "state" ? undefined : v));
}

export const sharesDesigns = (d: { qty: number; maxDesigns?: number | null }) =>
  !!d.maxDesigns && d.maxDesigns < d.qty;

/** פריסת יחידות המארז לקבוצות עיצוב. יחידות רצופות זהות מתאחדות רק בפריט עם maxDesigns */
export function toGroups(bundle: Bundle, items: CartBundleItem[]): DesignGroup[] {
  if (bundle.type !== "fixed") return items.map((it) => ({ ...it, count: 1, def: -1, shared: false }));
  const out: DesignGroup[] = [];
  let at = 0;
  bundle.items.forEach((d, def) => {
    const slice = items.slice(at, at + d.qty);
    at += d.qty;
    const shared = sharesDesigns(d);
    for (const it of slice) {
      const last = out[out.length - 1];
      if (shared && last && last.def === def && designKey(last.custom) === designKey(it.custom)) last.count++;
      else out.push({ productId: it.productId, custom: it.custom, count: 1, def, shared });
    }
  });
  return out;
}

export function fromGroups(groups: DesignGroup[]): CartBundleItem[] {
  return groups.flatMap((g) => Array.from({ length: g.count }, () => ({ productId: g.productId, custom: g.custom })));
}

/** שגיאות: יותר עיצובים שונים מהמותר באחד הפריטים של מארז קבוע */
export function designLimitErrors(bundle: Bundle, items: CartBundleItem[], productName: (id: string) => string): string[] {
  if (bundle.type !== "fixed") return [];
  const errs: string[] = [];
  let at = 0;
  for (const d of bundle.items) {
    const slice = items.slice(at, at + d.qty);
    at += d.qty;
    if (!d.maxDesigns) continue;
    const n = new Set(slice.map((it) => designKey(it.custom))).size;
    if (n > d.maxDesigns) errs.push(`${productName(d.productId)}: אפשר עד ${d.maxDesigns} עיצובים שונים במארז (נבחרו ${n})`);
  }
  return errs;
}
