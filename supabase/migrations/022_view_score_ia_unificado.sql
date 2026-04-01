-- Fonte única para consumo de Score IA no app.
-- Regra:
-- 1) usar score_ia (currículo) quando existir;
-- 2) fallback para score_pos_entrevista;
-- 3) fallback para score_final.
-- Sempre pega a análise mais recente por candidato.

create index if not exists idx_candidatos_analise_candidato_processado
  on public.candidatos_analise (candidato_id, processado_em desc, atualizado_em desc);

create or replace view public.vw_candidato_score_ia_atual as
with latest as (
  select distinct on (ca.candidato_id)
    ca.candidato_id,
    ca.score_ia,
    ca.score_pos_entrevista,
    ca.score_final,
    ca.tags as tags_analise,
    ca.ultima_experiencia,
    ca.processado_em,
    ca.atualizado_em
  from public.candidatos_analise ca
  order by ca.candidato_id, ca.processado_em desc nulls last, ca.atualizado_em desc nulls last
)
select
  l.candidato_id,
  l.score_ia,
  l.score_pos_entrevista,
  l.score_final,
  l.tags_analise,
  l.ultima_experiencia,
  coalesce(
    l.score_ia::numeric,
    l.score_pos_entrevista::numeric,
    l.score_final
  ) as score_ia_atual,
  l.processado_em,
  l.atualizado_em
from latest l;

grant select on public.vw_candidato_score_ia_atual to authenticated;
grant select on public.vw_candidato_score_ia_atual to service_role;
