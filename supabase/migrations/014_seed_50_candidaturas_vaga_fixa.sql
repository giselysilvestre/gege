-- Até 50 candidaturas na vaga fixa (para popular painel / funil).
-- Idempotente: ignora quem já está inscrito nesta vaga (ON CONFLICT).
--
-- Vaga alvo:
--   47a1391d-3a79-46db-8dd3-b9b35a659e5a
--
-- Regras:
-- - Não duplica (candidato_id, vaga_id).
-- - Quem já tem outra candidatura em em_triagem ou aprovado recebe só status novo aqui
--   (índice uq_candidaturas_candidato_ativo).
-- - Se existirem menos de 50 candidatos elegíveis, insere só os disponíveis.
-- - Só roda se a vaga existir em public.vagas.

WITH alvo AS (
  SELECT '47a1391d-3a79-46db-8dd3-b9b35a659e5a'::uuid AS vaga_id
),
candidatos_elegiveis AS (
  SELECT
    sub.id,
    sub.tem_ativo,
    row_number() OVER (ORDER BY sub.id) AS rn
  FROM (
    SELECT
      c.id,
      EXISTS (
        SELECT 1
        FROM public.candidaturas x
        WHERE x.candidato_id = c.id
          AND x.status IN ('em_triagem', 'em_entrevista', 'em_teste')
      ) AS tem_ativo
    FROM public.candidatos c
    CROSS JOIN alvo a
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.candidaturas y
      WHERE y.candidato_id = c.id
        AND y.vaga_id = a.vaga_id
    )
    ORDER BY c.criado_em DESC NULLS LAST, c.id
    LIMIT 50
  ) sub
)
INSERT INTO public.candidaturas (
  candidato_id,
  vaga_id,
  status,
  score_compatibilidade,
  enviado_em,
  atualizado_em
)
SELECT
  ce.id,
  a.vaga_id,
  CASE
    WHEN ce.tem_ativo THEN 'novo'::public.status_candidatura
    ELSE (
      ARRAY[
        'novo',
        'novo',
        'novo',
        'em_triagem',
        'aprovado',
        'contratado',
        'reprovado'
      ]::public.status_candidatura[]
    )[1 + ((ce.rn - 1) % 7)]
  END,
  LEAST(100, GREATEST(0, 40 + floor(random() * 56)::int)),
  now() - ((ce.rn % 40) || ' days')::interval,
  now() - ((ce.rn % 40) || ' days')::interval
FROM candidatos_elegiveis ce
CROSS JOIN alvo a
WHERE EXISTS (SELECT 1 FROM public.vagas v WHERE v.id = a.vaga_id)
ON CONFLICT (candidato_id, vaga_id) DO NOTHING;
