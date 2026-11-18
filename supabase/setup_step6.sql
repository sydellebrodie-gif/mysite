-- שלב 6 של ההקמה: ממשק הניהול (מיגרציה 008): סדר פריטים במארז, העלאת קובץ להזמנה מממשק הניהול, ויומן עריכות.
-- מדביקים ב־Supabase → SQL Editor → Run. פעם אחת, אחרי שלב 5. בטוח גם להריץ שוב.
begin;
-- Admin interface (stage 4f).
--   * fixed_bundle_items.sort_order: the order of items inside a fixed bundle is part of the bundle
--     (the customer fills the forms in this order). Existing rows keep their insertion order.
--   * The owner may upload a file for an order line (a photo sent later on WhatsApp/email):
--     admin insert on the private customer-uploads bucket.
--   * access_log: also 'upload' and 'edit' (who changed order details, and when).
-- Idempotent.

alter table public.fixed_bundle_items add column if not exists sort_order int not null default 0;
update public.fixed_bundle_items fi set sort_order = sub.rn
  from (select id, row_number() over (partition by bundle_template_id order by ctid) as rn
        from public.fixed_bundle_items) sub
  where fi.id = sub.id and fi.sort_order = 0;

drop policy if exists customer_uploads_admin_insert on storage.objects;
create policy customer_uploads_admin_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'customer-uploads' and public.is_admin());

alter table public.access_log drop constraint if exists access_log_action_check;
alter table public.access_log add constraint access_log_action_check
  check (action in ('preview','download','delete','status_change','export','upload','edit'));
select 'שלב 6 הוחל בהצלחה' as result;
commit;
