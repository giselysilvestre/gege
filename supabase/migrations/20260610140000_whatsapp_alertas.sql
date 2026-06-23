-- Alertas operacionais do WhatsApp (sem resposta, inatividade, encaminhamento)
create table if not exists public.whatsapp_alertas (
  id uuid primary key default gen_random_uuid(),
  tipo text not null
    check (tipo in ('sem_resposta_gege_24h', 'sem_resposta_ana_1h', 'entrevista_marcada')),
  sessao_id uuid references public.whatsapp_sessoes (id) on delete cascade,
  candidato_id uuid references public.candidatos (id) on delete set null,
  candidatura_id uuid references public.candidaturas (id) on delete set null,
  titulo text not null,
  detalhe text,
  metadata jsonb not null default '{}'::jsonb,
  status text not null default 'ativo'
    check (status in ('ativo', 'ack', 'resolvido')),
  dedupe_key text not null unique,
  notificado_em timestamptz,
  criado_em timestamptz not null default now(),
  ack_em timestamptz,
  resolvido_em timestamptz
);

create index if not exists whatsapp_alertas_status_criado_idx
  on public.whatsapp_alertas (status, criado_em desc);

create index if not exists whatsapp_alertas_tipo_status_idx
  on public.whatsapp_alertas (tipo, status);

create index if not exists whatsapp_alertas_sessao_idx
  on public.whatsapp_alertas (sessao_id);

comment on table public.whatsapp_alertas is 'Alertas operacionais: candidato sem responder, Ana sem responder, encaminhamento p/ entrevista';
