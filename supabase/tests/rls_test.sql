-- RLS tests with FAKE data only. Run: see supabase/README.md
\set ON_ERROR_STOP on
-- seed as superuser (acts like service role)
insert into public.admins values ('00000000-0000-0000-0000-00000000000a');
insert into public.products (name, slug, base_price_agorot, is_active) values
  ('כוס בדיקה', 'test-mug', 4990, true), ('מוצר מוסתר', 'hidden', 1000, false);
insert into public.bundle_templates (name, slug, type, fixed_price_agorot, is_active)
  values ('מארז בדיקה', 'test-bundle', 'fixed', 12000, true);
insert into public.orders (customer_name, customer_phone, customer_email, delivery_method,
  items_total_agorot, total_agorot, payment_provider, payment_ref, paid_at)
  values ('לקוחה בדויה', '050-0000000', 'fake@example.test', 'pickup', 4990, 4990, 'mock', 'tx-1', now());
insert into public.order_lines (order_id, kind, product_id, name_snapshot, unit_price_agorot, line_total_agorot)
  select id, 'product', (select id from products where slug='test-mug'), 'כוס בדיקה', 4990, 4990 from orders;
insert into storage.objects (bucket_id, name) values ('customer-uploads', 'x.jpg');

create temp table results (name text, pass boolean);
grant all on results to anon, authenticated;

-- 1. anon sees only active products
set role anon;
insert into results select 'anon sees 1 active product', (select count(*) from public.products) = 1;
insert into results select 'anon sees 0 customer files', (select count(*) from storage.objects) = 0;
reset role;
-- anon cannot read orders at all (no grant)
do $$ begin
  set local role anon;
  begin perform 1 from public.orders; insert into results values ('anon orders blocked', false);
  exception when insufficient_privilege then insert into results values ('anon orders blocked', true); end;
end $$;
do $$ begin
  set local role anon;
  begin insert into public.products(name, slug, base_price_agorot) values ('x','x',1);
    insert into results values ('anon cannot insert product', false);
  exception when insufficient_privilege then insert into results values ('anon cannot insert product', true); end;
end $$;

-- 2. admin WITHOUT MFA (aal1) = not admin
set request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","aal":"aal1"}';
set role authenticated;
insert into results select 'admin aal1 sees 0 orders', (select count(*) from public.orders) = 0;
insert into results select 'admin aal1 sees 0 customer files', (select count(*) from storage.objects) = 0;
reset role;

-- 3. admin with MFA sees everything
set request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","aal":"aal2"}';
set role authenticated;
insert into results select 'admin aal2 sees order', (select count(*) from public.orders) = 1;
insert into results select 'admin aal2 sees hidden product', (select count(*) from public.products) = 2;
insert into results select 'admin aal2 sees customer file', (select count(*) from storage.objects) = 1;
update public.orders set status = 'in_production';
insert into results select 'status history logged', (select count(*) from public.order_status_history) = 2;
reset role;

-- 4. other logged-in user with MFA but not in admins
set request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","aal":"aal2"}';
set role authenticated;
insert into results select 'non-admin sees 0 orders', (select count(*) from public.orders) = 0;
reset role;

-- 5. idempotency: same transaction twice is rejected
do $$ begin
  insert into public.orders (customer_name, customer_phone, customer_email, delivery_method,
    items_total_agorot, total_agorot, payment_provider, payment_ref)
    values ('x','x','x','pickup',1,1,'mock','tx-1');
  insert into results values ('duplicate payment rejected', false);
exception when unique_violation then insert into results values ('duplicate payment rejected', true); end $$;

-- 6. constraints
do $$ begin
  insert into public.orders (customer_name, customer_phone, customer_email, delivery_method,
    items_total_agorot, total_agorot, payment_provider, payment_ref)
    values ('x','x','x','courier',1,1,'mock','tx-2');
  insert into results values ('courier requires address', false);
exception when check_violation then insert into results values ('courier requires address', true); end $$;
do $$ begin
  insert into public.orders (customer_name, customer_phone, customer_email, delivery_method,
    items_total_agorot, delivery_fee_agorot, total_agorot, payment_provider, payment_ref)
    values ('x','x','x','pickup',100,0,999,'mock','tx-3');
  insert into results values ('wrong total rejected', false);
exception when check_violation then insert into results values ('wrong total rejected', true); end $$;
do $$ begin
  insert into public.uploads (storage_path, mime_type, size_bytes, rights_confirmed)
    values ('a', 'application/pdf', 10, true);
  insert into results values ('non-image upload rejected', false);
exception when check_violation then insert into results values ('non-image upload rejected', true); end $$;
do $$ begin
  insert into public.uploads (storage_path, mime_type, size_bytes, rights_confirmed)
    values ('b', 'image/jpeg', 10, false);
  insert into results values ('upload requires rights consent', false);
exception when check_violation then insert into results values ('upload requires rights consent', true); end $$;
do $$ begin
  delete from public.products where slug = 'test-mug';
  insert into results values ('ordered product cannot be deleted', false);
exception when foreign_key_violation then insert into results values ('ordered product cannot be deleted', true); end $$;

select case when pass then 'PASS' else 'FAIL' end as result, name from results;
select count(*) filter (where not pass) as failures, count(*) as total from results;
