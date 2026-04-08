-- Habilita RLS e cria policies para tabelas sem política em produção.
-- Observação: entrevistas não possui candidatura_id; o vínculo correto é por candidato_id.
-- Neste schema, o vínculo candidato -> cliente ocorre via candidaturas.vaga_id -> vagas.cliente_id.

alter table public.candidatos_analise enable row level security;
alter table public.candidatos_experiencia enable row level security;
alter table public.entrevistas enable row level security;

drop policy if exists "analise_authenticated" on public.candidatos_analise;
create policy "analise_authenticated"
  on public.candidatos_analise
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.candidaturas cd
      join public.vagas v on v.id = cd.vaga_id
      join public.cliente_membros cm on cm.cliente_id = v.cliente_id
      where cd.candidato_id = candidatos_analise.candidato_id
        and cm.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.candidaturas cd
      join public.vagas v on v.id = cd.vaga_id
      join public.cliente_membros cm on cm.cliente_id = v.cliente_id
      where cd.candidato_id = candidatos_analise.candidato_id
        and cm.user_id = auth.uid()
    )
  );

drop policy if exists "experiencia_authenticated" on public.candidatos_experiencia;
create policy "experiencia_authenticated"
  on public.candidatos_experiencia
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.candidaturas cd
      join public.vagas v on v.id = cd.vaga_id
      join public.cliente_membros cm on cm.cliente_id = v.cliente_id
      where cd.candidato_id = candidatos_experiencia.candidato_id
        and cm.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.candidaturas cd
      join public.vagas v on v.id = cd.vaga_id
      join public.cliente_membros cm on cm.cliente_id = v.cliente_id
      where cd.candidato_id = candidatos_experiencia.candidato_id
        and cm.user_id = auth.uid()
    )
  );

drop policy if exists "entrevistas_authenticated" on public.entrevistas;
create policy "entrevistas_authenticated"
  on public.entrevistas
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.candidaturas cd
      join public.vagas v on v.id = cd.vaga_id
      join public.cliente_membros cm on cm.cliente_id = v.cliente_id
      where cd.candidato_id = entrevistas.candidato_id
        and cm.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.candidaturas cd
      join public.vagas v on v.id = cd.vaga_id
      join public.cliente_membros cm on cm.cliente_id = v.cliente_id
      where cd.candidato_id = entrevistas.candidato_id
        and cm.user_id = auth.uid()
    )
  );
