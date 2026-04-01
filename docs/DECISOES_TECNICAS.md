# Decisões técnicas do produto (Gegê)

Este documento registra **as decisões técnicas** do produto Gegê (o “porquê” e o “como”), com base no código e nas migrations existentes no repositório.

## Objetivo do produto

- **Problema**: ajudar recrutadores a **gerenciar candidatos** do “banco de talentos”, criar/gerir **vagas** e acompanhar **candidaturas** (candidato × vaga), com um **score de compatibilidade** para priorização.
- **Usuários**:
  - **Recrutador/cliente**: acessa um painel autenticado, cria vagas e move candidatos entre etapas.
  - **Candidato**: é uma entidade armazenada no Supabase; não há UI de candidato neste repositório.

## Arquitetura (visão geral)

- **Frontend**: Next.js (App Router) + React + TypeScript.
  - UI majoritariamente com **estilos inline** (CSS-in-JS via `style={{...}}`) para rapidez e consistência visual sem depender de componentes externos.
  - Integração direta com Supabase no browser/servidor do Next (com RLS).
- **Backend**: Node.js + Express + TypeScript (compilado) para um CRUD simples de `candidatos`.
  - Usa **Supabase service role** (chave “admin”) para acessar o banco mesmo com RLS (Row Level Security) habilitado.
- **Banco**: Supabase (PostgreSQL + Auth + Storage).
  - Tabelas principais: `candidatos`, `clientes`, `vagas`, `candidaturas`, `entrevistas`.
  - Bucket de Storage: `curriculos` (privado) para arquivos de currículo.

## Decisão: Supabase como “single backend”

- **Por quê**:
  - Entrega rápida: banco + autenticação + políticas de acesso + storage no mesmo serviço.
  - Menos infraestrutura própria.
- **Como**:
  - **RLS ligado** nas tabelas do produto.
  - **Políticas** (migrations) restringem “vagas/candidaturas” ao cliente logado e liberam leitura do “banco de talentos” para usuários autenticados.

## Modelo de dados (entidades e regras)

Baseado em `supabase/migrations/002_schema_banco_talentos.sql` e migrations complementares.

### `candidatos`

- **Identidade**: `id` (UUID).
- **Contato**: `telefone` é **único** (constraint) e obrigatório no schema atual; `email` pode existir e também tem unique quando informado.
- **Perfil e sinais**:
  - `score` (0–100) do perfil.
  - Experiências: total, empregos, instabilidade %, e meses por área (alimentação, atendimento, cozinha, liderança).
  - `competencias_*` (gerais/comportamentais/técnicas).
  - `curriculo_url`: URL para currículo (geralmente do Storage).
- **Disponibilidade**:
  - Campo `disponivel` é sincronizado via trigger em `candidaturas` (ver abaixo).

### `clientes`

- Representa a empresa/recrutador.
- Campos extras para páginas públicas/marketing (migration `005_prompt_extras.sql`): `descricao`, `sobre`, `instagram`, `whatsapp`, `slug`.

### `vagas`

- Vaga pertence a um `cliente_id`.
- Status: enum `status_vaga_enum` (`aberta`, `em_selecao`, `fechada`, `cancelada`).

### `candidaturas`

- Relação `candidato_id` × `vaga_id` com:
  - `status` (enum `status_candidatura`: `novo`, `em_triagem`, `aprovado`, `reprovado`, `contratado`)
  - `score_compatibilidade` (0–100) específico por vaga
  - `observacao`
  - timestamps (`enviado_em`, `atualizado_em`)
- **Regra de unicidade**: `unique (candidato_id, vaga_id)`.
- **Regra opcional** (índice parcial): um candidato só pode estar em **processo ativo** por vez (`em_triagem`/`aprovado`).

### `entrevistas`

- Perguntas/respostas e notas por candidato, suportando entrevistas numeradas.

### Decisão: sincronizar `disponivel` via trigger

- **Por quê**: evitar inconsistência entre “status de processo” e “disponibilidade” do candidato.
- **Como**:
  - Trigger em `candidaturas` recalcula e atualiza `candidatos.disponivel` quando uma candidatura muda.
  - Considera “ativo” quando status está em `em_triagem`, `aprovado` ou `contratado`.

## Autenticação e autorização

### Frontend (Next.js + Supabase Auth)

- **Sessão em cookie** via `@supabase/ssr`.
- Middleware do Next (`frontend/middleware.ts`) aplica:
  - Redireciona `/` para `/dashboard` se logado, senão `/login`.
  - Bloqueia rotas privadas e manda para `/login?next=...` se não logado.
  - Deixa passar rotas públicas: `/login`, `/api` e `/gege-api`.
- Função de sessão (`frontend/src/lib/supabase/middleware.ts`):
  - Atualiza tokens e lê `user` com `supabase.auth.getSession()` e `getUser()`.
  - Exige envs `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

### Banco (RLS)

- Policies em `supabase/migrations/004_rls_policies_recruiter.sql`:
  - `clientes`: cada usuário vê/edita apenas o cadastro vinculado ao próprio email do JWT.
  - `vagas`: somente vagas do cliente logado.
  - `candidaturas`: somente candidaturas de vagas do cliente logado.
  - `candidatos`: leitura liberada para `authenticated` (banco de talentos compartilhado).

### Backend (Express)

- Usa `SUPABASE_SERVICE_ROLE_KEY` (service role) para acessar o Postgres via Supabase ignorando RLS.
- Exposição atual: rotas REST para `candidatos` em `/api/candidatos`.
- CORS configurado:
  - Em dev, aceita `http://localhost:*` e `http://127.0.0.1:*` (facilita desenvolvimento).
  - Em prod, recomenda-se restringir `CORS_ORIGIN`.

## Comunicação Frontend ↔ Backend (dev vs produção)

### Decisão: evitar CORS no browser em desenvolvimento

- **Problema**: frontend (porta 3000) chamando backend (porta 4000) pode bater em CORS.
- **Solução**: em dev, o browser chama o mesmo host do Next em `/gege-api/...` e o Next faz rewrite para o Express.
- **Implementação**: `frontend/next.config.ts`
  - `rewrites()` só em `NODE_ENV !== "production"`:
    - `source: /gege-api/:path*` → `destination: http://127.0.0.1:${GEGE_BACKEND_PORT||4000}/:path*`

Em produção, a decisão é usar uma URL pública da API (conforme README, `NEXT_PUBLIC_API_URL`).

## Decisão: “score exibido” com fallback determinístico

- **Contexto**: há dados legados com `score = 0`/`null`.
- **Objetivo**: sempre exibir um score útil para ordenação e UX, mesmo antes de backfills.
- **Como**:
  - `frontend/src/lib/score.ts` define `effectiveDisplayScore(id, raw)`:
    - Se `raw > 0`: usa `Math.round(raw)`.
    - Se `raw` não existir ou for 0: gera um valor determinístico **60–98** a partir do `id`.
  - Migration `007_candidatos_score_backfill.sql` aplica lógica similar no banco para preencher scores antigos.

### Decisão: “match” como regra única de tag

- Regra de negócio no UI: **tag “match”** quando score efetivo \(>= 90\).
- Mantida como critério consistente para filtros e contadores.

## Padrões de UI/UX adotados

- **Layout mobile-first** com:
  - fundo cinza claro `#F9FAFB`
  - cards brancos com `border: 1px solid #EAECF0` + `borderRadius: 12px` + `padding` consistente
  - tipografia com escala simples (títulos 16–18px, meta 9–12px)
- **Navegação**: `BottomNav` persistente.
- **Ações primárias**: botões de 44px de altura para acessibilidade (toque).
- **Tags/pills**: pequenas “pílulas” com cores semânticas (verde = positivo, amarelo = alerta, azul = info).

## API interna do Next (App Router)

- Existem rotas em `frontend/src/app/api/...` (por exemplo, criação de vaga e match).
- Decisão: usar rotas do próprio Next quando faz sentido (reduz dependência do Express para fluxos do painel).

## Tratamento de erros e resiliência

- Backend:
  - Cliente Supabase é **lazy** (sobe mesmo sem env completo; `/health` responde).
  - Erros são sanitizados para o usuário com `safeClientMessage()` (evita mensagens enormes/HTML).
- Frontend:
  - Middleware tem `try/catch` e, em falha, redireciona para login em rotas privadas.

## Segurança (decisões e limites)

- **Nunca expor service role no frontend**:
  - service role fica no `backend/.env`.
  - frontend usa anon key + sessão do usuário (RLS).
- **RLS ligado** como padrão.
- **Storage de currículos** definido como **não público** (`curriculos`, `public=false`), evitando vazamento por URL pública direta.

## Operação (scripts e execução)

- Frontend:
  - `npm run dev` em `frontend/` sobe Next em `3000`.
  - `transpilePackages` em `next.config.ts` evita problemas de chunks no Windows com pacotes do Supabase.
- Backend:
  - `npm run dev` em `backend/` sobe Express em `4000` com `tsx watch`.

## Pendências / pontos a revisar (decisões futuras)

Estas não são “bugs”, mas escolhas que normalmente precisam ser decididas conforme o produto amadurece:

- **Convergir backend**: hoje existe Express (CRUD) e também rotas API no Next; decidir se o Express fica só para integrações externas, ou se tudo migra para Next.
- **Políticas de candidatos**: leitura aberta para qualquer usuário autenticado (bom para “banco de talentos compartilhado”; pode ser ajustado se houver segmentação por cliente).
- **Observabilidade**: logs estruturados e rastreio de erros (Sentry, etc.) ainda não padronizados.

