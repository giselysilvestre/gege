-- Mensagens WhatsApp agendadas pelo painel CRM (whatsapp-analytics)
create table if not exists public.whatsapp_mensagens_agendadas (
  id uuid primary key default gen_random_uuid(),
  sessao_id uuid not null references public.whatsapp_sessoes (id) on delete cascade,
  candidato_id uuid references public.candidatos (id) on delete set null,
  telefone text not null,
  conteudo text not null,
  agendado_para timestamptz not null,
  status text not null default 'pendente'
    check (status in ('pendente', 'enviado', 'cancelado', 'erro')),
  erro text,
  criado_em timestamptz not null default now(),
  enviado_em timestamptz
);

create index if not exists whatsapp_mensagens_agendadas_status_data_idx
  on public.whatsapp_mensagens_agendadas (status, agendado_para);

create index if not exists whatsapp_mensagens_agendadas_sessao_idx
  on public.whatsapp_mensagens_agendadas (sessao_id);
