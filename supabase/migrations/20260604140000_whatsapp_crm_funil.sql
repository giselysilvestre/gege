-- CRM WhatsApp: motivo reprovação, resumo IA, reativação e etapa do funil comercial

alter table public.candidaturas
  add column if not exists motivo_reprovacao text;

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
      'eliminatorio'
    )
  );

alter table public.whatsapp_sessoes
  add column if not exists resumo_ia text,
  add column if not exists reativacao_enviada boolean not null default false,
  add column if not exists etapa_funil text;

alter table public.whatsapp_sessoes
  drop constraint if exists whatsapp_sessoes_etapa_funil_check;

alter table public.whatsapp_sessoes
  add constraint whatsapp_sessoes_etapa_funil_check
  check (
    etapa_funil is null
    or etapa_funil in (
      'abordado',
      'respondeu',
      'interessado',
      'qualificado',
      'encaminhado',
      'contratado',
      'reprovado',
      'desistiu',
      'inativo'
    )
  );

comment on column public.candidaturas.motivo_reprovacao is 'Motivo de saída manual no CRM WhatsApp';
comment on column public.whatsapp_sessoes.resumo_ia is 'Resumo Claude da conversa (cache)';
comment on column public.whatsapp_sessoes.etapa_funil is 'Etapa do funil CRM; se null, inferida pelo app';
