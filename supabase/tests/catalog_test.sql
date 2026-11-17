-- Run AFTER migrations 003+004 on an otherwise empty DB (no rls_test data).
-- Checks: seeded catalog is visible to anon, costs are admin-only.
create temp table cresults (name text, pass boolean);
grant all on cresults to anon, authenticated;
insert into public.product_costs (product_id, base_cost_agorot)
  select id, 123 from public.products where code = 'P01';

set request.jwt.claims = '{}';
set role anon;
insert into cresults select 'anon sees 14 products', (select count(*) from public.products) = 14;
insert into cresults select 'anon sees 8 bundles', (select count(*) from public.bundle_templates) = 8;
insert into cresults select 'anon sees design options', (select count(*) from public.product_design_options) > 0;
do $$ begin
  perform 1 from public.product_costs;
  insert into cresults values ('anon cannot read costs', false);
exception when insufficient_privilege then insert into cresults values ('anon cannot read costs', true); end $$;
reset role;

set request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","aal":"aal2"}';
set role authenticated;
insert into cresults select 'non-admin sees 0 costs', (select count(*) from public.product_costs) = 0;
reset role;

do $$ begin
  update public.products set deal_qty = 2 where code = 'P01';
  insert into cresults values ('deal needs both qty and price', false);
exception when check_violation then insert into cresults values ('deal needs both qty and price', true); end $$;

select case when pass then 'PASS' else 'FAIL' end as result, name from cresults;
select count(*) filter (where not pass) as failures, count(*) as total from cresults;
