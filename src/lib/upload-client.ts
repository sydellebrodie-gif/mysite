"use client";
// העלאת תמונה לשרת מהדפדפן: בקשת קישור חתום ← העלאה ישירה לאחסון הפרטי ← אימות בשרת.
// כשהשרת לא מוגדר (פיתוח/הדגמה) מוחזר "local" והתמונה נשארת רק בדפדפן, כמו קודם.
import type { ReadImage } from "./images";

export class UploadFailed extends Error {}

async function put(url: string, body: Blob, contentType: string) {
  const res = await fetch(url, { method: "PUT", body, headers: { "content-type": contentType, "x-upsert": "false" } });
  if (!res.ok) throw new UploadFailed("ההעלאה נקטעה. בדקו את החיבור ונסו שוב");
}

export async function uploadImage(file: File, img: ReadImage): Promise<{ uploadId: string } | "local"> {
  let res: Response;
  try {
    res = await fetch("/api/uploads", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ mime: img.mime, size: file.size, name: file.name, width: img.width, height: img.height, rights: true }),
    });
  } catch { throw new UploadFailed("אין חיבור לאינטרנט. נסו שוב"); }
  const data = await res.json().catch(() => ({}));
  if (res.status === 503 && data.mode === "local") return "local";
  if (!res.ok) throw new UploadFailed(data.error ?? "ההעלאה נכשלה. נסו שוב");

  try {
    await put(data.uploadUrl, file, img.mime);
    if (img.preview) await put(data.previewUrl, img.preview, "image/jpeg");
  } catch (e) {
    throw e instanceof UploadFailed ? e : new UploadFailed("ההעלאה נקטעה. בדקו את החיבור ונסו שוב");
  }

  const done = await fetch(`/api/uploads/${data.uploadId}/complete`, { method: "POST" }).catch(() => null);
  const dd = done ? await done.json().catch(() => ({})) : {};
  if (!done?.ok) throw new UploadFailed(dd.error ?? "ההעלאה נכשלה. נסו שוב");
  return { uploadId: data.uploadId };
}
