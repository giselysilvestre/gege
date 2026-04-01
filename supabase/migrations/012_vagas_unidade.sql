-- Unidade da loja (ex.: "Tapí SP Norte") para exibir no dashboard e listagens.
alter table public.vagas add column if not exists unidade text null;

comment on column public.vagas.unidade is 'Nome amigável da unidade/loja (exibido no dashboard).';
