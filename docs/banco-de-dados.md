# Banco de dados Gegê (Supabase / PostgreSQL)

Documentação do schema **a partir das migrations** em `supabase/migrations/` e do uso no código. A ordem de aplicação é **numérica** (`001_`, `002_`, …).

## Enums

Definidos em `002_schema_banco_talentos.sql` (com `do $$` idempotente):

| Enum | Valores (principais) |
|------|----------------------|
| `status_candidatura` | `novo`, `em_triagem`, `em_entrevista`, `em_teste`, `reprovado`, `contratado`, `desistiu` (+ variantes normalizadas em migrations posteriores, ex. `entrevista`, `aprovado` — ver `017`, `018`) |
| `status_vaga_enum` | `aberta`, `em_selecao`, `fechada`, `cancelada` |

## Tabelas principais

### `public.candidatos`

Pessoa física no banco de talentos. Evolução: `001` (legado), `002` (schema completo), `009` (cargo, metadados Gmail/IA), `031` (`data_nascimento`).

**Campos relevantes (não exaustivo):** `id`, `nome`, `telefone` (único), `email` (único opcional), `cep`, `bairro`, `cidade`, `origem`, `situacao_emprego`, `disponibilidade_horario`, `exp_resumo`, `exp_total_meses`, `exp_total_empregos`, `exp_instabilidade_pct`, `exp_*_meses` (alimentação, atendimento, cozinha, liderança), `escolaridade`, competências (texto), `score`, `disponivel` (boolean, default true), `curriculo_url`, `cargo` / campos de negócio, `data_nascimento` (migration `031`), `criado_em`, `atualizado_em`.

**Índices (exemplos):** telefone, cidade, score, disponível, compostos em `020`, `024`.

### `public.clientes`

Empresa (franquia/cliente). `003`, `005` (marketing: descricao, sobre, instagram, whatsapp — parte migrada para configurações depois).

**Campos:** `id`, dados de contato, `slug`, `criado_em`, etc.

### `public.vagas`

Vaga de emprego ligada a `cliente_id`. Extensões: `006` (slug, cep, descricao), `012` (`unidade_id`), `013` (título publicação, quantidade, modelo, prazo, benefícios JSON, `cargo_catalogo_id`).

**Campos:** `cargo`, `salario`, `escala`, `horario`, `endereco`, `status_vaga`, `slug`, `fechada_em`, FKs opcionais para unidade e catálogo de cargo.

### `public.candidaturas`

Inscrição de um candidato em uma vaga. `008` adiciona `tags` (text[]). `005`/`015` campos como `distancia_km`, `score_compatibilidade`, `enviado_em`, `atualizado_em`, `status`.

**Relação:** `candidato_id` → `candidatos`, `vaga_id` → `vagas`.

### `public.candidatos_experiencia`

**Não há `CREATE TABLE` nas migrations deste repositório** — a tabela é usada pelo `gege-cv-processor` e deve existir no projeto Supabase. Colunas inferidas do insert no código:

`candidato_id`, `empresa`, `cargo`, `setor`, `data_inicio`, `data_fim`, `meses`, `eh_lideranca`, `crescimento_interno`.

### `public.candidatos_analise`

Análise de IA + scores por candidato. **Mesma ressalva:** criada/fora do pacote de migrations versionadas aqui; referenciada em `021`, `022`, `024`.

Colunas usadas pelo processador e pela view: `candidato_id`, `perfil_resumo`, `pontos_fortes`, `red_flags`, `fit_food_service`, `analise_completa`, `score_ia`, `score_pos_entrevista`, `score_final`, `tags` (text[]), `ultima_experiencia`, `modelo_usado`, `processado_em`, `atualizado_em`.

### `public.entrevistas`

Perguntas/respostas por candidato (`002`).

### `public.cliente_unidades` / `public.cliente_cargos`

Catálogo por cliente (`013`). **Cargos** estendidos em `029`: `salario_referencia`, `modalidade`, `atividades`, `requisitos_obrigatorios`, `requisitos_desejaveis`.

### `public.cliente_configuracoes`

Uma linha por cliente (`025`): marca, logo, cor primária (carreira), textos da página de carreira, URLs, redes. `027` contatos; `028` `carreira_texto_cor`.

## Views

| View | Finalidade |
|------|------------|
| `vw_candidato_score_ia_atual` (`022`) | Última análise por candidato; `score_ia_atual` = coalesce(score_ia, score_pos_entrevista, score_final). |
| `vw_candidaturas_enriquecida` (`023`, `030`) | Junta candidatura + vaga + candidato + score IA; base da API `/api/candidatos/list`. `030` adiciona colunas `exp_*` e `exp_resumo` do candidato. |

## Storage

- Bucket **`cliente-assets`** (`026`): logos e capas de carreira; políticas para leitura pública e escrita autenticada.

## RLS (visão geral)

Políticas evoluem em `004`, `016`, `019`, etc.: em geral, usuários **authenticated** enxergam dados do **cliente** cujo `clientes.email` coincide com o e-mail do JWT. Tabelas de configuração (`025`+) repetem o padrão “próprio `cliente_id`”.

**Service role** bypassa RLS — usar só no servidor.

## Índices de performance

Concentrados em `020`, `024`: `vagas` por cliente/status, `candidaturas` por vaga/status/enviado_em, `candidatos` por disponível/criado_em, `candidatos_analise` por candidato e data de processamento.

## Seeds e utilitários

- `014_seed_50_candidaturas_vaga_fixa.sql` — dados de demo (opcional).
- `011` — remoção de duplicata específica.

## Como manter este documento

Ao adicionar migration, atualize esta página: nova tabela/coluna, view ou mudança de RLS. A fonte da verdade continua sendo o SQL em `supabase/migrations/`.
