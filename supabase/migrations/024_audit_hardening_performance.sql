-- Auditoria 2026-03-31: hardening + performance.
-- Todas as instrucoes abaixo sao idempotentes.

-- 1) Performance para listagens de candidatos em banco/dashboard.
create index if not exists idx_candidatos_disponivel_criado_em
  on public.candidatos (disponivel, criado_em desc);

create index if not exists idx_candidatos_criado_em
  on public.candidatos (criado_em desc);

-- 2) Performance para leitura por vaga/status/tempo.
create index if not exists idx_candidaturas_vaga_status_atualizado_em
  on public.candidaturas (vaga_id, status, atualizado_em desc);

-- 3) Performance para leitura por candidato + etapa.
create index if not exists idx_candidaturas_candidato_status
  on public.candidaturas (candidato_id, status);

-- 4) Performance para view de analise IA (caso 022 ainda nao tenha rodado em algum ambiente).
create index if not exists idx_candidatos_analise_candidato_processado
  on public.candidatos_analise (candidato_id, processado_em desc, atualizado_em desc);

-- 5) Hardening RLS para candidatos.
-- A policy ampla "candidatos_select_authenticated using (true)" e permissiva demais.
-- Substitui por policy vinculada ao cliente da vaga na candidatura.
drop policy if exists "candidatos_select_authenticated" on public.candidatos;
create policy "candidatos_select_by_cliente_candidaturas"
  on public.candidatos
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.candidaturas cd
      join public.vagas v on v.id = cd.vaga_id
      join public.clientes cl on cl.id = v.cliente_id
      where cd.candidato_id = candidatos.id
        and lower(cl.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  );
