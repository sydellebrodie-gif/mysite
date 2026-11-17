-- Owner answers (2026-11-19) + customer photo upload tracking (stage 4c).
--   * packaging: +10 ILS per bundle (fixed or free), shown as its own line
--   * free bundle: at least 3 items
--   * wooden keychain (P14): 10 in stock, on sale
--   * uploads: verified_at (file checked on the server by its content), client_hash (rate limit, no raw IP)
-- Idempotent: safe on a DB that already has the new seed values.

alter table public.shop_settings
  add column if not exists bundle_packaging_agorot int not null default 1000
    check (bundle_packaging_agorot >= 0);

update public.bundle_templates set min_items = 3 where code = 'BFREE';
update public.products set is_available = true, stock_mode = 'counted', stock_qty = 10 where code = 'P14';

alter table public.uploads
  add column if not exists verified_at timestamptz,
  add column if not exists client_hash text;
create index if not exists uploads_client_idx on public.uploads(client_hash, created_at);

update public.bundle_templates
  set description = 'בוחרים מוצרים וכמויות, גם אותו מוצר עם תמונות שונות, והכול נארז יחד. המחיר הוא סכום המוצרים, ועוד אריזה.'
  where code = 'BFREE';
