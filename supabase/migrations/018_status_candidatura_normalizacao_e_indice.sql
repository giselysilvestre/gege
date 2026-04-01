-- Etapa 2: rodar após a 017 já ter sido commitada.
-- Aqui já podemos usar os novos valores do enum com segurança.

-- Normaliza status legados para os novos nomes.
update public.candidaturas
set status = 'em_entrevista'::public.status_candidatura
where status::text in ('entrevista', 'entrevistado');

update public.candidaturas
set status = 'em_teste'::public.status_candidatura
where status::text in ('teste', 'aprovado_teste', 'aprovado');

-- Atualiza regra de processo ativo por candidato:
-- antes: em_triagem/aprovado; agora: em_triagem/em_entrevista/em_teste.
drop index if exists public.uq_candidaturas_candidato_ativo;
create unique index if not exists uq_candidaturas_candidato_ativo
  on public.candidaturas (candidato_id)
  where status in ('em_triagem', 'em_entrevista', 'em_teste');
