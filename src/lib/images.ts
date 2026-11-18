"use client";
// קריאת תמונה שהלקוח בחר: בדיקת סוג וגודל, מידות, תמונה ממוזערת לסל, וגרסת תצוגה להעלאה.
// גרסת התצוגה נוצרת מחדש ב־canvas, ולכן אין בה מטא־דאטה (מיקום GPS, פרטי מכשיר).
// HEIC (ברירת המחדל באייפון): אם הדפדפן לא מפענח, ממירים בדפדפן לתצוגה בלבד. הקובץ המקורי נשמר כמו שהוא.
import type { ImageRef } from "./types";
import { ALLOWED_MIME, MAX_BYTES, PREVIEW_MAX_PX } from "./upload-rules";

export { MAX_BYTES };
export const ACCEPT = ALLOWED_MIME.join(",");
/** סף אזהרת איכות: צלע ארוכה בפיקסלים (אושר ע"י בעלת העסק, 2026-11-19) */
export const LOW_RES_PX = 1000;

export class ImageError extends Error {}

export interface ReadImage extends ImageRef {
  lowRes: boolean;
  noPreview: boolean;
  /** הסוג שיוצהר לשרת (HEIC בלי type בדפדפן מקבל image/heic) */
  mime: string;
  /** גרסת תצוגה JPEG, בלי מטא־דאטה. null כשלא הצלחנו לפענח (HEIC בדפדפן ישן) */
  preview: Blob | null;
}

function isHeicFile(file: File) {
  return /\.(heic|heif)$/i.test(file.name) || file.type === "image/heic" || file.type === "image/heif";
}

async function decode(file: Blob): Promise<ImageBitmap> {
  return createImageBitmap(file, { imageOrientation: "from-image" });
}

async function heicToJpeg(file: File): Promise<Blob> {
  const { default: heic2any } = await import("heic2any");
  const out = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.9 });
  return Array.isArray(out) ? out[0] : out;
}

function draw(bmp: ImageBitmap, maxPx: number): HTMLCanvasElement {
  const scale = Math.min(1, maxPx / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bmp.width * scale));
  canvas.height = Math.max(1, Math.round(bmp.height * scale));
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return canvas;
}

const toBlob = (c: HTMLCanvasElement, q: number) =>
  new Promise<Blob | null>((res) => c.toBlob((b) => res(b), "image/jpeg", q));

export async function readImage(file: File): Promise<ReadImage> {
  const heic = isHeicFile(file);
  const mime = heic ? (file.type === "image/heif" ? "image/heif" : "image/heic") : file.type;
  if (!(ALLOWED_MIME as readonly string[]).includes(mime))
    throw new ImageError("אפשר להעלות רק תמונות (JPG, PNG, HEIC או WEBP)");
  if (file.size > MAX_BYTES) throw new ImageError("הקובץ גדול מ־25MB. נסו תמונה קטנה יותר");
  if (file.size === 0) throw new ImageError("הקובץ ריק. נסו קובץ אחר");

  let bmp: ImageBitmap | null = null;
  try {
    bmp = await decode(file);
  } catch {
    if (!heic) throw new ImageError("לא הצלחנו לקרוא את התמונה. נסו קובץ אחר");
    try { bmp = await decode(await heicToJpeg(file)); } catch { bmp = null; }
  }
  if (!bmp) {
    // HEIC שלא הצלחנו להציג: עדיין מעלים את המקור. בעלת העסק תפתח אותו במחשב
    return { name: file.name, width: 0, height: 0, thumb: "", lowRes: false, noPreview: true, mime, preview: null };
  }
  const thumb = draw(bmp, 240).toDataURL("image/jpeg", 0.7);
  const preview = await toBlob(draw(bmp, PREVIEW_MAX_PX), 0.85);
  const width = bmp.width, height = bmp.height;
  bmp.close();
  return { name: file.name, width, height, thumb, lowRes: Math.max(width, height) < LOW_RES_PX, noPreview: false, mime, preview };
}
