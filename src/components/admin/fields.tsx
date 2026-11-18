// שדות טופס קטנים לממשק הניהול (בלי state: ערך התחלתי מהמסד, השמירה בטופס).
import { useId } from "react";

type Base = { name: string; label: string; help?: string };
const Help = ({ id, help }: { id: string; help?: string }) => (help ? <small id={`${id}-h`} className="muted">{help}</small> : null);

export function Text({ name, label, help, defaultValue, required, ltr, max = 200, placeholder }: Base & {
  defaultValue?: string | null; required?: boolean; ltr?: boolean; max?: number; placeholder?: string;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} name={name} defaultValue={defaultValue ?? ""} required={required} maxLength={max}
        dir={ltr ? "ltr" : undefined} placeholder={placeholder} aria-describedby={help ? `${id}-h` : undefined} />
      <Help id={id} help={help} />
    </div>
  );
}
export function Area({ name, label, help, defaultValue, rows = 3, max = 2000 }: Base & { defaultValue?: string | null; rows?: number; max?: number }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <textarea id={id} name={name} defaultValue={defaultValue ?? ""} rows={rows} maxLength={max} aria-describedby={help ? `${id}-h` : undefined} />
      <Help id={id} help={help} />
    </div>
  );
}
export function Num({ name, label, help, defaultValue, min = 0, optional }: Base & { defaultValue?: number | null; min?: number; optional?: boolean }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} name={name} type="number" inputMode="numeric" min={min} step={1} defaultValue={defaultValue ?? ""}
        required={!optional} className="num" dir="ltr" aria-describedby={help ? `${id}-h` : undefined} />
      <Help id={id} help={help} />
    </div>
  );
}
export function Money({ name, label, help, agorot, optional }: Base & { agorot?: number | null; optional?: boolean }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label} (₪)</label>
      <input id={id} name={name} inputMode="decimal" defaultValue={agorot == null ? "" : String(agorot / 100)}
        required={!optional} className="num" dir="ltr" aria-describedby={help ? `${id}-h` : undefined} />
      <Help id={id} help={help} />
    </div>
  );
}
export function Check({ name, label, help, defaultChecked }: Base & { defaultChecked?: boolean }) {
  return (
    <label className="check">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} />
      <span>{label}{help && <small className="muted"> {help}</small>}</span>
    </label>
  );
}
export function Select({ name, label, help, defaultValue, options }: Base & {
  defaultValue?: string | null; options: { value: string; label: string }[];
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} name={name} defaultValue={defaultValue ?? ""} aria-describedby={help ? `${id}-h` : undefined}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <Help id={id} help={help} />
    </div>
  );
}
