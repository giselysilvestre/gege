-- Campos detalhados do scorer v3 (notas por pergunta, trechos e red flags).
ALTER TABLE candidatos_analise
  ADD COLUMN IF NOT EXISTS notas_entrevista JSONB,
  ADD COLUMN IF NOT EXISTS trechos_entrevista JSONB,
  ADD COLUMN IF NOT EXISTS red_flags_entrevista TEXT;
