-- Classificação geográfica: bairro → região (candidato) e viabilidade por vaga.

-- ---------------------------------------------------------------------------
-- Dicionário bairro + cidade → região macro
-- ---------------------------------------------------------------------------
create table if not exists public.geo_bairros (
  id uuid primary key default gen_random_uuid(),
  cidade text not null,
  uf text not null default 'RJ',
  bairro text not null,
  regiao text not null,
  criado_em timestamptz not null default now(),
  constraint geo_bairros_regiao_check check (
    regiao in (
      'zona_sul',
      'zona_norte',
      'zona_oeste',
      'zona_leste',
      'centro',
      'baixada',
      'niteroi',
      'indefinido'
    )
  )
);

create unique index if not exists geo_bairros_cidade_uf_bairro_key
  on public.geo_bairros (lower(trim(cidade)), lower(trim(uf)), lower(trim(bairro)));

create index if not exists geo_bairros_regiao_idx on public.geo_bairros (regiao);

comment on table public.geo_bairros is
  'Mapeamento bairro+cidade → região macro (ex.: Rocinha → zona_sul).';

-- ---------------------------------------------------------------------------
-- Candidato: região derivada de cidade/bairro
-- ---------------------------------------------------------------------------
alter table public.candidatos
  add column if not exists regiao text null;

alter table public.candidatos
  drop constraint if exists candidatos_regiao_check;

alter table public.candidatos
  add constraint candidatos_regiao_check check (
    regiao is null
    or regiao in (
      'zona_sul',
      'zona_norte',
      'zona_oeste',
      'zona_leste',
      'centro',
      'baixada',
      'niteroi',
      'indefinido'
    )
  );

comment on column public.candidatos.regiao is
  'Região macro de residência (derivada de cidade/bairro via geo_bairros ou regra de cidade).';

-- ---------------------------------------------------------------------------
-- Candidatura: viabilidade geográfica para a loja da vaga
-- ---------------------------------------------------------------------------
alter table public.candidaturas
  add column if not exists viabilidade_geografica text null;

alter table public.candidaturas
  drop constraint if exists candidaturas_viabilidade_geografica_check;

alter table public.candidaturas
  add constraint candidaturas_viabilidade_geografica_check check (
    viabilidade_geografica is null
    or viabilidade_geografica in ('viavel', 'limitrofe', 'inviavel', 'indefinido')
  );

comment on column public.candidaturas.viabilidade_geografica is
  'Compatibilidade geográfica candidato × loja da vaga (viavel, limitrofe, inviavel, indefinido).';

-- ---------------------------------------------------------------------------
-- Unidade/loja: região da loja
-- ---------------------------------------------------------------------------
alter table public.cliente_unidades
  add column if not exists regiao text null;

alter table public.cliente_unidades
  drop constraint if exists cliente_unidades_regiao_check;

alter table public.cliente_unidades
  add constraint cliente_unidades_regiao_check check (
    regiao is null
    or regiao in (
      'zona_sul',
      'zona_norte',
      'zona_oeste',
      'zona_leste',
      'centro',
      'baixada',
      'niteroi',
      'indefinido'
    )
  );

comment on column public.cliente_unidades.regiao is
  'Região macro da loja (ex.: Copacabana → zona_sul).';
