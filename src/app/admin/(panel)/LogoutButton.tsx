"use client";
import { browserClient } from "@/lib/supabase/browser";

export default function LogoutButton() {
  return (
    <button type="button" className="link-btn" onClick={async () => {
      await browserClient().auth.signOut();
      window.location.href = "/admin/login";
    }}>יציאה</button>
  );
}
