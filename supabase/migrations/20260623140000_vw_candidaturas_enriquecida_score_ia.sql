-- Adiciona score_ia puro à view de listagem (coluna nova no FINAL — Postgres não permite inserir no meio com CREATE OR REPLACE).
-- Demais colunas/joins idênticos à view em produção (2026-06-23).
create or replace view public.vw_candidaturas_enriquecida as
 SELECT cd.id AS candidatura_id,
    cd.vaga_id,
    v.cliente_id,
    cd.status,
    cd.enviado_em,
    cd.atualizado_em,
    cd.distancia_km,
    cd.tags AS tags_candidatura,
    c.id AS candidato_id,
    c.nome AS candidato_nome,
    c.telefone AS candidato_telefone,
    c.bairro AS candidato_bairro,
    c.cidade AS candidato_cidade,
    c.data_nascimento AS candidato_data_nascimento,
    c.situacao_emprego AS candidato_situacao_emprego,
    v.cargo AS vaga_cargo,
    v.titulo_publicacao AS vaga_titulo_publicacao,
    s.score_ia_atual,
    s.score_pos_entrevista,
    s.tags_analise,
    s.ultima_experiencia,
    s.score_ia
   FROM candidaturas cd
     JOIN vagas v ON v.id = cd.vaga_id
     LEFT JOIN candidatos c ON c.id = cd.candidato_id
     LEFT JOIN vw_candidato_score_ia_atual s ON s.candidato_id = cd.candidato_id;

grant select on public.vw_candidaturas_enriquecida to authenticated;
grant select on public.vw_candidaturas_enriquecida to service_role;
