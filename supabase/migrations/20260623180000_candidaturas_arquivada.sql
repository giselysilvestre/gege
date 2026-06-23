-- Arquivamento soft (mover vaga: origem arquivada, destino nova inscrição).
-- View: append-only — arquivada entra como coluna 23 (ordem live preservada).

alter table public.candidaturas
  add column if not exists arquivada boolean not null default false,
  add column if not exists arquivada_em timestamptz null;

comment on column public.candidaturas.arquivada is
  'Candidatura arquivada (ex.: transferida de vaga); excluir de listagens ativas.';
comment on column public.candidaturas.arquivada_em is
  'Timestamp do arquivamento; null se ativa.';

create index if not exists idx_candidaturas_nao_arquivadas
  on public.candidaturas (vaga_id, candidato_id)
  where arquivada = false;

create or replace view public.vw_candidaturas_enriquecida as
select cd.id as candidatura_id,
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
    s.score_pos_entrevista,
    s.tags_analise,
    s.ultima_experiencia,
    s.score_ia,
    cd.arquivada
   from public.candidaturas cd
     join public.vagas v on v.id = cd.vaga_id
     left join public.candidatos c on c.id = cd.candidato_id
     left join public.vw_candidato_score_ia_atual s on s.candidato_id = cd.candidato_id;

grant select on public.vw_candidaturas_enriquecida to authenticated;
grant select on public.vw_candidaturas_enriquecida to service_role;
