import type { Metadata, Viewport } from "next";
import { Heebo } from "next/font/google";
import Header from "@/components/Header";
import "./globals.css";

const heebo = Heebo({ subsets: ["hebrew", "latin"], display: "swap" });

export const metadata: Metadata = {
  title: "מתנות בעיצוב אישי",
  description: "ספלים, מעמדי תמונה, מדבקות, מגבות ומארזי מתנה בעיצוב אישי",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="he" dir="rtl">
      <body className={heebo.className}>
        <a href="#main" className="skip">דילוג לתוכן</a>
        <Header />
        <main id="main">{children}</main>
        <footer className="site-footer">
          <div className="container">
            <p>איסוף עצמי מנתניה בתיאום מראש, או משלוח עם שליח.</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
