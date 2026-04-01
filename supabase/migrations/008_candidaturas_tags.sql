-- Tags calculadas no match (score-calc) por candidatura.
alter table public.candidaturas add column if not exists tags text[] null;

comment on column public.candidaturas.tags is 'Tags derivadas do cálculo de compatibilidade (ex.: match, alerta instabilidade).';
