-- Etapa 2: migra dados legados e atualiza default/índice.

update public.candidaturas set status = 'inscrito'::public.status_candidatura where status::text = 'novo';
update public.candidaturas set status = 'abordado'::public.status_candidatura where status::text = 'em_triagem';
update public.candidaturas set status = 'qualificado'::public.status_candidatura
  where status::text in ('em_entrevista', 'entrevista', 'entrevistado');
update public.candidaturas set status = 'encaminhado'::public.status_candidatura
  where status::text in ('em_teste', 'teste', 'aprovado', 'aprovado_teste');

alter table public.candidaturas alter column status set default 'inscrito'::public.status_candidatura;

comment on column public.candidaturas.status is
  'Funil: inscrito, abordado, qualificado, encaminhado, contratado, reprovado, desistiu';
