// מבנה ההתאמה ששמור בשורת הזמנה (order_lines.customization). אותו מבנה כמו בסל, בלי התמונות הממוזערות:
// לכל תמונה נשמר רק מזהה הקובץ באחסון הפרטי. ייכתב כך גם ביצירת ההזמנה אחרי תשלום (4ד).
export interface OrderImage { uploadId: string; name?: string; width?: number; height?: number }
export interface OrderCustomization {
  option: string | null;
  values: Record<string, string>;
  images: Record<string, OrderImage[]>;
  sendLater: boolean;
  note: string;
}

export const ORDER_STATUSES = [
  { value: "new", label: "חדשה" },
  { value: "in_production", label: "בהכנה" },
  { value: "ready", label: "מוכנה" },
  { value: "shipped", label: "נשלחה" },
  { value: "picked_up", label: "נאספה" },
  { value: "cancelled", label: "בוטלה" },
] as const;
export const statusLabel = (s: string) => ORDER_STATUSES.find((x) => x.value === s)?.label ?? s;
export const OPEN_STATUSES = ["new", "in_production", "ready"];

export function asCustomization(raw: unknown): OrderCustomization {
  const c = (raw && typeof raw === "object" ? raw : {}) as Partial<OrderCustomization>;
  return {
    option: typeof c.option === "string" ? c.option : null,
    values: c.values && typeof c.values === "object" ? c.values : {},
    images: c.images && typeof c.images === "object" ? c.images : {},
    sendLater: !!c.sendLater,
    note: typeof c.note === "string" ? c.note : "",
  };
}

/** שם קובץ להורדה שמזהה את הפריט: <הזמנה>-<פריט>-<מוצר>[-n].<סיומת>, ובמארז: <הזמנה>-מארז<n>-<פריט>-<מוצר> */
export function downloadName(orderNumber: number, position: string, product: string, k: number, total: number, ext: string) {
  const clean = product.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, "-").slice(0, 40);
  return `${orderNumber}-${position}-${clean}${total > 1 ? `-${k + 1}` : ""}.${ext}`;
}
export const extOf = (mime: string) =>
  mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : mime === "image/heic" ? "heic" : mime === "image/heif" ? "heif" : "jpg";
