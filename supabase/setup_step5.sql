-- שלב 5 של ההקמה: הנחת כמות 10% מ־3 מוצרים, ומלאי 20 לכל מוצר שלא נספר עד עכשיו (מיגרציה 007).
-- מדביקים ב־Supabase → SQL Editor → Run. פעם אחת, אחרי שלב 4. בטוח גם להריץ שוב.
begin;
-- Owner answers (2026-11-20):
--   * quantity discount: 10% from 3 products (units outside fixed bundles). No stacking with a product's
--     multi-buy deal: per product, the better of the two applies (src/lib/pricing.ts).
--   * stock: every product that was "plenty" (no count) now counts stock, starting at 20.
-- Idempotent: the stock update only touches products still marked 'plenty'.

alter table public.shop_settings
  add column if not exists quantity_discount_min_units int not null default 3
    check (quantity_discount_min_units >= 1),
  add column if not exists quantity_discount_percent int not null default 10
    check (quantity_discount_percent between 0 and 50);

update public.products set stock_mode = 'counted', stock_qty = 20 where stock_mode = 'plenty';
select 'שלב 5 הוחל בהצלחה' as result;
commit;
