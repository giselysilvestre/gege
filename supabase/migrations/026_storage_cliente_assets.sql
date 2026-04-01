-- Bucket para assets de marca (logo/capa) de cada cliente.

insert into storage.buckets (id, name, public)
values ('cliente-assets', 'cliente-assets', true)
on conflict (id) do nothing;

-- Leitura pública dos assets.
drop policy if exists "cliente_assets_public_read" on storage.objects;
create policy "cliente_assets_public_read"
  on storage.objects
  for select
  to public
  using (bucket_id = 'cliente-assets');

-- Upload/edição/exclusão por usuário autenticado.
drop policy if exists "cliente_assets_auth_insert" on storage.objects;
create policy "cliente_assets_auth_insert"
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'cliente-assets');

drop policy if exists "cliente_assets_auth_update" on storage.objects;
create policy "cliente_assets_auth_update"
  on storage.objects
  for update
  to authenticated
  using (bucket_id = 'cliente-assets')
  with check (bucket_id = 'cliente-assets');

drop policy if exists "cliente_assets_auth_delete" on storage.objects;
create policy "cliente_assets_auth_delete"
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'cliente-assets');

