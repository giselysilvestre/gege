-- Remove do banco de talentos candidatas com histórico de entrevista no Supervisor Leblon.
DELETE FROM public.candidatos
WHERE telefone IN ('+55 21 99067-3877', '+55 21 98846-7992')
  AND nome IN ('Nathália', 'Otaviana da Silva Viana Lima');
