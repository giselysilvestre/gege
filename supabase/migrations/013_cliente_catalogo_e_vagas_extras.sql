-- Catálogo por cliente: unidades (endereço/CEP) e cargos (nome + descrição padrão).
-- Extensão da tabela vagas: título, quantidade, modelo, prazo, benefícios JSON, FKs opcionais.
-- Idempotente onde faz sentido (IF NOT EXISTS / DROP IF EXISTS).

-- ---------------------------------------------------------------------------
-- Tabelas de catálogo
-- ---------------------------------------------------------------------------
create table if not exists public.cliente_unidades (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes (id) on delete cascade,
  nome text not null,
  cep text null,
  endereco_linha text null,
  cidade text null,
  uf text null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists idx_cliente_unidades_cliente_id on public.cliente_unidades (cliente_id);
create index if not exists idx_cliente_unidades_ativo on public.cliente_unidades (cliente_id, ativo);

comment on table public.cliente_unidades is 'Unidades/lojas do cliente (CEP e endereço para distância e divulgação).';
comment on column public.cliente_unidades.nome is 'Nome amigável exibido no dropdown (ex.: Tapí SP Norte).';

create table if not exists public.cliente_cargos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes (id) on delete cascade,
  nome text not null,
  descricao_padrao text null,
  ativo boolean not null default true,
  ordem integer not null default 0,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists idx_cliente_cargos_cliente_id on public.cliente_cargos (cliente_id);
create index if not exists idx_cliente_cargos_ativo on public.cliente_cargos (cliente_id, ativo);

comment on table public.cliente_cargos is 'Cargos cadastrados pelo cliente; descrição padrão para pré-preencher a vaga.';
comment on column public.cliente_cargos.descricao_padrao is 'Texto base da divulgação (editável na vaga).';

drop trigger if exists trg_cliente_unidades_set_atualizado_em on public.cliente_unidades;
create trigger trg_cliente_unidades_set_atualizado_em
before update on public.cliente_unidades
for each row execute function public.set_atualizado_em();

drop trigger if exists trg_cliente_cargos_set_atualizado_em on public.cliente_cargos;
create trigger trg_cliente_cargos_set_atualizado_em
before update on public.cliente_cargos
for each row execute function public.set_atualizado_em();

-- ---------------------------------------------------------------------------
-- Novas colunas em vagas
-- ---------------------------------------------------------------------------
alter table public.vagas add column if not exists titulo_publicacao text null;
alter table public.vagas add column if not exists quantidade_vagas integer null;
alter table public.vagas add column if not exists modelo_contratacao text null;
alter table public.vagas add column if not exists prazo_contratacao date null;
alter table public.vagas add column if not exists beneficios_json jsonb null;
alter table public.vagas add column if not exists unidade_id uuid null;
alter table public.vagas add column if not exists cargo_catalogo_id uuid null;

comment on column public.vagas.titulo_publicacao is 'Nome da vaga na divulgação (pode diferir do cargo canônico).';
comment on column public.vagas.quantidade_vagas is 'Número de posições abertas; padrão lógico 1 no app se null.';
comment on column public.vagas.modelo_contratacao is 'Ex.: CLT, PJ, estágio.';
comment on column public.vagas.prazo_contratacao is 'Prazo desejado para contratação.';
comment on column public.vagas.beneficios_json is 'Benefícios estruturados, ex.: {"vale_alimentacao":500,"vale_transporte":true}.';
comment on column public.vagas.unidade_id is 'FK para cliente_unidades; complementa o campo texto unidade legado.';
comment on column public.vagas.cargo_catalogo_id is 'FK para cliente_cargos; cargo continua em texto para histórico.';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'vagas_unidade_id_fkey'
      and conrelid = 'public.vagas'::regclass
  ) then
    alter table public.vagas
      add constraint vagas_unidade_id_fkey
      foreign key (unidade_id) references public.cliente_unidades (id)
      on delete set null;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'vagas_cargo_catalogo_id_fkey'
      and conrelid = 'public.vagas'::regclass
  ) then
    alter table public.vagas
      add constraint vagas_cargo_catalogo_id_fkey
      foreign key (cargo_catalogo_id) references public.cliente_cargos (id)
      on delete set null;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'vagas_quantidade_vagas_check'
      and conrelid = 'public.vagas'::regclass
  ) then
    alter table public.vagas
      add constraint vagas_quantidade_vagas_check
      check (quantidade_vagas is null or quantidade_vagas >= 1);
  end if;
end
$$;

create index if not exists idx_vagas_unidade_id on public.vagas (unidade_id);
create index if not exists idx_vagas_cargo_catalogo_id on public.vagas (cargo_catalogo_id);

-- Garante que unidade_id e cargo_catalogo_id pertencem ao mesmo cliente_id da vaga.
create or replace function public.trg_vagas_catalogo_mesmo_cliente()
returns trigger
language plpgsql
as $$
begin
  if new.unidade_id is not null then
    if not exists (
      select 1
      from public.cliente_unidades u
      where u.id = new.unidade_id
        and u.cliente_id = new.cliente_id
    ) then
      raise exception 'unidade_id não pertence ao cliente_id desta vaga';
    end if;
  end if;
  if new.cargo_catalogo_id is not null then
    if not exists (
      select 1
      from public.cliente_cargos cc
      where cc.id = new.cargo_catalogo_id
        and cc.cliente_id = new.cliente_id
    ) then
      raise exception 'cargo_catalogo_id não pertence ao cliente_id desta vaga';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_vagas_catalogo_mesmo_cliente on public.vagas;
create trigger trg_vagas_catalogo_mesmo_cliente
before insert or update of cliente_id, unidade_id, cargo_catalogo_id on public.vagas
for each row execute function public.trg_vagas_catalogo_mesmo_cliente();

-- ---------------------------------------------------------------------------
-- RLS: mesmo padrão de vagas (cliente ligado ao e-mail do JWT)
-- ---------------------------------------------------------------------------
alter table public.cliente_unidades enable row level security;
alter table public.cliente_cargos enable row level security;

drop policy if exists "cliente_unidades_select_own" on public.cliente_unidades;
create policy "cliente_unidades_select_own"
  on public.cliente_unidades for select
  to authenticated
  using (
    cliente_id in (
      select c.id from public.clientes c
      where lower(trim(c.email)) = lower(trim((select auth.jwt() ->> 'email')))
    )
  );

drop policy if exists "cliente_unidades_insert_own" on public.cliente_unidades;
create policy "cliente_unidades_insert_own"
  on public.cliente_unidades for insert
  to authenticated
  with check (
    cliente_id in (
      select c.id from public.clientes c
      where lower(trim(c.email)) = lower(trim((select auth.jwt() ->> 'email')))
    )
  );

drop policy if exists "cliente_unidades_update_own" on public.cliente_unidades;
create policy "cliente_unidades_update_own"
  on public.cliente_unidades for update
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

drop policy if exists "cliente_unidades_delete_own" on public.cliente_unidades;
create policy "cliente_unidades_delete_own"
  on public.cliente_unidades for delete
  to authenticated
  using (
    cliente_id in (
      select c.id from public.clientes c
      where lower(trim(c.email)) = lower(trim((select auth.jwt() ->> 'email')))
    )
  );

drop policy if exists "cliente_cargos_select_own" on public.cliente_cargos;
create policy "cliente_cargos_select_own"
  on public.cliente_cargos for select
  to authenticated
  using (
    cliente_id in (
      select c.id from public.clientes c
      where lower(trim(c.email)) = lower(trim((select auth.jwt() ->> 'email')))
    )
  );

drop policy if exists "cliente_cargos_insert_own" on public.cliente_cargos;
create policy "cliente_cargos_insert_own"
  on public.cliente_cargos for insert
  to authenticated
  with check (
    cliente_id in (
      select c.id from public.clientes c
      where lower(trim(c.email)) = lower(trim((select auth.jwt() ->> 'email')))
    )
  );

drop policy if exists "cliente_cargos_update_own" on public.cliente_cargos;
create policy "cliente_cargos_update_own"
  on public.cliente_cargos for update
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

drop policy if exists "cliente_cargos_delete_own" on public.cliente_cargos;
create policy "cliente_cargos_delete_own"
  on public.cliente_cargos for delete
  to authenticated
  using (
    cliente_id in (
      select c.id from public.clientes c
      where lower(trim(c.email)) = lower(trim((select auth.jwt() ->> 'email')))
    )
  );
