-- Favoritar conversas no CRM WhatsApp (painel localhost:3010)

alter table public.whatsapp_sessoes
  add column if not exists favorito_crm boolean not null default false;

create index if not exists whatsapp_sessoes_favorito_crm_idx
  on public.whatsapp_sessoes (favorito_crm)
  where favorito_crm = true;
