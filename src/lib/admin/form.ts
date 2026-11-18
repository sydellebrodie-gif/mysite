// עזרים לטופסי הניהול: קריאת שדות, המרת ש"ח לאגורות, ועטיפה אחידה לפעולות שרת.
import "server-only";
import { revalidatePath } from "next/cache";
import { requireAdmin, type AdminDb } from "./auth";

export interface ActionResult { ok: boolean; msg: string; at: number }
export const initial: ActionResult = { ok: true, msg: "", at: 0 };

export class FormError extends Error {}

export const str = (fd: FormData, k: string, max = 2000) => {
  const v = String(fd.get(k) ?? "").trim();
  if (v.length > max) throw new FormError(`השדה ארוך מדי (עד ${max} תווים)`);
  return v;
};
export const required = (fd: FormData, k: string, label: string, max = 200) => {
  const v = str(fd, k, max);
  if (!v) throw new FormError(`חסר: ${label}`);
  return v;
};
export const bool = (fd: FormData, k: string) => fd.get(k) === "on" || fd.get(k) === "true";
export function int(fd: FormData, k: string, label: string, { min = 0, max = 1_000_000, optional = false } = {}): number | null {
  const raw = str(fd, k, 20);
  if (!raw) { if (optional) return null; throw new FormError(`חסר: ${label}`); }
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) throw new FormError(`${label}: מספר שלם בין ${min} ל־${max}`);
  return n;
}
/** "12" או "12.5" ש"ח → אגורות */
export function agorot(fd: FormData, k: string, label: string, { optional = false } = {}): number | null {
  const raw = str(fd, k, 20).replace(/[₪,\s]/g, "");
  if (!raw) { if (optional) return null; throw new FormError(`חסר: ${label}`); }
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) throw new FormError(`${label}: סכום בש״ח, למשל 45 או 12.50`);
  return Math.round(Number(raw) * 100);
}
export const slugOf = (fd: FormData, k = "slug") => {
  const v = str(fd, k, 80).toLowerCase();
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(v)) throw new FormError("כתובת (slug): אותיות באנגלית, ספרות ומקפים בלבד, למשל white-mug");
  return v;
};

/** הודעות שגיאה מוכרות מהמסד, בעברית */
function dbMessage(e: { code?: string; message?: string }): string {
  if (e.code === "23505") return "הערך כבר קיים (למשל קוד או כתובת של מוצר אחר). יש לבחור ערך אחר";
  if (e.code === "23503") return "אי אפשר למחוק: הפריט מופיע בהזמנות או במארזים. אפשר להסתיר אותו במקום";
  if (e.code === "23514") return "הערך לא עומד בכללים של השדה";
  if (e.code === "42501" || e.code === "PGRST301") return "אין הרשאה. יש להתחבר מחדש";
  return e.message ?? "שגיאה";
}
export const check = <T extends { error: { code?: string; message?: string } | null }>(r: T): T => {
  if (r.error) throw new FormError(dbMessage(r.error));
  return r;
};

/** עטיפה לכל פעולת שמירה: הרשאה, טיפול בשגיאות, ורענון האתר הציבורי */
export function adminAction(fn: (db: AdminDb, fd: FormData, userId: string) => Promise<string | void>) {
  return async (_prev: ActionResult, fd: FormData): Promise<ActionResult> => {
    const { sb, user } = await requireAdmin();
    try {
      const msg = await fn(sb, fd, user.id);
      revalidatePath("/", "layout");
      return { ok: true, msg: msg || "נשמר", at: Date.now() };
    } catch (e) {
      if (e instanceof FormError) return { ok: false, msg: e.message, at: Date.now() };
      if (e && typeof e === "object" && "digest" in e) throw e; // redirect()
      console.error("admin action failed", e);
      return { ok: false, msg: "השמירה נכשלה. אפשר לנסות שוב", at: Date.now() };
    }
  };
}
