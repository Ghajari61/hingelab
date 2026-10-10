-- Parametric P6: the files behind Parametric cloud projects (imported 3D files and photo depth
-- maps). Parametric cloud projects stay a Pro feature (enforce_plan_limits, Phase 4); the Free
-- plan designs in the browser and exports through the server (lib/plans.ts parametricLocks).

-- Private, one folder per user: {user id}/{project id}/{file}. Only Pro users can upload.
insert into storage.buckets (id, name, public, file_size_limit)
values ('models', 'models', false, 104857600)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

create policy "models: read own" on storage.objects for select to authenticated
  using (bucket_id = 'models' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "models: Pro uploads own" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'models'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (select 1 from public.profiles where id = (select auth.uid()) and plan = 'pro')
  );

create policy "models: delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'models' and (storage.foldername(name))[1] = (select auth.uid())::text);
