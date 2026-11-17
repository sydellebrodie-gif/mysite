-- Core schema: catalog, bundles, uploads, orders.
-- Principles (docs/architecture.md):
--   * RLS on every table. Anonymous visitors can only READ the active catalog.
--   * Orders, customers and uploads are never readable by anon; the server uses the service role.
--   * Admin = listed in public.admins AND signed in with MFA (aal2).
--   * Prices are stored in agorot (integer) to avoid rounding errors.

create extension if not exists pgcrypto;

-- ---------- Admins ----------
create table public.admins (
  user_id uuid primary key,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.admins a where a.user_id = auth.uid())
     and coalesce(auth.jwt() ->> 'aal', '') = 'aal2';
$$;

create policy admins_self_read on public.admins
  for select to authenticated using (user_id = auth.uid());

-- ---------- Catalog ----------
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  parent_id uuid references public.categories(id) on delete restrict,
  sort_order int not null default 0,
  is_active boolean not null default true
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text not null default '',
  images text[] not null default '{}',          -- paths in the PUBLIC product-images bucket
  base_price_agorot int not null check (base_price_agorot >= 0),
  prep_days int not null default 3 check (prep_days >= 0),
  is_active boolean not null default false,       -- new products start hidden
  allowed_in_bundles boolean not null default true,
  capacity_units int not null default 1 check (capacity_units >= 0),
  print_area_cm jsonb,                            -- {"w": 20, "h": 9}
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.product_categories (
  product_id uuid not null references public.products(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  primary key (product_id, category_id)
);

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  option_values jsonb not null default '{}',      -- {"size": "330ml", "color": "לבן"}
  price_delta_agorot int not null default 0,
  is_available boolean not null default true,
  sort_order int not null default 0
);

create table public.customization_fields (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  key text not null,
  label text not null,
  type text not null check (type in ('text','textarea','image','select')),
  required boolean not null default false,
  max_length int check (max_length is null or max_length > 0),
  options text[] not null default '{}',
  help_text text not null default '',
  min_images int not null default 0 check (min_images >= 0),
  max_images int not null default 1 check (max_images >= 0),
  sort_order int not null default 0,
  unique (product_id, key),
  check (type <> 'select' or cardinality(options) > 0),
  check (min_images <= max_images)
);

-- ---------- Bundles ----------
create table public.packaging (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  price_agorot int not null default 0 check (price_agorot >= 0),
  capacity_units int not null default 0 check (capacity_units >= 0),
  is_active boolean not null default true
);

create table public.bundle_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text not null default '',
  images text[] not null default '{}',
  type text not null check (type in ('fixed','budget','free')),
  -- fixed: price of the whole bundle; budget/free: null (sum of items)
  fixed_price_agorot int check (fixed_price_agorot is null or fixed_price_agorot >= 0),
  budget_options_agorot int[] not null default '{}',   -- budget bundles: amounts to choose from
  allow_under_budget boolean not null default true,
  min_items int not null default 1 check (min_items >= 0),
  max_items int check (max_items is null or max_items >= min_items),
  is_active boolean not null default false,
  sort_order int not null default 0,
  check (type <> 'fixed' or fixed_price_agorot is not null),
  check (type <> 'budget' or cardinality(budget_options_agorot) > 0)
);

create table public.bundle_template_packaging (
  bundle_template_id uuid not null references public.bundle_templates(id) on delete cascade,
  packaging_id uuid not null references public.packaging(id) on delete restrict,
  primary key (bundle_template_id, packaging_id)
);

create table public.fixed_bundle_items (
  id uuid primary key default gen_random_uuid(),
  bundle_template_id uuid not null references public.bundle_templates(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  variant_id uuid references public.product_variants(id) on delete restrict,
  quantity int not null default 1 check (quantity > 0)
);

-- Empty = every product with allowed_in_bundles may be chosen.
create table public.bundle_allowed_products (
  bundle_template_id uuid not null references public.bundle_templates(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  primary key (bundle_template_id, product_id)
);

-- ---------- Settings (single row) ----------
create table public.shop_settings (
  id boolean primary key default true check (id),
  courier_fee_agorot int not null default 4000,
  pickup_enabled boolean not null default true,
  courier_enabled boolean not null default true,
  temp_upload_hours int not null default 48,
  reminder_undownloaded_days int not null default 14,   -- X (assumption, open issue)
  delete_after_delivered_days int not null default 90   -- Y (assumption, open issue)
);
insert into public.shop_settings default values;

-- ---------- Orders ----------
create sequence public.order_number_seq start 1001;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number int not null unique default nextval('public.order_number_seq'),
  status text not null default 'new'
    check (status in ('new','in_production','ready','shipped','picked_up','cancelled')),
  needs_attention boolean not null default false,
  awaiting_materials boolean not null default false,
  internal_note text not null default '',
  customer_name text not null,
  customer_phone text not null,
  customer_email text not null,
  customer_note text not null default '',
  delivery_method text not null check (delivery_method in ('pickup','courier')),
  delivery_address jsonb,                          -- only for courier
  items_total_agorot int not null check (items_total_agorot >= 0),
  packaging_total_agorot int not null default 0 check (packaging_total_agorot >= 0),
  delivery_fee_agorot int not null default 0 check (delivery_fee_agorot >= 0),
  discount_agorot int not null default 0 check (discount_agorot >= 0),
  total_agorot int not null check (total_agorot >= 0),
  payment_provider text not null,
  payment_ref text not null,
  payment_status text not null default 'paid',
  receipt_provider text,
  receipt_ref text,
  receipt_url text,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  delivered_at timestamptz,
  unique (payment_provider, payment_ref),          -- idempotency: one order per transaction
  check (delivery_method <> 'courier' or delivery_address is not null),
  check (total_agorot = items_total_agorot + packaging_total_agorot + delivery_fee_agorot - discount_agorot)
);

create table public.order_lines (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  parent_line_id uuid references public.order_lines(id) on delete cascade,
  kind text not null check (kind in ('product','bundle')),
  -- restrict: a product/bundle that was ever ordered is deactivated, never deleted
  product_id uuid references public.products(id) on delete restrict,
  bundle_template_id uuid references public.bundle_templates(id) on delete restrict,
  variant_id uuid references public.product_variants(id) on delete restrict,
  name_snapshot text not null,
  options_snapshot jsonb not null default '{}',
  quantity int not null default 1 check (quantity > 0),
  customization jsonb not null default '{}',       -- {field_key: text} or {field_key: [upload_id]}
  packaging_id uuid references public.packaging(id) on delete set null,
  unit_price_agorot int not null check (unit_price_agorot >= 0),
  line_total_agorot int not null check (line_total_agorot >= 0),
  awaiting_upload boolean not null default false,
  sort_order int not null default 0,
  check (kind <> 'product' or product_id is not null),
  check (kind <> 'bundle' or bundle_template_id is not null),
  check (kind <> 'bundle' or parent_line_id is null)
);
create index order_lines_order_idx on public.order_lines(order_id);

create table public.order_status_history (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  from_status text,
  to_status text not null,
  at timestamptz not null default now(),
  by_user uuid
);

-- Personal upload link for items paid without a photo. Only the SHA-256 of the token is stored.
create table public.upload_tokens (
  id uuid primary key default gen_random_uuid(),
  order_line_id uuid not null references public.order_lines(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------- Uploads (customer photos) ----------
create table public.uploads (
  id uuid primary key default gen_random_uuid(),
  storage_path text not null unique,               -- private bucket, random name
  preview_path text,                               -- EXIF-stripped, downscaled
  original_filename text,                          -- kept only for the admin download name
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/heic','image/heif','image/webp')),
  size_bytes bigint not null check (size_bytes > 0),
  width_px int,
  height_px int,
  status text not null default 'temp' check (status in ('temp','attached','deleted')),
  order_line_id uuid references public.order_lines(id) on delete set null,
  rights_confirmed boolean not null,               -- "I have the right to use this photo"
  created_at timestamptz not null default now(),
  attached_at timestamptz,
  downloaded_at timestamptz,
  deleted_at timestamptz,
  deleted_reason text check (deleted_reason in ('owner_confirmed','temp_expired','retention')),
  check (rights_confirmed),
  check (status <> 'attached' or order_line_id is not null),
  check ((status = 'deleted') = (deleted_at is not null))
);
create index uploads_status_idx on public.uploads(status, created_at);

-- ---------- Payment events (raw webhook log, for audit and dedupe) ----------
create table public.payment_events (
  id bigint generated always as identity primary key,
  provider text not null,
  provider_ref text not null,
  verified boolean not null,
  received_at timestamptz not null default now(),
  payload jsonb not null,
  unique (provider, provider_ref)
);

-- ---------- Access log (downloads and deletions of customer files) ----------
create table public.access_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  user_id uuid,
  action text not null check (action in ('preview','download','delete','status_change','export')),
  upload_id uuid,
  order_id uuid,
  detail text not null default ''
);

-- ---------- updated_at ----------
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
create trigger products_touch before update on public.products
  for each row execute function public.touch_updated_at();

-- ---------- Status history trigger ----------
create or replace function public.log_order_status() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.order_status_history(order_id, from_status, to_status, by_user)
    values (new.id, null, new.status, auth.uid());
  elsif new.status is distinct from old.status then
    insert into public.order_status_history(order_id, from_status, to_status, by_user)
    values (new.id, old.status, new.status, auth.uid());
  end if;
  return new;
end $$;
create trigger orders_status_log after insert or update of status on public.orders
  for each row execute function public.log_order_status();

-- ---------- RLS ----------
do $$
declare t text;
begin
  foreach t in array array[
    'categories','products','product_categories','product_variants','customization_fields',
    'packaging','bundle_templates','bundle_template_packaging','fixed_bundle_items',
    'bundle_allowed_products','shop_settings','orders','order_lines','order_status_history',
    'upload_tokens','uploads','payment_events','access_log']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t || '_admin_all', t);
  end loop;
end $$;

-- Public (anon + authenticated) read of the ACTIVE catalog only.
create policy categories_public_read on public.categories
  for select to anon, authenticated using (is_active);
create policy products_public_read on public.products
  for select to anon, authenticated using (is_active);
create policy product_categories_public_read on public.product_categories
  for select to anon, authenticated
  using (exists (select 1 from public.products p where p.id = product_id and p.is_active));
create policy variants_public_read on public.product_variants
  for select to anon, authenticated
  using (exists (select 1 from public.products p where p.id = product_id and p.is_active));
create policy fields_public_read on public.customization_fields
  for select to anon, authenticated
  using (exists (select 1 from public.products p where p.id = product_id and p.is_active));
create policy packaging_public_read on public.packaging
  for select to anon, authenticated using (is_active);
create policy bundles_public_read on public.bundle_templates
  for select to anon, authenticated using (is_active);
create policy bundle_packaging_public_read on public.bundle_template_packaging
  for select to anon, authenticated
  using (exists (select 1 from public.bundle_templates b where b.id = bundle_template_id and b.is_active));
create policy fixed_items_public_read on public.fixed_bundle_items
  for select to anon, authenticated
  using (exists (select 1 from public.bundle_templates b where b.id = bundle_template_id and b.is_active));
create policy bundle_allowed_public_read on public.bundle_allowed_products
  for select to anon, authenticated
  using (exists (select 1 from public.bundle_templates b where b.id = bundle_template_id and b.is_active));
create policy settings_public_read on public.shop_settings
  for select to anon, authenticated using (true);

-- Orders, lines, uploads, tokens, payment events, logs: NO anon policy at all.
-- The server writes them with the service role (bypasses RLS) after validating input.

-- Least privilege for the API roles.
revoke all on all tables in schema public from anon;
grant select on public.categories, public.products, public.product_categories,
  public.product_variants, public.customization_fields, public.packaging,
  public.bundle_templates, public.bundle_template_packaging, public.fixed_bundle_items,
  public.bundle_allowed_products, public.shop_settings to anon;
revoke execute on function public.is_admin() from anon;
