"use client";
import Link from "next/link";
import { useCart } from "@/lib/cart";

export default function Header() {
  const c = useCart();
  const count = c?.lines.length ?? 0;
  return (
    <header className="site-header">
      <div className="container header-row">
        <Link href="/" className="logo">מתנות בעיצוב אישי</Link>
        <nav aria-label="ראשי" className="nav">
          <Link href="/#bundles">מארזים</Link>
          <Link href="/#products">מוצרים</Link>
          <Link href="/cart" className="cart-link" aria-label={`סל קניות, ${count} פריטים`}>
            סל <span className="badge ltr">{count}</span>
          </Link>
        </nav>
      </div>
    </header>
  );
}
