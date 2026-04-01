-- Garante coluna usada pela view vw_candidaturas_enriquecida (alguns ambientes só tinham no SQL manual).
alter table public.candidatos
  add column if not exists data_nascimento date null;
