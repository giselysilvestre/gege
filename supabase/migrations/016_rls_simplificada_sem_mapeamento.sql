-- RLS simplificada (sem tabela de vínculo usuário-cliente).
-- Modelo de dados continua: cliente -> vagas -> candidaturas.
-- Objetivo: evitar telas vazias por mismatch de e-mail no auth em ambiente de operação simples.

-- clientes: leitura para qualquer usuário autenticado; escrita mantém vínculo por e-mail.
drop policy if exists "clientes_select_own_email" on public.clientes;
create policy "clientes_select_authenticated"
  on public.clientes for select
  to authenticated
  using (true);

drop policy if exists "clientes_insert_own_email" on public.clientes;
create policy "clientes_insert_own_email"
  on public.clientes for insert
  to authenticated
  with check (lower(trim(email)) = lower(trim((select auth.jwt() ->> 'email'))));

drop policy if exists "clientes_update_own_email" on public.clientes;
create policy "clientes_update_own_email"
  on public.clientes for update
  to authenticated
  using (lower(trim(email)) = lower(trim((select auth.jwt() ->> 'email'))))
  with check (lower(trim(email)) = lower(trim((select auth.jwt() ->> 'email'))));

-- vagas: leitura para autenticados (necessário para listar e navegar).
drop policy if exists "vagas_select_own_cliente" on public.vagas;
create policy "vagas_select_authenticated"
  on public.vagas for select
  to authenticated
  using (true);

-- insert/update/delete continuam protegidos por cliente_id ligado ao e-mail.
drop policy if exists "vagas_insert_own_cliente" on public.vagas;
create policy "vagas_insert_own_cliente"
  on public.vagas for insert
  to authenticated
  with check (
    cliente_id in (
      select c.id from public.clientes c
      where lower(trim(c.email)) = lower(trim((select auth.jwt() ->> 'email')))
    )
  );

drop policy if exists "vagas_update_own_cliente" on public.vagas;
create policy "vagas_update_own_cliente"
  on public.vagas for update
  to authenticated
  using (
    cliente_id in (
      select c.id from public.clientes c
      where lower(trim(c.email)) = lower(trim((select auth.jwt() ->> 'email')))
    )
  )
  with check (
    cliente_id in (
      select c.id from public.clientes c
      where lower(trim(c.email)) = lower(trim((select auth.jwt() ->> 'email')))
    )
  );

drop policy if exists "vagas_delete_own_cliente" on public.vagas;
create policy "vagas_delete_own_cliente"
  on public.vagas for delete
  to authenticated
  using (
    cliente_id in (
      select c.id from public.clientes c
      where lower(trim(c.email)) = lower(trim((select auth.jwt() ->> 'email')))
    )
  );

-- candidaturas: leitura para autenticados (habilita funil/listas mesmo com e-mails divergentes).
drop policy if exists "candidaturas_select_own_vagas" on public.candidaturas;
create policy "candidaturas_select_authenticated"
  on public.candidaturas for select
  to authenticated
  using (true);

-- insert/update seguem restritos a vagas do cliente pelo e-mail.
drop policy if exists "candidaturas_insert_own_vagas" on public.candidaturas;
create policy "candidaturas_insert_own_vagas"
  on public.candidaturas for insert
  to authenticated
  with check (
    vaga_id in (
      select v.id
      from public.vagas v
      join public.clientes c on c.id = v.cliente_id
      where lower(trim(c.email)) = lower(trim((select auth.jwt() ->> 'email')))
    )
  );

drop policy if exists "candidaturas_update_own_vagas" on public.candidaturas;
create policy "candidaturas_update_own_vagas"
  on public.candidaturas for update
  to authenticated
  using (
    vaga_id in (
      select v.id
      from public.vagas v
      join public.clientes c on c.id = v.cliente_id
      where lower(trim(c.email)) = lower(trim((select auth.jwt() ->> 'email')))
    )
  )
  with check (
    vaga_id in (
      select v.id
      from public.vagas v
      join public.clientes c on c.id = v.cliente_id
      where lower(trim(c.email)) = lower(trim((select auth.jwt() ->> 'email')))
    )
  );
