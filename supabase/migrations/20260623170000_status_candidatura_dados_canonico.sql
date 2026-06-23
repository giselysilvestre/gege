-- Fatia de dados: migra candidaturas.status de valores legados para canônicos (16-status).
-- Pré-requisito: migration aditiva 20260623160000 (enum já aceita os novos rótulos).
-- Backup recuperável + UPDATE + default em transação explícita.

create table if not exists public._bkp_status_candidatura_20260623 as
select id, status::text as status_antigo, now() as snapshot_em
from public.candidaturas;

begin;

update public.candidaturas
set status = case status::text
  when 'inscrito' then 'inscrito_aguardando_disparo'
  when 'novo' then 'inscrito_aguardando_disparo'
  when 'em_triagem' then 'inscrito_aguardando_disparo'
  when 'movido' then 'inscrito_aguardando_disparo'
  when 'abordado' then 'abordado_em_conversa'
  when 'respondeu' then 'abordado_em_conversa'
  when 'interessado' then 'abordado_avancar'
  when 'qualificado' then 'qualificado_avancar'
  when 'em_entrevista' then 'qualificado_avancar'
  when 'encaminhado' then 'encaminhado_aguardando'
  when 'em_teste' then 'encaminhado_aguardando'
  when 'aprovado' then 'encaminhado_avancar'
  when 'reprovado' then 'inscrito_reprovado'
  when 'desistiu' then 'abordado_negativa'
  else status::text
end::public.status_candidatura
where status::text in (
  'inscrito', 'novo', 'em_triagem', 'movido',
  'abordado', 'respondeu', 'interessado',
  'qualificado', 'em_entrevista',
  'encaminhado', 'em_teste', 'aprovado',
  'reprovado', 'desistiu'
);

alter table public.candidaturas
  alter column status set default 'inscrito_aguardando_disparo'::public.status_candidatura;

comment on column public.candidaturas.status is
  'Funil canônico etapa_situacao (16 valores). Legados migrados em 20260623170000.';

commit;
