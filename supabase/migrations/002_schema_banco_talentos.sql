-- Gegê - Schema completo do banco de talentos
-- Execute no SQL Editor do Supabase.
-- Seguro para rodar mais de uma vez (idempotente na maior parte dos objetos).

create extension if not exists pgcrypto;

-- ============================================================================
-- ENUMS
-- ============================================================================

do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'status_candidatura'
  ) then
    create type public.status_candidatura as enum (
      'novo',
      'em_triagem',
      'em_entrevista',
      'em_teste',
      'reprovado',
      'contratado',
      'desistiu'
    );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'status_vaga_enum'
  ) then
    create type public.status_vaga_enum as enum (
      'aberta',
      'em_selecao',
      'fechada',
      'cancelada'
    );
  end if;
end
$$;

-- ============================================================================
-- TABELAS
-- ============================================================================

create table if not exists public.candidatos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  telefone text not null,
  email text null,
  cep text null,
  bairro text null,
  cidade text null,
  origem text null,
  situacao_emprego text null,
  motivo_saida text null,
  disponibilidade_horario text null,
  composicao_familiar text null,
  exp_resumo text null,
  exp_total_meses integer null,
  exp_total_empregos integer null,
  exp_instabilidade_pct numeric(5,2) null check (exp_instabilidade_pct >= 0 and exp_instabilidade_pct <= 100),
  exp_alimentacao_meses integer null,
  exp_atendimento_meses integer null,
  exp_cozinha_meses integer null,
  exp_lideranca_meses integer null,
  escolaridade text null,
  competencias_gerais text null,
  competencias_comportamentais text null,
  competencias_tecnicas text null,
  score integer null check (score >= 0 and score <= 100),
  disponivel boolean not null default true,
  vagas_compativeis uuid[] null,
  curriculo_url text null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'candidatos_telefone_key'
      and conrelid = 'public.candidatos'::regclass
  ) then
    alter table public.candidatos
      add constraint candidatos_telefone_key unique (telefone);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'candidatos_email_key'
      and conrelid = 'public.candidatos'::regclass
  ) then
    alter table public.candidatos
      add constraint candidatos_email_key unique (email);
  end if;
end
$$;

create table if not exists public.entrevistas (
  id uuid primary key default gen_random_uuid(),
  candidato_id uuid not null references public.candidatos(id) on delete cascade,
  numero integer not null check (numero > 0),
  pergunta text not null,
  resposta text null,
  nota integer null check (nota >= 0 and nota <= 10),
  criado_em timestamptz not null default now()
);

create table if not exists public.clientes (
  id uuid primary key default gen_random_uuid(),
  nome_empresa text not null,
  nome_contato text null,
  telefone text not null,
  email text null,
  cep text null,
  bairro text null,
  cidade text null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'clientes_telefone_key'
      and conrelid = 'public.clientes'::regclass
  ) then
    alter table public.clientes
      add constraint clientes_telefone_key unique (telefone);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'clientes_email_key'
      and conrelid = 'public.clientes'::regclass
  ) then
    alter table public.clientes
      add constraint clientes_email_key unique (email);
  end if;
end
$$;

create table if not exists public.vagas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  cargo text not null,
  salario numeric(10,2) null,
  beneficios text null,
  escala text null,
  horario text null,
  status_vaga public.status_vaga_enum not null default 'aberta',
  criado_em timestamptz not null default now(),
  fechada_em timestamptz null
);

create table if not exists public.candidaturas (
  id uuid primary key default gen_random_uuid(),
  candidato_id uuid not null references public.candidatos(id) on delete cascade,
  vaga_id uuid not null references public.vagas(id) on delete cascade,
  status public.status_candidatura not null default 'novo',
  score_compatibilidade integer null check (score_compatibilidade >= 0 and score_compatibilidade <= 100),
  observacao text null,
  enviado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (candidato_id, vaga_id)
);

-- ============================================================================
-- INDICES
-- ============================================================================

create index if not exists idx_candidatos_telefone on public.candidatos (telefone);
create index if not exists idx_candidatos_cidade on public.candidatos (cidade);
create index if not exists idx_candidatos_score on public.candidatos (score);
create index if not exists idx_candidatos_disponivel on public.candidatos (disponivel);

create index if not exists idx_entrevistas_candidato_id on public.entrevistas (candidato_id);
create index if not exists idx_entrevistas_numero on public.entrevistas (numero);

create index if not exists idx_clientes_telefone on public.clientes (telefone);
create index if not exists idx_clientes_cidade on public.clientes (cidade);

create index if not exists idx_vagas_cliente_id on public.vagas (cliente_id);
create index if not exists idx_vagas_status_vaga on public.vagas (status_vaga);
create index if not exists idx_vagas_cargo on public.vagas (cargo);

create index if not exists idx_candidaturas_candidato_id on public.candidaturas (candidato_id);
create index if not exists idx_candidaturas_vaga_id on public.candidaturas (vaga_id);
create index if not exists idx_candidaturas_status on public.candidaturas (status);

-- Opcional de regra de negócio: candidato só em um processo ativo por vez.
-- Considera ativo quando status está em em_triagem/em_entrevista/em_teste.
create unique index if not exists uq_candidaturas_candidato_ativo
  on public.candidaturas (candidato_id)
  where status in ('em_triagem', 'em_entrevista', 'em_teste');

-- ============================================================================
-- TRIGGERS E FUNCOES
-- ============================================================================

create or replace function public.set_atualizado_em()
returns trigger
language plpgsql
as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

drop trigger if exists trg_candidatos_set_atualizado_em on public.candidatos;
create trigger trg_candidatos_set_atualizado_em
before update on public.candidatos
for each row execute function public.set_atualizado_em();

drop trigger if exists trg_clientes_set_atualizado_em on public.clientes;
create trigger trg_clientes_set_atualizado_em
before update on public.clientes
for each row execute function public.set_atualizado_em();

drop trigger if exists trg_candidaturas_set_atualizado_em on public.candidaturas;
create trigger trg_candidaturas_set_atualizado_em
before update on public.candidaturas
for each row execute function public.set_atualizado_em();

create or replace function public.recalcular_disponibilidade_candidato(p_candidato_id uuid)
returns void
language plpgsql
as $$
declare
  v_tem_ativo boolean;
begin
  select exists (
    select 1
    from public.candidaturas c
    where c.candidato_id = p_candidato_id
      and c.status in ('em_triagem', 'em_entrevista', 'em_teste', 'contratado')
  )
  into v_tem_ativo;

  update public.candidatos
  set disponivel = not v_tem_ativo
  where id = p_candidato_id;
end;
$$;

create or replace function public.trg_candidaturas_sync_disponivel()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    perform public.recalcular_disponibilidade_candidato(old.candidato_id);
    return old;
  end if;

  perform public.recalcular_disponibilidade_candidato(new.candidato_id);

  if tg_op = 'UPDATE' and old.candidato_id <> new.candidato_id then
    perform public.recalcular_disponibilidade_candidato(old.candidato_id);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_candidaturas_sync_disponivel on public.candidaturas;
create trigger trg_candidaturas_sync_disponivel
after insert or update or delete on public.candidaturas
for each row execute function public.trg_candidaturas_sync_disponivel();

-- ============================================================================
-- STORAGE
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('curriculos', 'curriculos', false)
on conflict (id) do nothing;

-- ============================================================================
-- RLS
-- ============================================================================

alter table public.candidatos enable row level security;
alter table public.entrevistas enable row level security;
alter table public.clientes enable row level security;
alter table public.vagas enable row level security;
alter table public.candidaturas enable row level security;

-- ============================================================================
-- COMENTARIOS
-- ============================================================================

comment on table public.candidatos is 'Perfil completo do candidato no banco de talentos da Gegê.';
comment on column public.candidatos.nome is 'Nome completo do candidato.';
comment on column public.candidatos.telefone is 'Telefone principal (chave de contato, único).';
comment on column public.candidatos.email is 'Email do candidato (único quando informado).';
comment on column public.candidatos.cep is 'CEP residencial informado.';
comment on column public.candidatos.bairro is 'Bairro residencial.';
comment on column public.candidatos.cidade is 'Cidade residencial.';
comment on column public.candidatos.origem is 'Origem de captação: indeed, whatsapp, manual, indicacao etc.';
comment on column public.candidatos.situacao_emprego is 'Situação atual: empregado, desempregado etc.';
comment on column public.candidatos.motivo_saida is 'Motivo de saída do último emprego.';
comment on column public.candidatos.disponibilidade_horario is 'Disponibilidade de horário (ex.: manhã/noite/fins de semana).';
comment on column public.candidatos.composicao_familiar is 'Composição familiar (campo opcional).';
comment on column public.candidatos.exp_resumo is 'Resumo textual de experiências anteriores (extraído de CV e entrevista).';
comment on column public.candidatos.exp_total_meses is 'Tempo total de experiência profissional em meses.';
comment on column public.candidatos.exp_total_empregos is 'Quantidade de empregos anteriores.';
comment on column public.candidatos.exp_instabilidade_pct is 'Percentual de empregos com duração menor que 3 meses (0 a 100).';
comment on column public.candidatos.exp_alimentacao_meses is 'Experiência no setor de alimentação em meses.';
comment on column public.candidatos.exp_atendimento_meses is 'Experiência em atendimento ao cliente em meses.';
comment on column public.candidatos.exp_cozinha_meses is 'Experiência em cozinha em meses.';
comment on column public.candidatos.exp_lideranca_meses is 'Experiência em liderança/supervisão em meses.';
comment on column public.candidatos.escolaridade is 'Escolaridade declarada.';
comment on column public.candidatos.competencias_gerais is 'Resumo de competências gerais.';
comment on column public.candidatos.competencias_comportamentais is 'Resumo de competências comportamentais.';
comment on column public.candidatos.competencias_tecnicas is 'Resumo de competências técnicas.';
comment on column public.candidatos.score is 'Score base do perfil (0-100), calculado após entrevistas.';
comment on column public.candidatos.disponivel is 'Disponibilidade para novos processos (sincronizado via candidaturas).';
comment on column public.candidatos.vagas_compativeis is 'IDs de vagas compatíveis sugeridos pela IA.';
comment on column public.candidatos.curriculo_url is 'URL do currículo no bucket curriculos do Supabase Storage.';
comment on column public.candidatos.criado_em is 'Timestamp de criação do registro.';
comment on column public.candidatos.atualizado_em is 'Timestamp de última atualização do registro.';

comment on table public.entrevistas is 'Perguntas e respostas das entrevistas feitas pela IA (Gê) por candidato.';
comment on column public.entrevistas.candidato_id is 'Candidato dono da entrevista.';
comment on column public.entrevistas.numero is 'Número da entrevista (1 = confirmação, 2 = comportamental etc).';
comment on column public.entrevistas.pergunta is 'Pergunta feita ao candidato.';
comment on column public.entrevistas.resposta is 'Resposta do candidato (pode ser nula).';
comment on column public.entrevistas.nota is 'Nota da IA para a resposta (0-10).';
comment on column public.entrevistas.criado_em is 'Timestamp de criação da pergunta/resposta.';

comment on table public.clientes is 'Empresas clientes que abrem vagas na plataforma.';
comment on column public.clientes.nome_empresa is 'Nome da empresa cliente.';
comment on column public.clientes.nome_contato is 'Pessoa responsável no cliente.';
comment on column public.clientes.telefone is 'Telefone de contato do cliente (único).';
comment on column public.clientes.email is 'Email de contato do cliente (único quando informado).';
comment on column public.clientes.cep is 'CEP do cliente.';
comment on column public.clientes.bairro is 'Bairro do cliente.';
comment on column public.clientes.cidade is 'Cidade do cliente.';
comment on column public.clientes.criado_em is 'Timestamp de criação do cliente.';
comment on column public.clientes.atualizado_em is 'Timestamp de última atualização do cliente.';

comment on table public.vagas is 'Vagas abertas por clientes para contratação.';
comment on column public.vagas.cliente_id is 'Cliente dono da vaga.';
comment on column public.vagas.cargo is 'Cargo da vaga (ex.: atendente, cozinheiro).';
comment on column public.vagas.salario is 'Faixa salarial da vaga.';
comment on column public.vagas.beneficios is 'Benefícios da vaga.';
comment on column public.vagas.escala is 'Escala de trabalho (ex.: 6x1).';
comment on column public.vagas.horario is 'Horário de trabalho da vaga.';
comment on column public.vagas.status_vaga is 'Status atual da vaga: aberta, em_selecao, fechada, cancelada.';
comment on column public.vagas.criado_em is 'Timestamp de criação da vaga.';
comment on column public.vagas.fechada_em is 'Timestamp de fechamento/cancelamento da vaga.';

comment on table public.candidaturas is 'Relação candidato x vaga, com status e score de compatibilidade.';
comment on column public.candidaturas.candidato_id is 'Candidato aplicado na vaga.';
comment on column public.candidaturas.vaga_id is 'Vaga relacionada à candidatura.';
comment on column public.candidaturas.status is 'Status do candidato no processo da vaga.';
comment on column public.candidaturas.score_compatibilidade is 'Score de compatibilidade (0-100) para esta vaga específica.';
comment on column public.candidaturas.observacao is 'Anotações do recrutador sobre essa candidatura.';
comment on column public.candidaturas.enviado_em is 'Data/hora de envio do candidato para a vaga.';
comment on column public.candidaturas.atualizado_em is 'Data/hora da última atualização da candidatura.';
