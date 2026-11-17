-- Storage buckets and policies.
-- customer-uploads: PRIVATE. No anon policy: uploads go through server-issued signed upload URLs,
--   reads only via short-lived signed URLs created by the server for an MFA admin.
-- product-images: PUBLIC read, admin-only write.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('customer-uploads', 'customer-uploads', false, 26214400,
     array['image/jpeg','image/png','image/heic','image/heif','image/webp']),
  ('product-images', 'product-images', true, 5242880,
     array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy customer_uploads_admin_read on storage.objects
  for select to authenticated
  using (bucket_id = 'customer-uploads' and public.is_admin());
create policy customer_uploads_admin_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'customer-uploads' and public.is_admin());

create policy product_images_admin_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'product-images' and public.is_admin());
create policy product_images_admin_update on storage.objects
  for update to authenticated
  using (bucket_id = 'product-images' and public.is_admin());
create policy product_images_admin_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'product-images' and public.is_admin());
