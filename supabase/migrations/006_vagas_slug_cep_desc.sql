-- Campos usados pelo app (criação de vaga / match). Idempotente.

alter table public.vagas add column if not exists slug text;
alter table public.vagas add column if not exists cep_loja text;
alter table public.vagas add column if not exists descricao text;

comment on column public.vagas.slug is 'Slug único amigável para URL (ex.: cargo-timestamp).';
comment on column public.vagas.cep_loja is 'CEP do local da vaga (distância / logística).';
comment on column public.vagas.descricao is 'Descrição longa da vaga.';
