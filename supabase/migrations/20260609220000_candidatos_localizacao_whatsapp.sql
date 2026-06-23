-- Rastreia localização preenchida a partir de conversa WhatsApp.

alter table public.candidatos
  add column if not exists localizacao_fonte text null;

alter table public.candidatos
  add column if not exists localizacao_trecho text null;

comment on column public.candidatos.localizacao_fonte is
  'Origem da localização: cv, whatsapp_conversa, manual, etc.';

comment on column public.candidatos.localizacao_trecho is
  'Trecho da conversa (ou outra fonte) que comprovou cidade/bairro.';
