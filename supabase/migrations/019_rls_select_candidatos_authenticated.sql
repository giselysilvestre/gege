-- Evita base vazia em Candidatos/Banco por bloqueio de leitura da tabela candidatos.
-- Mantém escrita protegida pelas policies existentes.

alter table if exists public.candidatos enable row level security;

drop policy if exists "candidatos_select_own_cliente" on public.candidatos;
drop policy if exists "candidatos_select_authenticated" on public.candidatos;

create policy "candidatos_select_authenticated"
  on public.candidatos for select
  to authenticated
  using (true);
