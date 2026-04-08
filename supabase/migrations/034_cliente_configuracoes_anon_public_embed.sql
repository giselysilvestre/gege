-- Embed público em /vagas/:slug (logo + WhatsApp): FK clientes → cliente_configuracoes com anon.

drop policy if exists "cliente_configuracoes_select_public_open_vaga" on public.cliente_configuracoes;
create policy "cliente_configuracoes_select_public_open_vaga"
  on public.cliente_configuracoes for select
  to anon
  using (
    exists (
      select 1 from public.vagas v
      where v.cliente_id = cliente_configuracoes.cliente_id
        and v.status_vaga = 'aberta'
    )
  );
