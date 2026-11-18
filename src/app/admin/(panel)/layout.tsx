import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import LogoutButton from "./LogoutButton";

export const metadata: Metadata = { title: "ניהול", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireAdmin();
  return (
    <div className="admin">
      <header className="admin-bar">
        <nav aria-label="ניהול">
          <Link href="/admin">הזמנות</Link>
          <Link href="/admin/products">מוצרים</Link>
          <Link href="/admin/bundles">מארזים</Link>
          <Link href="/admin/categories">קטגוריות</Link>
          <Link href="/admin/settings">הגדרות</Link>
        </nav>
        <div className="admin-user">
          <span className="muted ltr">{user.email}</span>
          <Link href="/" target="_blank">לאתר ↗</Link>
          <LogoutButton />
        </div>
      </header>
      <main id="main" className="admin-main">{children}</main>
    </div>
  );
}
