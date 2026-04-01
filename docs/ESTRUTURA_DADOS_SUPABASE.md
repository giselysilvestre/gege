# Estrutura real do Supabase (snapshot)

Fonte: leitura direta do projeto Supabase via MCP em 2026-03-30 (não inferido por migrations antigas).

## Tabelas públicas encontradas

- `candidatos` (RLS: ON, ~865 linhas)
- `entrevistas` (RLS: ON)
- `clientes` (RLS: ON)
- `vagas` (RLS: ON)
- `candidaturas` (RLS: ON)
- `candidatos_experiencia` (RLS: OFF)
- `candidatos_analise` (RLS: OFF)
- `cliente_unidades` (RLS: ON)
- `cliente_cargos` (RLS: ON)

## Enums reais em uso

- `status_vaga_enum`: `aberta`, `em_selecao`, `fechada`, `cancelada`
- `status_candidatura`: `novo`, `em_triagem`, `aprovado`, `reprovado`, `contratado`, `desistiu`, `em_entrevista`, `em_teste`

## Ponto crítico (causa de bugs recentes)

A tabela `public.candidatos` no ambiente atual **não possui** vários campos que o frontend vinha lendo, como:

- `score`
- `exp_total_meses`
- `exp_total_empregos`
- `exp_instabilidade_pct`
- `exp_alimentacao_meses`
- `exp_atendimento_meses`
- `exp_cozinha_meses`
- `exp_lideranca_meses`
- `exp_resumo`

Esses dados existem hoje principalmente em:

- `public.candidatos_analise` (tags, scores IA, resumos)
- `public.candidatos_experiencia` (histórico de experiência)

## Colunas confirmadas em `public.candidatos` (resumo)

- identificação/contato: `id`, `nome`, `telefone`, `email`
- localização: `cidade`, `cep`, `bairro`
- perfil básico: `origem`, `situacao_emprego`, `escolaridade`, `cargo_principal`, `data_nascimento`, `genero`
- sistema: `disponivel`, `curriculo_url`, `gmail_message_id`, `criado_em`, `atualizado_em`, `created_at`

## Colunas confirmadas em `public.candidaturas` (resumo)

- `id`, `candidato_id`, `vaga_id`, `status`
- `score_compatibilidade`
- `tags` (`text[]`)
- `distancia_km`
- `observacao`
- `enviado_em`, `atualizado_em`

## Colunas confirmadas em `public.vagas` (resumo)

- base: `id`, `cliente_id`, `cargo`, `status_vaga`, `criado_em`, `fechada_em`
- divulgação: `titulo_publicacao`, `descricao`, `slug`
- operação: `salario`, `beneficios`, `escala`, `horario`, `cep_loja`, `unidade`
- catálogo: `unidade_id`, `cargo_catalogo_id`
- extras: `criterios_json`, `beneficios_json`, `quantidade_vagas`, `modelo_contratacao`, `prazo_contratacao`

## RLS atual (políticas detectadas)

- `candidatos`: `SELECT` autenticado (`candidatos_select_authenticated`)
- `candidaturas`: `SELECT` autenticado + escrita restrita por vaga do cliente
- `vagas`: `SELECT` autenticado + escrita restrita por cliente
- `clientes`: `SELECT` autenticado + escrita vinculada por email
- `cliente_unidades` e `cliente_cargos`: políticas `*_own` para select/insert/update/delete

## Diretriz para código daqui pra frente

1. Não assumir colunas de `candidatos` que só existem em `candidatos_analise`/`candidatos_experiencia`.
2. Para listagens operacionais, priorizar:
   - base: `candidaturas`
   - join nominal: `candidatos` (nome, bairro, cidade, situacao_emprego)
   - enriquecimento: `candidatos_analise` (tags/scores/resumo) quando necessário.
3. Manter endpoint com fallback de schema para reduzir regressões entre ambientes.

