import Header from "@/components/Header";

export default function ShopLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <a href="#main" className="skip">דילוג לתוכן</a>
      <Header />
      <main id="main">{children}</main>
      <footer className="site-footer">
        <div className="container">
          <p>איסוף עצמי מנתניה בתיאום מראש, או משלוח עם שליח.</p>
        </div>
      </footer>
    </>
  );
}
