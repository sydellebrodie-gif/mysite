"use client";
// קבצי לקוח בהזמנה: הורדת המקור, הורדה כ־JPG (לקבצי HEIC מאייפון, שלא נפתחים ב־Windows בלי תוסף),
// הורדת כל הקבצים, העלאת קובץ לפריט, והסרה.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { browserClient } from "@/lib/supabase/browser";
import { readImage } from "@/lib/images";
import type { ActionResult } from "./AdminForm";

type Act = (prev: ActionResult, fd: FormData) => Promise<ActionResult>;
export interface ClientFile { id: string; mime: string; previewUrl: string | null; downloadName: string; downloaded: boolean; width: number | null; height: number | null }
const isHeic = (m: string) => m === "image/heic" || m === "image/heif";
const jpgName = (n: string) => n.replace(/\.(heic|heif)$/i, ".jpg");

function save(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}
async function fetchOriginal(f: ClientFile) {
  const res = await fetch(`/admin/files/${f.id}`);
  if (!res.ok) throw new Error("ההורדה נכשלה");
  return res.blob();
}
/** המרה ל־JPG באיכות גבוהה, בדפדפן (heic2any נטען רק כשצריך) */
async function toJpg(blob: Blob): Promise<Blob> {
  const heic2any = (await import("heic2any")).default;
  const out = await heic2any({ blob, toType: "image/jpeg", quality: 0.95 });
  return Array.isArray(out) ? out[0] : out;
}
/** הקובץ נשמר בשם שנקבע כאן (ולא בשם שהאחסון מציע: supabase-js מקודד פעמיים שמות בעברית) */
export async function downloadFile(f: ClientFile, asJpg: boolean) {
  const blob = await fetchOriginal(f);
  if (asJpg && isHeic(f.mime)) save(await toJpg(blob), jpgName(f.downloadName));
  else save(blob, f.downloadName);
}

export function FileThumb({ f, lineId, remove }: { f: ClientFile; lineId: string; remove: Act }) {
  const router = useRouter();
  const [busy, setBusy] = useState(""); const [err, setErr] = useState("");
  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label); setErr("");
    try { await fn(); } catch (e) { setErr((e as Error).message || "נכשל"); }
    setBusy("");
  };
  return (
    <li className="file-thumb">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {f.previewUrl ? <img src={f.previewUrl} alt={f.downloadName} /> : <div className="no-preview">אין תצוגה</div>}
      <small className="ltr">{f.downloadName}</small>
      <small className="muted">{f.width && f.height ? `${f.width}×${f.height}` : ""}{f.downloaded ? " · הורד" : ""}</small>
      <div className="row-actions">
        <button type="button" className="link-btn" disabled={!!busy} onClick={() => run("dl", () => downloadFile(f, false))}>
          {busy === "dl" ? "מוריד…" : isHeic(f.mime) ? "הורדת מקור (HEIC)" : "הורדה"}</button>
        {isHeic(f.mime) && (
          <button type="button" className="link-btn" disabled={!!busy} onClick={() => run("jpg", () => downloadFile(f, true))}>
            {busy === "jpg" ? "ממירה…" : "הורדה כ־JPG"}</button>
        )}
        <button type="button" className="link-btn danger" disabled={!!busy} onClick={() => window.confirm("להסיר את הקובץ מהפריט ולמחוק אותו מהענן?") && run("rm", async () => {
          const fd = new FormData(); fd.set("line_id", lineId); fd.set("upload_id", f.id);
          const r = await remove({ ok: true, msg: "", at: 0 }, fd);
          if (!r.ok) throw new Error(r.msg);
          router.refresh();
        })}>הסרה</button>
      </div>
      {err && <p className="error">{err}</p>}
    </li>
  );
}

/** העלאת קובץ לפריט מממשק הניהול (תמונה שהלקוח שלח בוואטסאפ או במייל) */
export function AttachFile({ orderId, lineId, fields, attach }: {
  orderId: string; lineId: string; fields: { key: string; label: string }[]; attach: Act;
}) {
  const router = useRouter();
  const [field, setField] = useState(fields[0]?.key ?? "photos");
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function onFile(file: File) {
    setBusy(true); setMsg(null);
    try {
      const sb = browserClient();
      const img = await readImage(file);
      const base = `orders/${orderId}/${crypto.randomUUID()}`;
      const ext = img.mime === "image/png" ? "png" : img.mime === "image/webp" ? "webp" : isHeic(img.mime) ? "heic" : "jpg";
      const up = await sb.storage.from("customer-uploads").upload(`${base}.${ext}`, file, { contentType: img.mime });
      if (up.error) throw new Error("ההעלאה נכשלה");
      let preview = "";
      if (img.preview) {
        const pv = await sb.storage.from("customer-uploads").upload(`${base}-preview.jpg`, img.preview, { contentType: "image/jpeg" });
        if (!pv.error) preview = `${base}-preview.jpg`;
      }
      const fd = new FormData();
      Object.entries({ line_id: lineId, field, path: `${base}.${ext}`, preview_path: preview, mime: img.mime, size: String(file.size),
        width: String(img.width || ""), height: String(img.height || ""), name: file.name }).forEach(([k, v]) => fd.set(k, v));
      const r = await attach({ ok: true, msg: "", at: 0 }, fd);
      setMsg({ ok: r.ok, text: r.msg });
      if (r.ok) router.refresh();
    } catch (e) { setMsg({ ok: false, text: (e as Error).message || "ההעלאה נכשלה" }); }
    setBusy(false);
  }
  return (
    <div className="attach-file">
      {fields.length > 1 && (
        <select aria-label="לאיזה שדה" value={field} onChange={(e) => setField(e.target.value)}>
          {fields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
        </select>
      )}
      <label className={`btn small secondary ${busy ? "disabled" : ""}`}>
        {busy ? "מעלה…" : "+ העלאת קובץ לפריט"}
        <input type="file" hidden disabled={busy} accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onFile(f); }} />
      </label>
      {msg && <span className={msg.ok ? "saved" : "error"} role={msg.ok ? "status" : "alert"}>{msg.ok ? `✓ ${msg.text}` : msg.text}</span>}
    </div>
  );
}

/** הורדת כל קבצי ההזמנה, אחד אחרי השני (HEIC מומר ל־JPG אם מסומן) */
export function DownloadAll({ files }: { files: ClientFile[] }) {
  const [asJpg, setAsJpg] = useState(true);
  const [state, setState] = useState("");
  const hasHeic = files.some((f) => isHeic(f.mime));
  return (
    <div className="download-all">
      <button type="button" className="btn small" disabled={!!state && state !== "done" && !state.startsWith("!")} onClick={async () => {
        try {
          for (let i = 0; i < files.length; i++) {
            setState(`מוריד ${i + 1} מתוך ${files.length}…`);
            await downloadFile(files[i], asJpg);
            await new Promise((r) => setTimeout(r, 400));
          }
          setState("done");
        } catch { setState("!ההורדה נעצרה. אפשר לנסות שוב, או להוריד כל קובץ בנפרד"); }
      }}>הורדת כל הקבצים ({files.length})</button>
      {hasHeic && (
        <label className="check inline-check"><input type="checkbox" checked={asJpg} onChange={(e) => setAsJpg(e.target.checked)} />
          <span>להמיר קבצי אייפון (HEIC) ל־JPG</span></label>
      )}
      {state && <span className={state.startsWith("!") ? "error" : "muted"} role="status">
        {state === "done" ? "✓ ההורדה הסתיימה. הדפדפן עשוי לבקש אישור להורדת כמה קבצים" : state.replace(/^!/, "")}</span>}
    </div>
  );
}
