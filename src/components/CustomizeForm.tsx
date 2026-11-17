"use client";
// טופס התאמה אישית למוצר אחד (גם בתוך מארז). כל השדות נגזרים מהגדרות המוצר, בלי קוד ייעודי למוצר.
import { useState } from "react";
import type { CustomField, Customization, ImageRef, Product } from "@/lib/types";
import { activeFields, countWords, needsImages, NOTE_MAX, type FieldErrors } from "@/lib/customization";
import { ACCEPT, ImageError, readImage } from "@/lib/images";

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

function ImageField({ f, images, onChange, error, id }: {
  f: CustomField; images: ImageRef[]; onChange: (imgs: ImageRef[]) => void; error?: string; id: string;
}) {
  const max = f.maxImages ?? 1;
  const [msg, setMsg] = useState<string | null>(null);
  const [warn, setWarn] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function addFiles(files: FileList | null, replaceAt?: number) {
    if (!files?.length) return;
    setMsg(null); setWarn(null); setBusy(true);
    const next = [...images];
    try {
      for (const file of Array.from(files)) {
        if (replaceAt === undefined && next.length >= max) { setMsg(`אפשר עד ${max} תמונות`); break; }
        const r = await readImage(file);
        const ref: ImageRef = { name: r.name, width: r.width, height: r.height, thumb: r.thumb };
        if (replaceAt !== undefined) next[replaceAt] = ref; else next.push(ref);
        if (r.lowRes) setWarn("התמונה ברזולוציה נמוכה ועלולה לצאת מטושטשת. אפשר להמשיך, אבל מומלץ תמונה מקורית מהטלפון.");
        if (r.noPreview) setWarn("קובץ HEIC התקבל. הדפדפן הזה לא מציג לו תצוגה מקדימה, אבל הוא יישמר כמו שהוא.");
      }
      onChange(next);
    } catch (e) {
      setMsg(e instanceof ImageError ? e.message : "משהו השתבש בקריאת התמונה. נסו שוב");
    } finally { setBusy(false); }
  }

  return (
    <div className="field">
      <span className="label" id={`${id}-label`}>{f.label} {f.required && <span className="req">*</span>}</span>
      {f.help && <small id={`${id}-help`} className="help">{f.help}</small>}
      {images.length > 0 && (
        <ul className="thumbs">
          {images.map((im, k) => (
            <li key={k}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {im.thumb ? <img src={im.thumb} alt={`תמונה ${k + 1}`} /> : <span className="thumb-ph">{im.name.split(".").pop()?.toUpperCase()}</span>}
              <div className="thumb-actions">
                <label className="link-btn">
                  החלפה
                  <input type="file" accept={ACCEPT} hidden onChange={(e) => { addFiles(e.target.files, k); e.target.value = ""; }} />
                </label>
                <button type="button" className="link-btn" onClick={() => onChange(images.filter((_, j) => j !== k))}>הסרה</button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {images.length < max && (
        <label className="upload-btn" aria-describedby={error ? `${id}-err` : undefined}>
          {busy ? "קוראת את התמונה…" : images.length ? "הוספת תמונה" : max > 1 ? "בחירת תמונות" : "בחירת תמונה"}
          <input type="file" accept={ACCEPT} multiple={max > 1} hidden disabled={busy}
            onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
        </label>
      )}
      {warn && <p className="warn">{warn}</p>}
      {msg && <p className="error" role="alert">{msg}</p>}
      {error && <p className="error" id={`${id}-err`}>{error}</p>}
    </div>
  );
}
