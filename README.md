# Gegê

Aplicação **fullstack** para **recrutamento**: empresas (**clientes**) gerenciam **vagas** e consultam **candidatos**; há **login** e áreas logadas. O **frontend** é **Next.js** (site/app); os dados ficam no **Supabase** (banco PostgreSQL na nuvem). Existe ainda uma **API Express** usada para o **CRUD** (criar/listar/editar/apagar) de **candidatos** via rotas REST.

## Visão geral (linguagem simples)

- **O usuário** entra pelo **login**; páginas internas exigem sessão (quem não está logado é mandado para `/login`).
- **Dashboard**, **vagas** (lista, detalhe, nova vaga), **candidatos** (lista e ficha), **banco** e **carreira** são telas do app Next.js.
- **Dados principais** (vagas, clientes, regras de acesso) passam pelo **Supabase**, com **RLS** (regras no banco que limitam o que cada perfil vê) quando aplicável.
- A **API em Express** (`backend/`) é um **serviço separado** na porta **4000**: hoje concentra o CRUD de **candidatos**. Em desenvolvimento, o Next encaminha chamadas de `/gege-api` para esse serviço (evita bloqueio **CORS** entre portas).

## Estrutura do repositório

| Pasta | Descrição |
|-------|-----------|
| `frontend/` | Next.js (App Router), login, dashboards, rotas `app/api/*` que rodam no servidor Next. |
| `backend/` | API REST Express + TypeScript + cliente Supabase (**service role**) para `/api/candidatos`. |
| `supabase/migrations/` | Scripts SQL versionados (schema evoluiu além da tabela inicial `candidatos`). |

## Mapa das rotas principais (frontend)

| Caminho | Ideia |
|---------|--------|
| `/` | Redireciona para `/dashboard` ou `/login` conforme sessão. |
| `/login` | Entrada (autenticação Supabase). |
| `/dashboard` | Painel após login. |
| `/vagas`, `/vagas/nova`, `/vagas/[id]` | Lista, criação e detalhe de vaga. |
| `/candidatos`, `/candidatos/[id]` | Lista e detalhe de candidato. |
| `/banco`, `/carreira` | Outras áreas do produto. |

Rotas internas de API do Next (exemplos): `app/api/vagas/create`, `app/api/vagas/[id]/match` — executadas no **servidor Next**, não no Express.

## Banco de dados (Supabase)

- Aplique as migrations em ordem em `supabase/migrations/` (SQL Editor do painel ou **CLI** do Supabase).
- O schema atual cobre **candidatos**, **clientes**, **vagas**, **candidaturas** e políticas **RLS** (ver arquivos numerados `001_…`, `002_…`, etc.).
- **Chave service_role**: poder total no banco — só em **variáveis de servidor** (`backend/.env` e `frontend/.env.local` **sem** prefixo `NEXT_PUBLIC_`). Nunca no código que roda no navegador.

## Variáveis de ambiente

Copie da raiz o **`.env.example`** para:

- `backend/.env`
- `frontend/.env.local`

Resumo:

| Onde | Variáveis |
|------|-----------|
| **Backend** | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PORT`; em produção use `CORS_ORIGIN` com o domínio do frontend (evita abrir CORS para qualquer site). |
| **Frontend** | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (obrigatórias para login e dados via Supabase). `SUPABASE_SERVICE_ROLE_KEY` só no servidor Next para operações administrativas pontuais (nunca expor ao browser). |
| **Dev** | `GEGE_BACKEND_PORT` (opcional): porta do Express se não for `4000`. O proxy `/gege-api` no `next.config.ts` usa essa porta. |

## API Express (CRUD candidatos)

Base: `http://127.0.0.1:4000` (ou a URL configurada).

| Método | Rota | Ação |
|--------|------|------|
| GET | `/api/candidatos` | Lista todos |
| GET | `/api/candidatos/:id` | Detalhe |
| POST | `/api/candidatos` | Cria (JSON; `nome` e `telefone` obrigatórios) |
| PUT | `/api/candidatos/:id` | Atualiza (JSON parcial) |
| DELETE | `/api/candidatos/:id` | Remove |

`GET /health` — verificação rápida se a API está no ar.

**Segurança:** as rotas acima **não implementam autenticação** no código atual. Em produção, coloque a API atrás de **rede restrita**, **API key**, ou outro controle — não deixe a URL pública sem proteção se os dados forem sensíveis.

## Como rodar

1. Projeto no Supabase criado; migrations aplicadas; **Project URL** e chaves copiadas (Settings → API).

2. **`backend/.env`**: `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`.

3. **`frontend/.env.local`**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` e, se o app usar rotas que chamam admin no servidor, `SUPABASE_SERVICE_ROLE_KEY` (mesmo valor da service role do projeto — só servidor).

4. Na pasta raiz `gege/`:

   ```bash
   npm install
   npm run install:all
   npm run dev
   ```

   Sobe **backend (4000)** e **frontend (3000)**.

5. Abra [http://localhost:3000](http://localhost:3000).

## Scripts úteis

- Raiz: `npm run dev`, `npm run install:all`, `npm run clean:cache`.
- Backend: `npm run dev`, `npm run build`, `npm start`.
- Frontend: `npm run dev`, `npm run build`, `npm start`, `npm run lint`.

## Segurança (checklist)

- **Service role** apenas no servidor (backend e variáveis **sem** `NEXT_PUBLIC_` no Next).
- **Anon key** (`NEXT_PUBLIC_SUPABASE_ANON_KEY`) pode ir ao browser — é o esperado; proteção vem das políticas **RLS** e do desenho das queries.
- **Produção:** `CORS_ORIGIN` explícito no Express; proteger ou não expor a API de candidatos sem autenticação.

## Documentação

| Recurso | Link |
|---------|------|
| Índice `docs/` | [docs/README.md](./docs/README.md) |
| Banco de dados (schema, views, RLS) | [docs/banco-de-dados.md](./docs/banco-de-dados.md) |
| Prompt de avaliação (Claude + match) | [docs/prompt-avaliacao-candidato.md](./docs/prompt-avaliacao-candidato.md) |
| Jornadas (recrutador e carreira) | [docs/jornadas-gege.md](./docs/jornadas-gege.md) |
| Arquitetura | [docs/arquitetura.md](./docs/arquitetura.md) |
| Como contribuir | [CONTRIBUTING.md](./CONTRIBUTING.md) |
