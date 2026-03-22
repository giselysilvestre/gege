-- Tabela de candidatos (Gegê)
-- Execute no SQL Editor do Supabase ou via CLI do Supabase.

create table if not exists public.candidatos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  telefone text,
  email text,
  cargo text,
  cidade text,
  score numeric not null default 0,
  created_at timestamptz not null default now()
);

comment on table public.candidatos is 'Candidatos gerenciados pelo sistema Gegê';

-- RLS: o backend usa a service role, que ignora RLS.
-- Se for acessar esta tabela direto do browser com a chave anon, crie políticas adequadas.
alter table public.candidatos enable row level security;
