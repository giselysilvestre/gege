-- Garante campos usados pelo app no funil/listas de candidaturas.
-- Seguro para rodar mais de uma vez.

alter table public.candidaturas
  add column if not exists distancia_km numeric;

alter table public.candidaturas
  add column if not exists tags text[] null;

comment on column public.candidaturas.distancia_km is
  'Distância estimada entre candidato e vaga, em quilômetros.';

comment on column public.candidaturas.tags is
  'Tags derivadas do cálculo de compatibilidade (ex.: match, alerta instabilidade).';
