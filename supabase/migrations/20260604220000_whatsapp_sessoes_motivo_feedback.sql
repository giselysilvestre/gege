-- Coleta de motivo de recusa + controle de feedback pós-triagem (CRM WhatsApp)
alter table public.whatsapp_sessoes
  add column if not exists motivo_recusa text,
  add column if not exists feedback_reprovacao_enviado boolean default false,
  add column if not exists feedback_reprovacao_tipo text,
  add column if not exists feedback_reprovacao_agendado_em timestamptz;

comment on column public.whatsapp_sessoes.motivo_recusa is 'Texto informado pelo candidato ao recusar vaga (etapa aguardando_motivo_recusa)';
comment on column public.whatsapp_sessoes.feedback_reprovacao_enviado is 'Feedback pós-triagem (reprovado_*) já enviado';
comment on column public.whatsapp_sessoes.feedback_reprovacao_tipo is 'Tipo do feedback agendado ou enviado: reprovado_distancia, reprovado_desistencia, reprovado_horario, reprovado_score';
comment on column public.whatsapp_sessoes.feedback_reprovacao_agendado_em is 'Quando o feedback agendado deve ser enviado (ex.: score +48h)';
