-- Remove vagas fantasma já esvaziadas pelas migrações anteriores.
DELETE FROM public.vagas
WHERE id IN (
  '47a1391d-3a79-46db-8dd3-b9b35a659e5a', -- Tapí Atendente (genérica)
  'b923399f-7090-45d4-bf18-7bca8fb4d82f'  -- Supervisor Leblon
)
AND NOT EXISTS (
  SELECT 1 FROM public.candidaturas cd WHERE cd.vaga_id = vagas.id
);
