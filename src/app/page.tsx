// הקטלוג מתרענן מהמסד כל דקה, כך ששינויים בניהול מופיעים בלי פריסה מחדש
export const revalidate = 60;

import Link from "next/link";
import { getCatalog } from "@/lib/catalog";
import ProductCard, { Thumb } from "@/components/ProductCard";
import { formatILS } from "@/lib/format";
import { bundleRegularPrice } from "@/lib/pricing";

export default async function Home() {
  const cat = await getCatalog();
  const fixed = cat.bundles.filter((b) => b.type === "fixed");
  const free = cat.bundles.find((b) => b.type === "free");
  const s = cat.settings;

  return (
    <div className="container">
      <section className="hero">
        <h1>מתנות בעיצוב אישי</h1>
        <p>ספלים, מעמדי תמונה, מדבקות, שוקולדים ועוד, עם התמונות והמילים שלכם.</p>
        <div className="hero-actions">
          <Link className="btn" href="#bundles">למארזים</Link>
          <Link className="btn secondary" href="#products">לכל המוצרים</Link>
        </div>
      </section>

      <section id="bundles" aria-labelledby="bundles-h">
        <h2 id="bundles-h">מארזים</h2>
        <div className="grid">
          {fixed.map((b) => {
            const regular = bundleRegularPrice(b, cat);
            return (
              <Link key={b.id} href={`/bundles/${b.slug}`} className="card">
                <Thumb src={b.images[0]} title={b.name} />
                <div className="card-body">
                  <h3>{b.name}</h3>
                  <p className="card-desc">{b.description}</p>
                  <p className="price">
                    {formatILS(b.priceAgorot ?? 0)}{" "}
                    {regular > (b.priceAgorot ?? 0) && <s className="muted">{formatILS(regular)}</s>}
                  </p>
                </div>
              </Link>
            );
          })}
          {free && (
            <Link href="/bundles/build" className="card card-build">
              <div className="card-img placeholder" aria-hidden="true">+</div>
              <div className="card-body">
                <h3>{free.name}</h3>
                <p className="card-desc">{free.description}</p>
              </div>
            </Link>
          )}
        </div>
      </section>

      <section id="products" aria-labelledby="products-h">
        <h2 id="products-h">מוצרים</h2>
        {cat.categories.map((c) => {
          const items = cat.products.filter((p) => p.categorySlug === c.slug);
          if (!items.length) return null;
          return (
            <div key={c.slug} className="category">
              <h3 className="category-title">{c.name}</h3>
              <div className="grid">{items.map((p) => <ProductCard key={p.id} p={p} />)}</div>
            </div>
          );
        })}
      </section>

      <section className="how" aria-labelledby="how-h">
        <h2 id="how-h">איך מזמינים</h2>
        <ol>
          <li>בוחרים מוצר או מארז, ואת סוג העיצוב.</li>
          <li>מעלים תמונות וכותבים טקסט. אפשר גם לשלם עכשיו ולשלוח את התמונות אחר כך.</li>
          <li>בוחרים איסוף עצמי מ{s.pickupCity} (חינם, בתיאום) או שליח ({formatILS(s.courierFeeAgorot)}), ומשלמים.</li>
        </ol>
        <p className="muted">
          זמני הכנה: איסוף עצמי עד {s.pickupBusinessDays} ימי עסקים. משלוח עד {s.courierBusinessDays} ימי עסקים, כולל ההכנה.
        </p>
      </section>
      {cat.source === "seed" && <p className="dev-note">מצב פיתוח: הקטלוג נטען מנתוני ההתחלה ולא ממסד הנתונים.</p>}
    </div>
  );
}
