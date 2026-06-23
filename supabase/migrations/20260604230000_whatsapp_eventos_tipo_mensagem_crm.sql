-- Permite registrar mensagens do CRM e jobs no histórico WhatsApp

alter table public.whatsapp_eventos
  drop constraint if exists whatsapp_eventos_tipo_mensagem_check;

alter table public.whatsapp_eventos
  add constraint whatsapp_eventos_tipo_mensagem_check
  check (
    tipo_mensagem is null
    or tipo_mensagem in (
      'template',
      'disparo_inicial',
      'follow_up_1h',
      'follow_up_d1',
      'follow_up_breakup',
      'resposta_ge',
      'resposta_candidato',
      'lembrete_entrevista',
      'manual_crm',
      'texto_agendado_crm',
      'texto_manual',
      'feedback_reprovacao'
    )
  );
