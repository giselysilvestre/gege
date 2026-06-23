-- Status "movido" para candidaturas transferidas entre vagas (ação CRM "Mover de vaga")

do $$
begin
  if not exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'status_candidatura' and e.enumlabel = 'movido'
  ) then
    alter type public.status_candidatura add value 'movido';
  end if;
end $$;

alter table public.candidaturas
  drop constraint if exists candidaturas_motivo_reprovacao_check;

alter table public.candidaturas
  add constraint candidaturas_motivo_reprovacao_check
  check (
    motivo_reprovacao is null
    or motivo_reprovacao in (
      'score_entrevista',
      'distancia',
      'horario',
      'desistiu',
      'eliminatorio',
      'movido_vaga'
    )
  );

comment on column public.candidaturas.status is
  'Status do funil; movido = transferido para outra vaga via CRM';
