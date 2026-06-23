-- Renomeia tags de viabilidade_geografica (semântica mais neutra).

alter table public.candidaturas
  drop constraint if exists candidaturas_viabilidade_geografica_check;

update public.candidaturas
set viabilidade_geografica = 'limite'
where viabilidade_geografica = 'limitrofe';

update public.candidaturas
set viabilidade_geografica = 'longe'
where viabilidade_geografica = 'inviavel';

alter table public.candidaturas
  add constraint candidaturas_viabilidade_geografica_check check (
    viabilidade_geografica is null
    or viabilidade_geografica in ('viavel', 'limite', 'longe', 'indefinido')
  );

comment on column public.candidaturas.viabilidade_geografica is
  'Compatibilidade geográfica candidato × loja (viavel, limite, longe, indefinido).';
