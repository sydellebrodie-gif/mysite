-- נתוני בדיקה לממשק הניהול (מומצאים בלבד): מנהלת, הזמנה עם ספל (2 תמונות) ומארז "כולו שלי".
insert into public.admins(user_id) values ('11111111-1111-4111-8111-111111111111') on conflict do nothing;

insert into public.orders (id, order_number, customer_name, customer_phone, customer_email, customer_note,
  delivery_method, delivery_address, items_total_agorot, packaging_total_agorot, delivery_fee_agorot, discount_agorot,
  total_agorot, payment_provider, payment_ref, paid_at)
values ('22222222-2222-4222-8222-222222222222', 5001, 'דנה בדיקה', '050-0000000', 'test@example.test', 'בבקשה לעטוף יפה',
  'courier', '{"city":"עיר בדיקה","street":"רחוב הבדיקה","house":"1","apartment":"","notes":""}', 15500, 1000, 4000, 650,
  19850, 'test', 'test-ref-1', now());

insert into public.order_lines (id, order_id, kind, product_id, name_snapshot, quantity, customization, unit_price_agorot, line_total_agorot, sort_order)
select '33333333-3333-4333-8333-333333333331', '22222222-2222-4222-8222-222222222222', 'product', id, name, 1,
  '{"option":"photo_text","values":{"caption":"לאמא באהבה"},"images":{"photos_photo_text":[{"uploadId":"44444444-4444-4444-8444-444444444441","name":"a.jpg"},{"uploadId":"44444444-4444-4444-8444-444444444442","name":"b.heic"}]},"sendLater":false,"note":""}',
  6500, 6500, 1 from public.products where code = 'P01';

insert into public.order_lines (id, order_id, kind, bundle_template_id, name_snapshot, quantity, unit_price_agorot, line_total_agorot, sort_order)
select '33333333-3333-4333-8333-333333333332', '22222222-2222-4222-8222-222222222222', 'bundle', id, name, 1, fixed_price_agorot, fixed_price_agorot, 2
from public.bundle_templates where code = 'B04';

insert into public.order_lines (id, order_id, parent_line_id, kind, product_id, name_snapshot, quantity, customization, unit_price_agorot, line_total_agorot, awaiting_upload, sort_order)
select ('33333333-3333-4333-8333-33333333333' || (2 + n))::uuid, '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333332',
  'product', p.id, p.name, 1,
  case when p.code = 'P10' then '{"option":null,"values":{},"images":{},"sendLater":true,"note":""}'::jsonb
       else '{"option":null,"values":{},"images":{},"sendLater":false,"note":"שם: נועה"}'::jsonb end,
  0, 0, p.code = 'P10', n
from (values ('P01', 1), ('P04', 2), ('P10', 3)) v(code, n) join public.products p on p.code = v.code;

insert into public.uploads (id, storage_path, preview_path, original_filename, mime_type, size_bytes, width_px, height_px, status, order_line_id, rights_confirmed, attached_at, verified_at)
values
  ('44444444-4444-4444-8444-444444444441', 'temp/2026-11/a.jpg', 'temp/2026-11/a-preview.jpg', 'a.jpg', 'image/jpeg', 1000, 2000, 1500, 'attached', '33333333-3333-4333-8333-333333333331', true, now(), now()),
  ('44444444-4444-4444-8444-444444444442', 'temp/2026-11/b.heic', 'temp/2026-11/b-preview.jpg', 'b.heic', 'image/heic', 1000, 3024, 4032, 'attached', '33333333-3333-4333-8333-333333333331', true, now(), now());

-- הזמנה נוספת שכבר נשלחה (לבדיקת הסינון)
insert into public.orders (order_number, status, customer_name, customer_phone, customer_email, delivery_method,
  items_total_agorot, total_agorot, payment_provider, payment_ref, paid_at)
values (5000, 'shipped', 'יואב בדיקה', '052-0000000', 'other@example.test', 'pickup', 6500, 6500, 'test', 'test-ref-0', now());
