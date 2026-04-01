-- O processador de CV gravava score_final = 0,4 * score_ia mesmo sem entrevista,
-- em desacordo com o schema (final deve igualar IA quando não há score_pos_entrevista).
-- Corrige apenas linhas claramente geradas por esse bug (sem pós-entrevista).

UPDATE public.candidatos_analise
SET score_final = score_ia::numeric
WHERE score_pos_entrevista IS NULL
  AND score_ia IS NOT NULL
  AND (
    score_final IS NULL
    OR ABS(score_final::numeric - (0.4 * score_ia::numeric)) < 0.02
  );
