-- Página pública /vagas/:slug (vaga aberta) sem login: RLS permitia só authenticated.

drop policy if exists "vagas_select_public_aberta" on public.vagas;
create policy "vagas_select_public_aberta"
  on public.vagas for select
  to anon
  using (status_vaga = 'aberta');

-- Embed clientes (nome_empresa): só linhas com pelo menos uma vaga aberta
drop policy if exists "clientes_select_public_open_vaga" on public.clientes;
create policy "clientes_select_public_open_vaga"
  on public.clientes for select
  to anon
  using (
    exists (
      select 1 from public.vagas v
      where v.cliente_id = clientes.id
        and v.status_vaga = 'aberta'
    )
  );

-- Embed cliente_unidades (cidade, uf) quando a vaga referencia unidade_id
drop policy if exists "cliente_unidades_select_public_open_vaga" on public.cliente_unidades;
create policy "cliente_unidades_select_public_open_vaga"
  on public.cliente_unidades for select
  to anon
  using (
    exists (
      select 1 from public.vagas v
      where v.unidade_id = cliente_unidades.id
        and v.status_vaga = 'aberta'
    )
  );
