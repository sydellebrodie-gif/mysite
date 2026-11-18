"use client";
// כניסה: סיסמה, ואז אימות דו־שלבי באפליקציית אימות (חובה). בפעם הראשונה: חיבור האפליקציה בסריקת קוד.
import { useEffect, useState } from "react";
import { browserClient } from "@/lib/supabase/browser";

type Step = "password" | "enroll" | "verify" | "denied" | "loading";

export default function LoginClient() {
  const [sb] = useState(browserClient);
  const [step, setStep] = useState<Step>("loading");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [factorId, setFactorId] = useState("");
  const [qr, setQr] = useState<{ svg: string; secret: string } | null>(null);

  async function nextAfterPassword() {
    const { data, error } = await sb.auth.mfa.listFactors();
    if (error) throw error;
    const verified = data.totp.find((f) => f.status === "verified");
    if (verified) { setFactorId(verified.id); setStep("verify"); return; }
    for (const f of data.all.filter((x) => x.status !== "verified")) await sb.auth.mfa.unenroll({ factorId: f.id });
    const en = await sb.auth.mfa.enroll({ factorType: "totp", friendlyName: `ניהול ${new Date().toISOString().slice(0, 10)}` });
    if (en.error) throw en.error;
    setFactorId(en.data.id);
    setQr({ svg: en.data.totp.qr_code, secret: en.data.totp.secret });
    setStep("enroll");
  }

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    (async () => {
      if (q.get("denied")) { setStep("denied"); return; }
      const { data } = await sb.auth.getUser();
      if (!data.user) { setStep("password"); return; }
      const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal?.currentLevel === "aal2") { window.location.href = "/admin"; return; }
      await nextAfterPassword().catch(() => setStep("password"));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function run(fn: () => Promise<void>) {
    setBusy(true); setError("");
    try { await fn(); } catch (e) {
      const m = (e as { message?: string; code?: string })?.message ?? "";
      setError(/credentials/i.test(m) ? "מייל או סיסמה שגויים"
        : /code|totp|verif/i.test(m) ? "הקוד שגוי או שפג תוקפו. יש להקליד את הקוד שמופיע עכשיו באפליקציה"
        : /rate|many/i.test(m) ? "יותר מדי ניסיונות. יש לחכות כמה דקות" : "הכניסה נכשלה. אפשר לנסות שוב");
    } finally { setBusy(false); }
  }

  const password = (fd: FormData) => run(async () => {
    const { error } = await sb.auth.signInWithPassword({ email: String(fd.get("email")), password: String(fd.get("password")) });
    if (error) throw error;
    await nextAfterPassword();
  });
  const verify = (fd: FormData) => run(async () => {
    const code = String(fd.get("code")).replace(/\s/g, "");
    const { error } = await sb.auth.mfa.challengeAndVerify({ factorId, code });
    if (error) throw error;
    window.location.href = "/admin";
  });
  const logout = () => run(async () => { await sb.auth.signOut(); setStep("password"); });

  if (step === "loading") return <p className="muted">טוען…</p>;
  if (step === "denied") return (
    <div>
      <p className="notice">החשבון הזה לא מורשה לניהול האתר.</p>
      <button className="btn secondary" onClick={logout}>יציאה</button>
    </div>
  );
  return (
    <div className="login-box">
      {step === "password" && (
        <form onSubmit={(e) => { e.preventDefault(); password(new FormData(e.currentTarget)); }}>
          <div className="field"><label htmlFor="email">מייל</label>
            <input id="email" name="email" type="email" autoComplete="username" required dir="ltr" /></div>
          <div className="field"><label htmlFor="password">סיסמה</label>
            <input id="password" name="password" type="password" autoComplete="current-password" required dir="ltr" /></div>
          <button className="btn" disabled={busy}>{busy ? "נכנסת…" : "כניסה"}</button>
        </form>
      )}
      {(step === "enroll" || step === "verify") && (
        <form onSubmit={(e) => { e.preventDefault(); verify(new FormData(e.currentTarget)); }}>
          {step === "enroll" && qr && (
            <div className="enroll">
              <p><strong>חיבור אפליקציית אימות (פעם אחת).</strong> פותחים במכשיר אפליקציה כמו Google Authenticator או Microsoft Authenticator, וסורקים את הקוד:</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr.svg} alt="קוד לסריקה באפליקציית האימות" width={200} height={200} className="qr" />
              <p className="muted">אי אפשר לסרוק? מקלידים באפליקציה את המפתח: <code dir="ltr">{qr.secret}</code></p>
            </div>
          )}
          <div className="field"><label htmlFor="code">הקוד מהאפליקציה (6 ספרות)</label>
            <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" required dir="ltr" autoFocus /></div>
          <button className="btn" disabled={busy}>{busy ? "בודקת…" : "אישור"}</button>
          <button type="button" className="link-btn" onClick={logout}>כניסה עם חשבון אחר</button>
        </form>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}
