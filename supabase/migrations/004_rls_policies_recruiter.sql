-- Políticas RLS para o painel do recrutador (JWT = usuário Supabase Auth).
-- Sem políticas, RLS habilitado bloqueia leituras via anon key + sessão.

-- ---------------------------------------------------------------------------
-- clientes: cada usuário vê e mantém só o cadastro ligado ao próprio email
-- ---------------------------------------------------------------------------
drop policy if exists "clientes_select_own_email" on public.clientes;
create policy "clientes_select_own_email"
  on public.clientes for select
  to authenticated
  using (lower(trim(email)) = lower(trim((select auth.jwt() ->> 'email'))));

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

-- ---------------------------------------------------------------------------
-- vagas: somente vagas do cliente logado
-- ---------------------------------------------------------------------------
drop policy if exists "vagas_select_own_cliente" on public.vagas;
create policy "vagas_select_own_cliente"
  on public.vagas for select
  to authenticated
  using (
    cliente_id in (
      select c.id from public.clientes c
      where lower(trim(c.email)) = lower(trim((select auth.jwt() ->> 'email')))
    )
  );

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

-- ---------------------------------------------------------------------------
-- candidatos: banco de talentos compartilhado (leitura para recrutadores logados)
-- ---------------------------------------------------------------------------
drop policy if exists "candidatos_select_authenticated" on public.candidatos;
create policy "candidatos_select_authenticated"
  on public.candidatos for select
  to authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- candidaturas: inscrições nas vagas do cliente logado
-- ---------------------------------------------------------------------------
drop policy if exists "candidaturas_select_own_vagas" on public.candidaturas;
create policy "candidaturas_select_own_vagas"
  on public.candidaturas for select
  to authenticated
  using (
    vaga_id in (
      select v.id
      from public.vagas v
      join public.clientes c on c.id = v.cliente_id
      where lower(trim(c.email)) = lower(trim((select auth.jwt() ->> 'email')))
    )
  );

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
