-- Demo do dashboard: liga até 5 candidatos (sem processo ativo) à vaga ativa mais recente do 1º cliente.
-- Rode no SQL Editor do Supabase como postgres (ignora RLS = políticas de acesso às tabelas).
--
-- Processo ativo = candidatura com status em_triagem ou aprovado (índice uq_candidaturas_candidato_ativo).

WITH alvo_vaga AS (
  SELECT v.id
  FROM public.vagas v
  WHERE v.cliente_id = (SELECT id FROM public.clientes ORDER BY criado_em ASC LIMIT 1)
    AND v.status_vaga IN ('aberta', 'em_selecao')
  ORDER BY v.criado_em DESC
  LIMIT 1
),
livres AS (
  SELECT c.id,
         row_number() OVER (ORDER BY c.criado_em DESC) AS n
  FROM public.candidatos c
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.candidaturas x
    WHERE x.candidato_id = c.id
      AND x.status IN ('em_triagem', 'em_entrevista', 'em_teste')
  )
  LIMIT 5
)
INSERT INTO public.candidaturas (
  candidato_id,
  vaga_id,
  status,
  score_compatibilidade,
  tags,
  enviado_em,
  atualizado_em
)
SELECT
  l.id,
  (SELECT id FROM alvo_vaga),
  CASE l.n
    WHEN 1 THEN 'novo'::public.status_candidatura
    WHEN 2 THEN 'novo'::public.status_candidatura
    WHEN 3 THEN 'em_triagem'::public.status_candidatura
    WHEN 4 THEN 'em_entrevista'::public.status_candidatura
    WHEN 5 THEN 'contratado'::public.status_candidatura
  END,
  CASE l.n WHEN 1 THEN 68 WHEN 2 THEN 74 WHEN 3 THEN 81 WHEN 4 THEN 85 WHEN 5 THEN 90 END,
  CASE l.n
    WHEN 1 THEN ARRAY['food']::text[]
    WHEN 2 THEN ARRAY['crescimento']::text[]
    WHEN 3 THEN ARRAY['food', 'liderança']::text[]
    WHEN 4 THEN ARRAY['food']::text[]
    WHEN 5 THEN ARRAY['food', 'crescimento']::text[]
  END,
  now() - ((6 - l.n) || ' days')::interval,
  now() - ((6 - l.n) || ' days')::interval
FROM livres l
WHERE EXISTS (SELECT 1 FROM alvo_vaga)
ON CONFLICT (candidato_id, vaga_id) DO UPDATE SET
  status = excluded.status,
  score_compatibilidade = excluded.score_compatibilidade,
  tags = excluded.tags,
  atualizado_em = now();
