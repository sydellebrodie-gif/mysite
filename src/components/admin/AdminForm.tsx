"use client";
// טופס ניהול עצמאי: כל חלק נשמר בנפרד, עם כפתור שמירה והודעה משלו.
import { startTransition, useActionState, useEffect, useRef } from "react";

export interface ActionResult { ok: boolean; msg: string; at: number }
type Action = (prev: ActionResult, fd: FormData) => Promise<ActionResult>;

function Submit({ label, danger, pending }: { label: string; danger?: boolean; pending: boolean }) {
  return (
    <button className={`btn small ${danger ? "danger" : ""}`} type="submit" disabled={pending}>
      {pending ? "שומרת…" : label}
    </button>
  );
}

export default function AdminForm({
  action, children, submit = "שמירה", className = "", danger = false, confirm, resetOnSuccess = false, hidden,
}: {
  action: Action; children?: React.ReactNode; submit?: string; className?: string; danger?: boolean;
  /** שאלה לאישור לפני שליחה (למחיקה) */ confirm?: string; resetOnSuccess?: boolean;
  hidden?: Record<string, string>;
}) {
  const [state, run, pending] = useActionState(action, { ok: true, msg: "", at: 0 });
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state.ok && state.at && resetOnSuccess) ref.current?.reset(); }, [state, resetOnSuccess]);
  return (
    // onSubmit ולא action: כך הטופס לא מתאפס אחרי שליחה, ומה שהוקלד נשאר גם כשיש שגיאה
    <form ref={ref} className={`admin-form ${className}`} noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (pending || (confirm && !window.confirm(confirm))) return;
        const fd = new FormData(e.currentTarget);
        startTransition(() => run(fd));
      }}>
      {hidden && Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      {children}
      <div className="admin-form-foot">
        <Submit label={submit} danger={danger} pending={pending} />
        {state.at > 0 && (
          <span key={state.at} data-at={state.at} className={state.ok ? "saved" : "error"} role={state.ok ? "status" : "alert"}>
            {state.ok ? `✓ ${state.msg}` : state.msg}
          </span>
        )}
      </div>
    </form>
  );
}
