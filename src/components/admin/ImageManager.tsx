"use client";
// תמונות מוצר/מארז: העלאה מהמחשב או מהטלפון (מוקטנת ל־1600px JPEG בדפדפן, בלי מטא־דאטה),
// שינוי סדר (הראשונה היא הראשית) והסרה. כל פעולה נשמרת מיד.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { browserClient } from "@/lib/supabase/browser";
import { readImage } from "@/lib/images";
import type { ActionResult } from "./AdminForm";

type Act = (prev: ActionResult, fd: FormData) => Promise<ActionResult>;
export const PRODUCT_IMAGES = "product-images";
export const publicUrl = (path: string) =>
  `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${PRODUCT_IMAGES}/${path}`;

/** מקטינה ומעלה תמונה אחת לאחסון הציבורי של תמונות המוצרים. מחזירה את הנתיב */
export async function uploadProductImage(file: File, folder: "products" | "bundles" | "designs", ownerId: string) {
  const img = await readImage(file);
  if (!img.preview) throw new Error("לא הצלחתי לקרוא את התמונה. אפשר לנסות קובץ JPG או PNG");
  const path = `${folder}/${ownerId}/${crypto.randomUUID()}.jpg`;
  const { error } = await browserClient().storage.from(PRODUCT_IMAGES).upload(path, img.preview, { contentType: "image/jpeg" });
  if (error) throw new Error("ההעלאה נכשלה. אפשר לנסות שוב");
  return path;
}

export default function ImageManager({ table, id, images, folder, actions, label }: {
  table: "products" | "bundle_templates"; id: string; images: string[]; folder: "products" | "bundles";
  actions: { add: Act; remove: Act; move: Act }; label: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function call(act: Act, fields: Record<string, string>) {
    const fd = new FormData();
    fd.set("table", table); fd.set("id", id);
    Object.entries(fields).forEach(([k, v]) => fd.set(k, v));
    const r = await act({ ok: true, msg: "", at: 0 }, fd);
    setMsg({ ok: r.ok, text: r.msg });
    if (r.ok) router.refresh();
    return r.ok;
  }

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true); setMsg(null);
    try {
      for (const f of Array.from(files)) {
        const path = await uploadProductImage(f, folder, id);
        if (!(await call(actions.add, { path }))) break;
      }
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally { setBusy(false); }
  }

  return (
    <div className="image-manager">
      {images.length === 0 && <p className="muted">עדיין אין תמונות. באתר מוצג במקומן ריבוע עם האות הראשונה.</p>}
      <ul className="admin-images">
        {images.map((p, i) => (
          <li key={p}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={publicUrl(p)} alt={`${label}, תמונה ${i + 1}`} loading="lazy" />
            {i === 0 && <span className="badge">ראשית</span>}
            <div className="row-actions">
              <button type="button" className="link-btn" disabled={busy || i === 0} onClick={() => call(actions.move, { path: p, dir: "up" })}
                aria-label={`הזזת תמונה ${i + 1} קדימה`}>→ קדימה</button>
              <button type="button" className="link-btn" disabled={busy || i === images.length - 1} onClick={() => call(actions.move, { path: p, dir: "down" })}
                aria-label={`הזזת תמונה ${i + 1} אחורה`}>אחורה ←</button>
              <button type="button" className="link-btn danger" disabled={busy}
                onClick={() => window.confirm("להסיר את התמונה?") && call(actions.remove, { path: p })}>הסרה</button>
            </div>
          </li>
        ))}
      </ul>
      <label className={`btn small secondary ${busy ? "disabled" : ""}`}>
        {busy ? "מעלה…" : "+ הוספת תמונות"}
        <input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" multiple hidden disabled={busy}
          onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />
      </label>
      {msg && <p className={msg.ok ? "saved" : "error"} role={msg.ok ? "status" : "alert"}>{msg.ok ? `✓ ${msg.text}` : msg.text}</p>}
    </div>
  );
}

/** בחירת תמונה אחת לשדה בטופס (עיצוב קבוע). התמונה עולה מיד, והנתיב נשמר עם הטופס */
export function ImagePick({ name, ownerId, initial, label }: { name: string; ownerId: string; initial: string | null; label: string }) {
  const [path, setPath] = useState(initial ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  return (
    <div className="field image-pick">
      <span className="label">{label}</span>
      <input type="hidden" name={name} value={path} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {path && <img src={publicUrl(path)} alt={label} />}
      <div className="row-actions">
        <label className={`link-btn ${busy ? "disabled" : ""}`}>
          {busy ? "מעלה…" : path ? "החלפה" : "בחירת תמונה"}
          <input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" hidden disabled={busy}
            onChange={async (e) => {
              const f = e.target.files?.[0]; e.target.value = "";
              if (!f) return;
              setBusy(true); setErr("");
              try { setPath(await uploadProductImage(f, "designs", ownerId)); } catch (x) { setErr((x as Error).message); }
              setBusy(false);
            }} />
        </label>
        {path && <button type="button" className="link-btn danger" onClick={() => setPath("")}>הסרה</button>}
      </div>
      {path !== (initial ?? "") && <small className="muted">התמונה תישמר בלחיצה על שמירה.</small>}
      {err && <p className="error">{err}</p>}
    </div>
  );
}
