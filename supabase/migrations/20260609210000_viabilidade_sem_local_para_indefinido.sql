-- Tag sem_local → indefinido (conjunto final: perto, limite, longe, indefinido).

alter table public.candidaturas
  drop constraint if exists candidaturas_viabilidade_geografica_check;

update public.candidaturas
set viabilidade_geografica = 'indefinido'
where viabilidade_geografica = 'sem_local';

alter table public.candidaturas
  add constraint candidaturas_viabilidade_geografica_check check (
    viabilidade_geografica is null
    or viabilidade_geografica in ('perto', 'limite', 'longe', 'indefinido')
  );

comment on column public.candidaturas.viabilidade_geografica is
  'Distância/região vs loja da vaga: perto, limite, longe, indefinido.';
