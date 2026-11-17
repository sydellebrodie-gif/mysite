"use client";
// קריאת תמונה שהלקוח בחר: בדיקת סוג וגודל, מידות, ותמונה ממוזערת קטנה לתצוגה בסל.
// שימו לב: העלאת הקובץ המקורי לשרת (אחסון פרטי) תתווסף בשלב 4ג. עד אז התמונה נשמרת רק בדפדפן הזה.
import type { ImageRef } from "./types";

export const ACCEPT = "image/jpeg,image/png,image/heic,image/heif,image/webp";
export const MAX_BYTES = 25 * 1024 * 1024;
/** סף אזהרת איכות: צלע ארוכה בפיקסלים. הנחה זמנית עד שבעלת העסק תקבע */
export const LOW_RES_PX = 1000;

const OK_TYPES = ACCEPT.split(",");

export class ImageError extends Error {}

export async function readImage(file: File): Promise<ImageRef & { lowRes: boolean; noPreview: boolean }> {
  const isHeic = /\.(heic|heif)$/i.test(file.name) || file.type === "image/heic" || file.type === "image/heif";
  if (!OK_TYPES.includes(file.type) && !isHeic)
    throw new ImageError("אפשר להעלות רק תמונות (JPG, PNG, HEIC או WEBP)");
  if (file.size > MAX_BYTES) throw new ImageError("הקובץ גדול מ־25MB. נסו תמונה קטנה יותר");

  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 240 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const thumb = canvas.toDataURL("image/jpeg", 0.7);
    const ref = { name: file.name, width: bmp.width, height: bmp.height, thumb };
    bmp.close();
    return { ...ref, lowRes: Math.max(ref.width, ref.height) < LOW_RES_PX, noPreview: false };
  } catch {
    if (isHeic) return { name: file.name, width: 0, height: 0, thumb: "", lowRes: false, noPreview: true };
    throw new ImageError("לא הצלחנו לקרוא את התמונה. נסו קובץ אחר");
  }
}
