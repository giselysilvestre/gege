-- View única para listagens de candidatos por cliente.
-- Evita cruzamento em memória no backend e reduz latência da dashboard/listas.

create or replace view public.vw_candidaturas_enriquecida as
select
  cd.id as candidatura_id,
  cd.vaga_id,
  v.cliente_id,
  cd.status,
  cd.enviado_em,
  cd.atualizado_em,
  cd.distancia_km,
  cd.tags as tags_candidatura,
  c.id as candidato_id,
  c.nome as candidato_nome,
  c.telefone as candidato_telefone,
  c.bairro as candidato_bairro,
  c.cidade as candidato_cidade,
  c.data_nascimento as candidato_data_nascimento,
  c.situacao_emprego as candidato_situacao_emprego,
  v.cargo as vaga_cargo,
  v.titulo_publicacao as vaga_titulo_publicacao,
  s.score_ia_atual,
  s.tags_analise,
  s.ultima_experiencia
from public.candidaturas cd
join public.vagas v on v.id = cd.vaga_id
left join public.candidatos c on c.id = cd.candidato_id
left join public.vw_candidato_score_ia_atual s on s.candidato_id = cd.candidato_id;

grant select on public.vw_candidaturas_enriquecida to authenticated;
grant select on public.vw_candidaturas_enriquecida to service_role;
