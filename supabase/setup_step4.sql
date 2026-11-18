-- שלב 4 של ההקמה: עד 5 עיצובים במארז "מדביקים חיוכים" (מיגרציה 006).
-- מדביקים ב־Supabase → SQL Editor → Run. פעם אחת, אחרי שלב 3. בטוח גם להריץ שוב.
begin;
-- Owner answer (2026-11-20): "מדביקים חיוכים" (B05, 10 sticker sheets) allows up to 5 different designs.
--   fixed_bundle_items.max_designs: how many different designs the units of this item may have.
--   null = one design per unit (the default for every other bundle).
-- Idempotent.

alter table public.fixed_bundle_items
  add column if not exists max_designs int check (max_designs is null or max_designs > 0);

update public.fixed_bundle_items fi set max_designs = 5
  from public.bundle_templates b
  where b.id = fi.bundle_template_id and b.code = 'B05';

update public.bundle_templates
  set description = '10 דפי מדבקות אישיים עמידים במים, בעד 5 עיצובים שונים.'
  where code = 'B05';
select 'שלב 4 הוחל בהצלחה' as result;
commit;
