-- Multi-usuario: cliente_membros + authorized_cliente_ids + policies RLS.
-- INSERT manual: insert into public.cliente_membros (cliente_id, user_id, role) values (...);

create table if not exists public.cliente_membros (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member',
  criado_em timestamptz not null default now(),
  constraint cliente_membros_role_check check (role in ('owner', 'member')),
  constraint cliente_membros_cliente_user_unique unique (cliente_id, user_id)
);

create index if not exists idx_cliente_membros_user_id on public.cliente_membros (user_id);
create index if not exists idx_cliente_membros_cliente_id on public.cliente_membros (cliente_id);

comment on table public.cliente_membros is 'Usuarios Auth com acesso a uma loja (cliente).';

alter table public.cliente_membros enable row level security;

grant select on public.cliente_membros to authenticated;

drop policy if exists "cliente_membros_select_own" on public.cliente_membros;
create policy "cliente_membros_select_own"
  on public.cliente_membros for select
  to authenticated
  using (user_id = (select auth.uid()));

create or replace function public.authorized_cliente_ids()
returns setof uuid
language sql
stable
security invoker
set search_path = public
as $$
  select m.cliente_id
  from public.cliente_membros m
  where m.user_id = (select auth.uid())
  union
  select c.id
  from public.clientes c
  where lower(trim(c.email)) = lower(trim(coalesce((select auth.jwt() ->> 'email'), '')))
$$;

comment on function public.authorized_cliente_ids() is 'RLS: cliente_id autorizado (membro ou dono por email).';

grant execute on function public.authorized_cliente_ids() to authenticated;

drop policy if exists "vagas_insert_own_cliente" on public.vagas;
create policy "vagas_insert_own_cliente"
  on public.vagas for insert
  to authenticated
  with check (cliente_id in (select * from public.authorized_cliente_ids()));

drop policy if exists "vagas_update_own_cliente" on public.vagas;
create policy "vagas_update_own_cliente"
  on public.vagas for update
  to authenticated
  using (cliente_id in (select * from public.authorized_cliente_ids()))
  with check (cliente_id in (select * from public.authorized_cliente_ids()));

drop policy if exists "vagas_delete_own_cliente" on public.vagas;
create policy "vagas_delete_own_cliente"
  on public.vagas for delete
  to authenticated
  using (cliente_id in (select * from public.authorized_cliente_ids()));

drop policy if exists "candidaturas_insert_own_vagas" on public.candidaturas;
create policy "candidaturas_insert_own_vagas"
  on public.candidaturas for insert
  to authenticated
  with check (
    vaga_id in (
      select v.id
      from public.vagas v
      where v.cliente_id in (select * from public.authorized_cliente_ids())
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
      where v.cliente_id in (select * from public.authorized_cliente_ids())
    )
  )
  with check (
    vaga_id in (
      select v.id
      from public.vagas v
      where v.cliente_id in (select * from public.authorized_cliente_ids())
    )
  );

drop policy if exists "cliente_unidades_select_own" on public.cliente_unidades;
create policy "cliente_unidades_select_own"
  on public.cliente_unidades for select
  to authenticated
  using (cliente_id in (select * from public.authorized_cliente_ids()));

drop policy if exists "cliente_unidades_insert_own" on public.cliente_unidades;
create policy "cliente_unidades_insert_own"
  on public.cliente_unidades for insert
  to authenticated
  with check (cliente_id in (select * from public.authorized_cliente_ids()));

drop policy if exists "cliente_unidades_update_own" on public.cliente_unidades;
create policy "cliente_unidades_update_own"
  on public.cliente_unidades for update
  to authenticated
  using (cliente_id in (select * from public.authorized_cliente_ids()))
  with check (cliente_id in (select * from public.authorized_cliente_ids()));

drop policy if exists "cliente_unidades_delete_own" on public.cliente_unidades;
create policy "cliente_unidades_delete_own"
  on public.cliente_unidades for delete
  to authenticated
  using (cliente_id in (select * from public.authorized_cliente_ids()));

drop policy if exists "cliente_cargos_select_own" on public.cliente_cargos;
create policy "cliente_cargos_select_own"
  on public.cliente_cargos for select
  to authenticated
  using (cliente_id in (select * from public.authorized_cliente_ids()));

drop policy if exists "cliente_cargos_insert_own" on public.cliente_cargos;
create policy "cliente_cargos_insert_own"
  on public.cliente_cargos for insert
  to authenticated
  with check (cliente_id in (select * from public.authorized_cliente_ids()));

drop policy if exists "cliente_cargos_update_own" on public.cliente_cargos;
create policy "cliente_cargos_update_own"
  on public.cliente_cargos for update
  to authenticated
  using (cliente_id in (select * from public.authorized_cliente_ids()))
  with check (cliente_id in (select * from public.authorized_cliente_ids()));

drop policy if exists "cliente_cargos_delete_own" on public.cliente_cargos;
create policy "cliente_cargos_delete_own"
  on public.cliente_cargos for delete
  to authenticated
  using (cliente_id in (select * from public.authorized_cliente_ids()));

drop policy if exists "cliente_configuracoes_select_own" on public.cliente_configuracoes;
create policy "cliente_configuracoes_select_own"
  on public.cliente_configuracoes for select
  to authenticated
  using (cliente_id in (select * from public.authorized_cliente_ids()));

drop policy if exists "cliente_configuracoes_insert_own" on public.cliente_configuracoes;
create policy "cliente_configuracoes_insert_own"
  on public.cliente_configuracoes for insert
  to authenticated
  with check (cliente_id in (select * from public.authorized_cliente_ids()));

drop policy if exists "cliente_configuracoes_update_own" on public.cliente_configuracoes;
create policy "cliente_configuracoes_update_own"
  on public.cliente_configuracoes for update
  to authenticated
  using (cliente_id in (select * from public.authorized_cliente_ids()))
  with check (cliente_id in (select * from public.authorized_cliente_ids()));

drop policy if exists "candidatos_select_by_cliente_candidaturas" on public.candidatos;
create policy "candidatos_select_by_cliente_candidaturas"
  on public.candidatos
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.candidaturas cd
      join public.vagas v on v.id = cd.vaga_id
      where cd.candidato_id = candidatos.id
        and v.cliente_id in (select * from public.authorized_cliente_ids())
    )
  );
