-- Catalog details from the owner's product sheet (2026-11-18):
--   * product codes (P01...), shared stock, availability toggle, multi-buy deals
--   * design options per product ("עיצוב קיים" / "תמונה וכיתוב" ...) and fields per option
--   * fixed designs to choose from (images uploaded later from the admin)
--   * base costs in an ADMIN-ONLY table (never readable by anon, never seeded from the repo)
--   * business-day delivery times in settings

-- ---------- Products ----------
alter table public.products
  add column code text unique,
  add column stock_mode text not null default 'plenty' check (stock_mode in ('counted','plenty')),
  add column stock_qty int check (stock_qty is null or stock_qty >= 0),
  add column is_available boolean not null default true,
  add column deal_qty int check (deal_qty is null or deal_qty >= 2),
  add column deal_price_agorot int check (deal_price_agorot is null or deal_price_agorot >= 0),
  add constraint products_deal_pair check ((deal_qty is null) = (deal_price_agorot is null)),
  add constraint products_counted_qty check (stock_mode <> 'counted' or stock_qty is not null);

alter table public.bundle_templates add column code text unique;

-- ---------- Design options ----------
create table public.product_design_options (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  key text not null,
  label text not null,
  help_text text not null default '',
  sort_order int not null default 0,
  unique (product_id, key)
);

alter table public.customization_fields
  add column design_option_key text,          -- null = shown for every design option
  add column max_words int check (max_words is null or max_words > 0);
alter table public.customization_fields drop constraint customization_fields_type_check;
alter table public.customization_fields
  add constraint customization_fields_type_check check (type in ('text','textarea','image','select','design'));

-- ---------- Fixed designs (e.g. towel sentences, lipstick-holder designs) ----------
create table public.product_designs (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  name text not null,
  image_path text,                             -- PUBLIC product-images bucket
  is_active boolean not null default true,
  sort_order int not null default 0
);

-- ---------- Costs: admin only ----------
create table public.product_costs (
  product_id uuid primary key references public.products(id) on delete cascade,
  base_cost_agorot int not null check (base_cost_agorot >= 0),
  note text not null default '',
  updated_at timestamptz not null default now()
);

-- ---------- Settings ----------
alter table public.shop_settings
  add column pickup_business_days int not null default 5 check (pickup_business_days >= 0),
  add column courier_business_days int not null default 10 check (courier_business_days >= 0),
  add column pickup_city text not null default 'נתניה';

-- ---------- RLS ----------
do $$
declare t text;
begin
  foreach t in array array['product_design_options','product_designs','product_costs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t || '_admin_all', t);
  end loop;
end $$;

create policy design_options_public_read on public.product_design_options
  for select to anon, authenticated
  using (exists (select 1 from public.products p where p.id = product_id and p.is_active));
create policy designs_public_read on public.product_designs
  for select to anon, authenticated
  using (is_active and exists (select 1 from public.products p where p.id = product_id and p.is_active));
-- product_costs: NO public policy.

revoke all on public.product_design_options, public.product_designs, public.product_costs from anon;
grant select on public.product_design_options, public.product_designs to anon;
