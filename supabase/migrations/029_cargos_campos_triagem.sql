alter table public.cliente_cargos
  add column if not exists salario_referencia numeric null,
  add column if not exists modalidade text null,
  add column if not exists atividades text null,
  add column if not exists requisitos_obrigatorios text null,
  add column if not exists requisitos_desejaveis text null;

