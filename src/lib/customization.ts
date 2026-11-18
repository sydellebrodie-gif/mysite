// ולידציה של התאמה אישית. משותף לדפדפן ולשרת (השרת בודק שוב לפני תשלום).
import type { Customization, CustomField, Product } from "./types";

export function emptyCustomization(product?: Product): Customization {
  return {
    option: product && product.designOptions.length === 1 ? product.designOptions[0].key : null,
    values: {},
    images: {},
    sendLater: false,
    note: "",
  };
}

export const NOTE_MAX = 300;

export function countWords(s: string): number {
  const t = s.trim();
  return t ? t.split(/\s+/u).length : 0;
}

/** השדות שמוצגים לפי מסלול העיצוב שנבחר */
export function activeFields(product: Product, option: string | null): CustomField[] {
  if (product.designOptions.length > 0 && !option) return [];
  return product.fields.filter((f) => f.optionKey === null || f.optionKey === option);
}

export function needsImages(product: Product, option: string | null): boolean {
  return activeFields(product, option).some((f) => f.type === "image");
}

/** כמה תמונות חסרות כרגע (לסימון "ממתין לחומרים") */
export function missingImages(product: Product, c: Customization): number {
  let n = 0;
  for (const f of activeFields(product, c.option)) {
    if (f.type !== "image") continue;
    const have = c.images[f.key]?.length ?? 0;
    n += Math.max(0, (f.minImages ?? 0) - have);
  }
  return n;
}

export type FieldErrors = Record<string, string>;

/** מחזיר שגיאות לפי מפתח שדה. "_option" למסלול, "_note" להערה. ריק = תקין */
export function validateCustomization(product: Product, c: Customization): FieldErrors {
  const errors: FieldErrors = {};
  if (product.designOptions.length > 0) {
    if (!c.option || !product.designOptions.some((o) => o.key === c.option)) {
      errors._option = "יש לבחור סוג עיצוב";
      return errors;
    }
  }
  for (const f of activeFields(product, c.option)) {
    if (f.type === "image") {
      const have = c.images[f.key]?.length ?? 0;
      const max = f.maxImages ?? 1;
      const imgs = c.images[f.key] ?? [];
      if (imgs.some((im) => im.state === "uploading")) errors[f.key] = "התמונה עדיין עולה. עוד רגע…";
      else if (imgs.some((im) => im.state === "failed")) errors[f.key] = "העלאת תמונה נכשלה. יש לנסות שוב, להחליף או להסיר אותה";
      else if (have > max) errors[f.key] = `אפשר עד ${max} תמונות`;
      else if (have < (f.minImages ?? 0) && !c.sendLater)
        errors[f.key] = f.minImages === 1 ? "יש להעלות תמונה, או לסמן \"אשלח את התמונות אחרי התשלום\"" : `יש להעלות לפחות ${f.minImages} תמונות, או לסמן "אשלח את התמונות אחרי התשלום"`;
      continue;
    }
    const v = (c.values[f.key] ?? "").trim();
    if (!v) {
      if (f.required) errors[f.key] = f.type === "design" || f.type === "select" ? "יש לבחור" : "שדה חובה";
      continue;
    }
    if (f.maxLength && v.length > f.maxLength) errors[f.key] = `עד ${f.maxLength} תווים`;
    else if (f.maxWords && countWords(v) > f.maxWords) errors[f.key] = `עד ${f.maxWords} מילים`;
    else if (f.type === "select" && f.options && !f.options.includes(v)) errors[f.key] = "בחירה לא תקינה";
    else if (f.type === "design" && product.designs.length > 0 && !product.designs.some((d) => d.id === v))
      errors[f.key] = "בחירה לא תקינה";
  }
  if (c.note.length > NOTE_MAX) errors._note = `עד ${NOTE_MAX} תווים`;
  return errors;
}

/** שורות טקסט קצרות לסיכום בסל, בקופה ובדף הייצור */
export function summarize(product: Product, c: Customization): string[] {
  const out: string[] = [];
  const opt = product.designOptions.find((o) => o.key === c.option);
  if (opt) out.push(`סוג עיצוב: ${opt.label}`);
  for (const f of activeFields(product, c.option)) {
    if (f.type === "image") {
      const n = c.images[f.key]?.length ?? 0;
      if (n) out.push(n === 1 ? "הועלתה תמונה אחת" : `הועלו ${n} תמונות`);
      continue;
    }
    const v = (c.values[f.key] ?? "").trim();
    if (!v) continue;
    const label = f.type === "design" ? product.designs.find((d) => d.id === v)?.name ?? v : v;
    out.push(`${f.label}: ${label}`);
  }
  if (c.sendLater && missingImages(product, c) > 0) out.push("התמונות יישלחו אחרי התשלום");
  if (c.note.trim()) out.push(`הערה: ${c.note.trim()}`);
  return out;
}
