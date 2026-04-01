alter table public.cliente_configuracoes
  add column if not exists contato_whatsapp text null,
  add column if not exists contato_telefone text null;

