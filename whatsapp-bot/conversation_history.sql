-- Histórico de mensagens por conversa Kapso (Claude: role + content).
-- Execute no SQL Editor do Supabase ou via migration.

create table if not exists public.conversation_history (
  id uuid primary key default gen_random_uuid(),
  conversation_id text not null unique,
  messages jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists conversation_history_updated_at_idx
  on public.conversation_history (updated_at desc);

comment on table public.conversation_history is 'Histórico {role, content} por conversation_id (Kapso).';
