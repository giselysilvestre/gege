-- Campos opcionais citados no prompt (idempotente).

alter table public.clientes add column if not exists descricao text;
alter table public.clientes add column if not exists sobre text;
alter table public.clientes add column if not exists instagram text;
alter table public.clientes add column if not exists whatsapp text;

alter table public.vagas add column if not exists fechada_em timestamptz;

alter table public.candidaturas add column if not exists distancia_km numeric;
