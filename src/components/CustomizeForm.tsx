"use client";
// טופס התאמה אישית למוצר אחד (גם בתוך מארז). כל השדות נגזרים מהגדרות המוצר, בלי קוד ייעודי למוצר.
import { useEffect, useRef, useState } from "react";
import type { CustomField, Customization, ImageRef, Product } from "@/lib/types";
import { activeFields, countWords, needsImages, NOTE_MAX, type FieldErrors } from "@/lib/customization";
import { ACCEPT, ImageError, readImage, type ReadImage } from "@/lib/images";
import { uploadImage } from "@/lib/upload-client";

interface Props {
  product: Product;
  value: Customization;
  onChange: (c: Customization) => void;
  errors: FieldErrors;
  showErrors: boolean;
  idPrefix: string;
}

export default function CustomizeForm({ product, value, onChange, errors, showErrors, idPrefix }: Props) {
  const fields = activeFields(product, value.option);
  const err = (k: string) => (showErrors ? errors[k] : undefined);
  const id = (k: string) => `${idPrefix}-${k}`;
  const set = (patch: Partial<Customization>) => onChange({ ...value, ...patch });

  return (
    <div className="customize">
      {product.designOptions.length > 0 && (
        <fieldset className="field" aria-describedby={err("_option") ? id("_option-err") : undefined}>
          <legend>סוג עיצוב <span className="req">*</span></legend>
          <div className="choice-grid">
            {product.designOptions.map((o) => (
              <label key={o.key} className={`choice ${value.option === o.key ? "selected" : ""}`}>
                <input type="radio" name={id("option")} value={o.key} checked={value.option === o.key}
                  onChange={() => set({ option: o.key })} />
                <span>{o.label}</span>
                {o.help && <small>{o.help}</small>}
              </label>
            ))}
          </div>
          {err("_option") && <p className="error" id={id("_option-err")}>{err("_option")}</p>}
        </fieldset>
      )}

      {fields.map((f) => (
        <FieldInput key={f.key} f={f} product={product} value={value} set={set} error={err(f.key)} id={id(f.key)} />
      ))}

      {needsImages(product, value.option) && (
        <label className="check">
          <input type="checkbox" checked={value.sendLater} onChange={(e) => set({ sendLater: e.target.checked })} />
          <span>אשלח את התמונות אחרי התשלום (תקבלו קישור אישי להעלאה)</span>
        </label>
      )}

      {(fields.length > 0 || product.designOptions.length === 0) && (
        <div className="field">
          <label htmlFor={id("note")}>הערה לעיצוב (רשות)</label>
          <textarea id={id("note")} rows={2} maxLength={NOTE_MAX} value={value.note}
            onChange={(e) => set({ note: e.target.value })} />
          {err("_note") && <p className="error">{err("_note")}</p>}
        </div>
      )}
    </div>
  );
}

function FieldInput({ f, product, value, set, error, id }: {
  f: CustomField; product: Product; value: Customization; set: (p: Partial<Customization>) => void; error?: string; id: string;
}) {
  const v = value.values[f.key] ?? "";
  const setV = (s: string) => set({ values: { ...value.values, [f.key]: s } });
  const errEl = error ? <p className="error" id={`${id}-err`}>{error}</p> : null;
  const req = f.required ? <span className="req">*</span> : null;
  const described = [f.help ? `${id}-help` : "", error ? `${id}-err` : ""].filter(Boolean).join(" ") || undefined;

  if (f.type === "image") {
    return <ImageField f={f} images={value.images[f.key] ?? []} error={error} id={id}
      onChange={(imgs) => set({ images: { ...value.images, [f.key]: imgs } })} />;
  }

  if (f.type === "design" && product.designs.length > 0) {
    return (
      <fieldset className="field">
        <legend>{f.label} {req}</legend>
        <div className="design-grid">
          {product.designs.map((d) => (
            <label key={d.id} className={`design ${v === d.id ? "selected" : ""}`}>
              <input type="radio" name={id} value={d.id} checked={v === d.id} onChange={() => setV(d.id)} />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {d.image ? <img src={d.image} alt="" /> : <span className="design-ph" />}
              <span>{d.name}</span>
            </label>
          ))}
        </div>
        {errEl}
      </fieldset>
    );
  }

  if (f.type === "select" && f.options) {
    return (
      <fieldset className="field">
        <legend>{f.label} {req}</legend>
        <div className="choice-grid">
          {f.options.map((o) => (
            <label key={o} className={`choice ${v === o ? "selected" : ""}`}>
              <input type="radio" name={id} value={o} checked={v === o} onChange={() => setV(o)} />
              <span>{o}</span>
            </label>
          ))}
        </div>
        {errEl}
      </fieldset>
    );
  }

  // טקסט חופשי, או בחירת עיצוב כשעדיין אין דוגמאות באתר
  const isDesignFallback = f.type === "design";
  const help = isDesignFallback
    ? "דוגמאות העיצובים יעלו לאתר בקרוב. בינתיים כתבו איזה עיצוב או משפט תרצו, או \"תחזרו אליי\"."
    : f.help;
  const counter = f.maxWords ? `${countWords(v)}/${f.maxWords} מילים` : f.maxLength ? `${v.length}/${f.maxLength}` : null;
  const Tag = f.type === "textarea" ? "textarea" : "input";
  return (
    <div className="field">
      <label htmlFor={id}>{f.label} {req}</label>
      <Tag id={id} value={v} maxLength={isDesignFallback ? 120 : f.maxLength} aria-invalid={!!error}
        aria-describedby={described} onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV(e.target.value)}
        {...(f.type === "textarea" ? { rows: 3 } : { type: "text" })} />
      <div className="field-meta">
        {help && <small id={`${id}-help`}>{help}</small>}
        {counter && <small className="ltr counter">{counter}</small>}
      </div>
      {errEl}
    </div>
  );
}

const RIGHTS_KEY = "gifts-rights-v1";
function readRights(): boolean { try { return localStorage.getItem(RIGHTS_KEY) === "1"; } catch { return false; } }
let localSeq = 0;

function ImageField({ f, images, onChange, error, id }: {
  f: CustomField; images: ImageRef[]; onChange: (imgs: ImageRef[]) => void; error?: string; id: string;
}) {
  const max = f.maxImages ?? 1;
  const [msg, setMsg] = useState<string | null>(null);
  const [warn, setWarn] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rights, setRights] = useState(false);
  const [failMsg, setFailMsg] = useState<Record<string, string>>({});
  useEffect(() => { setRights(readRights()); }, []);
  // ההעלאה אסינכרונית: עובדים מול הערכים העדכניים ולא מול מה שהיה בזמן הבחירה
  const latest = useRef(images); latest.current = images;
  const emit = useRef(onChange); emit.current = onChange;
  const files = useRef(new Map<string, { file: File; r: ReadImage }>());
  const commit = (next: ImageRef[]) => { latest.current = next; emit.current(next); };
  const patch = (localId: string, p: Partial<ImageRef>) =>
    commit(latest.current.map((im) => (im.localId === localId ? { ...im, ...p } : im)));

  function confirmRights(v: boolean) {
    setRights(v);
    try { if (v) localStorage.setItem(RIGHTS_KEY, "1"); else localStorage.removeItem(RIGHTS_KEY); } catch { /* מצב פרטי */ }
  }

  async function send(localId: string) {
    const entry = files.current.get(localId);
    if (!entry) return;
    patch(localId, { state: "uploading" });
    setFailMsg((m) => { const n = { ...m }; delete n[localId]; return n; });
    try {
      const res = await uploadImage(entry.file, entry.r);
      patch(localId, { state: undefined, uploadId: res === "local" ? undefined : res.uploadId });
      files.current.delete(localId);
    } catch (e) {
      patch(localId, { state: "failed" });
      setFailMsg((m) => ({ ...m, [localId]: e instanceof Error && e.message ? e.message : "ההעלאה נכשלה. נסו שוב" }));
    }
  }

  async function addFiles(list: FileList | null, replaceAt?: number) {
    if (!list?.length) return;
    setMsg(null); setWarn(null); setBusy(true);
    const queued: string[] = [];
    try {
      for (const file of Array.from(list)) {
        if (replaceAt === undefined && latest.current.length >= max) { setMsg(`אפשר עד ${max} תמונות`); break; }
        let r;
        try { r = await readImage(file); }
        catch (e) { setMsg(e instanceof ImageError ? e.message : "משהו השתבש בקריאת התמונה. נסו שוב"); continue; }
        const localId = `img${Date.now()}-${localSeq++}`;
        files.current.set(localId, { file, r });
        const ref: ImageRef = { name: r.name, width: r.width, height: r.height, thumb: r.thumb, localId, state: "uploading" };
        const next = [...latest.current];
        if (replaceAt !== undefined) next[replaceAt] = ref; else next.push(ref);
        commit(next);
        queued.push(localId);
        if (r.lowRes) setWarn("התמונה ברזולוציה נמוכה ועלולה לצאת מטושטשת. אפשר להמשיך, אבל מומלץ תמונה מקורית מהטלפון.");
        if (r.noPreview) setWarn("קובץ HEIC התקבל. אין לו תצוגה מקדימה בדפדפן הזה, אבל הוא יישמר כמו שהוא.");
        if (replaceAt !== undefined) break;
      }
      // אחת אחרי השנייה: עדין יותר לחיבור סלולרי, וסדר העדכונים נשמר
      for (const localId of queued) await send(localId);
    } finally { setBusy(false); }
  }

  const canPick = rights && !busy;
  return (
    <div className="field">
      <span className="label" id={`${id}-label`}>{f.label} {f.required && <span className="req">*</span>}</span>
      {f.help && <small id={`${id}-help`} className="help">{f.help}</small>}
      {images.length > 0 && (
        <ul className="thumbs">
          {images.map((im, k) => (
            <li key={im.localId ?? k} className={im.state ? `is-${im.state}` : ""}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {im.thumb ? <img src={im.thumb} alt={`תמונה ${k + 1}`} /> : <span className="thumb-ph">{im.name.split(".").pop()?.toUpperCase()}</span>}
              {im.state === "uploading" && <span className="thumb-status" role="status">מעלה…</span>}
              {im.state === "failed" && <span className="thumb-status bad">לא הועלתה</span>}
              <div className="thumb-actions">
                {im.state === "failed" && im.localId && files.current.has(im.localId) && (
                  <button type="button" className="link-btn" disabled={busy} onClick={() => { setBusy(true); send(im.localId!).finally(() => setBusy(false)); }}>ניסיון חוזר</button>
                )}
                {im.state !== "uploading" && (
                  <label className={`link-btn ${canPick ? "" : "disabled"}`}>
                    החלפה
                    <input type="file" accept={ACCEPT} hidden disabled={!canPick} onChange={(e) => { addFiles(e.target.files, k); e.target.value = ""; }} />
                  </label>
                )}
                {im.state !== "uploading" && (
                  <button type="button" className="link-btn" onClick={() => commit(latest.current.filter((_, j) => j !== k))}>הסרה</button>
                )}
              </div>
              {im.state === "failed" && (
                <small className="error">{(im.localId && failMsg[im.localId]) || "ההעלאה לא הושלמה. יש לבחור את התמונה שוב (החלפה)"}</small>
              )}
            </li>
          ))}
        </ul>
      )}
      {!rights && (
        <label className="check">
          <input type="checkbox" checked={rights} onChange={(e) => confirmRights(e.target.checked)} />
          <span>יש לי זכות להשתמש בתמונות, והן ישמשו רק להכנת ההזמנה</span>
        </label>
      )}
      {images.length < max && (
        <label className={`upload-btn ${canPick ? "" : "disabled"}`} aria-describedby={error ? `${id}-err` : undefined}>
          {busy ? "מעלה את התמונה…" : images.length ? "הוספת תמונה" : max > 1 ? "בחירת תמונות" : "בחירת תמונה"}
          <input type="file" accept={ACCEPT} multiple={max > 1} hidden disabled={!canPick}
            onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
        </label>
      )}
      {!rights && <small className="muted">כדי לבחור תמונות יש לסמן את האישור.</small>}
      {warn && <p className="warn">{warn}</p>}
      {msg && <p className="error" role="alert">{msg}</p>}
      {error && <p className="error" id={`${id}-err`}>{error}</p>}
    </div>
  );
}
