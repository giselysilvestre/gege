-- Otimizações de leitura para dashboard/listagens.
-- Índice = atalho de busca no banco para filtros/ordenação frequentes.

create index if not exists idx_vagas_cliente_status_criado_em
  on public.vagas (cliente_id, status_vaga, criado_em desc);

create index if not exists idx_candidaturas_vaga_status_enviado_em
  on public.candidaturas (vaga_id, status, enviado_em desc);

create index if not exists idx_candidaturas_vaga_enviado_em
  on public.candidaturas (vaga_id, enviado_em desc);

create index if not exists idx_candidaturas_candidato_enviado_em
  on public.candidaturas (candidato_id, enviado_em desc);
