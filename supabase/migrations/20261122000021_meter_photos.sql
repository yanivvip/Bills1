-- Photos of meters, kept as evidence next to a reading (one picture per meter and month, replaced when retaken).
-- Files live in a private bucket at  <org id>/<meter id>/<YYYY-MM-01>.jpg ; the readings.photo_path column points at them.
-- Who may touch a file follows who may see the meter: the landlord of the org (and an administrator) and the active renter of that unit.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('meter-photos', 'meter-photos', false, 524288, array['image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create policy meter_photos_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'meter-photos'
    and exists (
      select 1 from public.meters m
      where m.id::text = (storage.foldername(objects.name))[2]
        and m.org_id::text = (storage.foldername(objects.name))[1]
        and (public.is_org_member(m.org_id) or public.is_platform_admin() or (m.unit_id is not null and public.is_active_unit_renter(m.unit_id)))
    )
  );

create policy meter_photos_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'meter-photos'
    and exists (
      select 1 from public.meters m
      where m.id::text = (storage.foldername(objects.name))[2]
        and m.org_id::text = (storage.foldername(objects.name))[1]
        and (public.can_manage_org(m.org_id) or (m.unit_id is not null and public.is_active_unit_renter(m.unit_id)))
    )
  );

-- retaking the picture replaces the file
create policy meter_photos_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'meter-photos'
    and exists (
      select 1 from public.meters m
      where m.id::text = (storage.foldername(objects.name))[2]
        and m.org_id::text = (storage.foldername(objects.name))[1]
        and (public.can_manage_org(m.org_id) or (m.unit_id is not null and public.is_active_unit_renter(m.unit_id)))
    )
  )
  with check (
    bucket_id = 'meter-photos'
    and exists (
      select 1 from public.meters m
      where m.id::text = (storage.foldername(objects.name))[2]
        and m.org_id::text = (storage.foldername(objects.name))[1]
        and (public.can_manage_org(m.org_id) or (m.unit_id is not null and public.is_active_unit_renter(m.unit_id)))
    )
  );

create policy meter_photos_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'meter-photos'
    and exists (
      select 1 from public.meters m
      where m.id::text = (storage.foldername(objects.name))[2]
        and m.org_id::text = (storage.foldername(objects.name))[1]
        and public.can_manage_org(m.org_id)
    )
  );
