-- Configurações por cliente (marca + página de carreiras + links sociais).
-- Um registro por cliente.

create table if not exists public.cliente_configuracoes (
  cliente_id uuid primary key references public.clientes (id) on delete cascade,
  nome_marca text null,
  logo_url text null,
  cor_primaria text null,
  carreira_trabalhe_texto text null,
  carreira_sobre_texto text null,
  carreira_url text null,
  carreira_logo_url text null,
  carreira_capa_url text null,
  instagram_url text null,
  linkedin_url text null,
  site_url text null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

comment on table public.cliente_configuracoes is 'Configurações customizáveis por cliente para marca e página de carreiras.';

drop trigger if exists trg_cliente_configuracoes_set_atualizado_em on public.cliente_configuracoes;
create trigger trg_cliente_configuracoes_set_atualizado_em
before update on public.cliente_configuracoes
for each row execute function public.set_atualizado_em();

alter table public.cliente_configuracoes enable row level security;

drop policy if exists "cliente_configuracoes_select_own" on public.cliente_configuracoes;
create policy "cliente_configuracoes_select_own"
  on public.cliente_configuracoes for select
  to authenticated
  using (
    cliente_id in (
      select c.id from public.clientes c
      where lower(trim(c.email)) = lower(trim((select auth.jwt() ->> 'email')))
    )
  );

drop policy if exists "cliente_configuracoes_insert_own" on public.cliente_configuracoes;
create policy "cliente_configuracoes_insert_own"
  on public.cliente_configuracoes for insert
  to authenticated
  with check (
    cliente_id in (
      select c.id from public.clientes c
      where lower(trim(c.email)) = lower(trim((select auth.jwt() ->> 'email')))
    )
  );

drop policy if exists "cliente_configuracoes_update_own" on public.cliente_configuracoes;
create policy "cliente_configuracoes_update_own"
  on public.cliente_configuracoes for update
  to authenticated
  using (
    cliente_id in (
      select c.id from public.clientes c
      where lower(trim(c.email)) = lower(trim((select auth.jwt() ->> 'email')))
    )
  )
  with check (
    cliente_id in (
      select c.id from public.clientes c
      where lower(trim(c.email)) = lower(trim((select auth.jwt() ->> 'email')))
    )
  );

