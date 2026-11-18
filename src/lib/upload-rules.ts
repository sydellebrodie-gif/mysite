// כללי העלאה משותפים לדפדפן ולשרת.
export const CUSTOMER_BUCKET = "customer-uploads";
export const ALLOWED_MIME = ["image/jpeg", "image/png", "image/heic", "image/heif", "image/webp"] as const;
export type AllowedMime = (typeof ALLOWED_MIME)[number];
export const MAX_BYTES = 25 * 1024 * 1024;
/** גרסת תצוגה (בלי מטא־דאטה): JPEG, צלע ארוכה עד 1600px */
export const PREVIEW_MAX_PX = 1600;
export const PREVIEW_MAX_BYTES = 3 * 1024 * 1024;
/** הגבלת קצב: כמה תמונות בשעה מאותו מקור (מארז 10 דפים × 8 תמונות = 80) */
export const UPLOADS_PER_HOUR = 150;
/** תקרה כללית ליממה (הגנה על נפח האחסון מפני ניצול). ניתן לשנות במשתנה הסביבה UPLOADS_PER_DAY */
export const UPLOADS_PER_DAY_DEFAULT = 2000;

/** זיהוי סוג התמונה לפי הבתים הראשונים בקובץ (ולא לפי הסיומת) */
export function sniffImage(b: Uint8Array): "jpeg" | "png" | "webp" | "heic" | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (b.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((x, i) => b[i] === x)) return "png";
  const ascii = (from: number, to: number) => String.fromCharCode(...b.slice(from, to));
  if (b.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "webp";
  if (b.length >= 12 && ascii(4, 8) === "ftyp") {
    const brand = ascii(8, 12);
    if (["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1", "avif"].includes(brand)) return brand === "avif" ? null : "heic";
  }
  return null;
}

export function mimeFamily(m: string): "jpeg" | "png" | "webp" | "heic" | null {
  if (m === "image/jpeg") return "jpeg";
  if (m === "image/png") return "png";
  if (m === "image/webp") return "webp";
  if (m === "image/heic" || m === "image/heif") return "heic";
  return null;
}
