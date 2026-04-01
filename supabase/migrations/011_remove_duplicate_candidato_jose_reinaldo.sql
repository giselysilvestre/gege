-- Remove José Reinaldo duplicado (mantém o mais recente)
-- Experiências e análise ligadas a este id são removidas em cascata (FK ON DELETE CASCADE).

DELETE FROM public.candidatos
WHERE id = '0c730fef-98de-475a-afb8-3492586ae198';
