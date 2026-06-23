-- Tags intuitivas: perto | limite | longe | sem_local

alter table public.candidaturas
  drop constraint if exists candidaturas_viabilidade_geografica_check;

update public.candidaturas set viabilidade_geografica = 'perto' where viabilidade_geografica = 'viavel';
update public.candidaturas set viabilidade_geografica = 'sem_local' where viabilidade_geografica = 'indefinido';

alter table public.candidaturas
  add constraint candidaturas_viabilidade_geografica_check check (
    viabilidade_geografica is null
    or viabilidade_geografica in ('perto', 'limite', 'longe', 'sem_local')
  );

comment on column public.candidaturas.viabilidade_geografica is
  'Distância/região vs loja da vaga: perto, limite, longe, sem_local.';
