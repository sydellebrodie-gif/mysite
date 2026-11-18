import type { Metadata } from "next";
import LoginClient from "./LoginClient";
import { adminAuthConfigured } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "כניסה לניהול", robots: { index: false, follow: false } };

export default function LoginPage() {
  return (
    <main className="admin-login">
      <h1>כניסה לניהול</h1>
      {adminAuthConfigured() ? <LoginClient /> : (
        <p className="notice">ממשק הניהול יפעל אחרי חיבור Supabase (משתני הסביבה של האתר).</p>
      )}
    </main>
  );
}
