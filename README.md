# Gegê

Projeto fullstack simples para gestão de **candidatos**: API em **Node.js (Express + TypeScript)** persiste dados no **Supabase (PostgreSQL)**; interface em **Next.js (TypeScript)** consome a API.

## Estrutura

| Pasta | Descrição |
|-------|-----------|
| `backend/` | API REST com Express, TypeScript e cliente Supabase (service role). |
| `frontend/` | App Next.js (App Router) com listagem, criação, edição e exclusão. |
| `supabase/migrations/` | SQL para criar a tabela `candidatos`. |

## Tabela `candidatos`

Campos: `nome`, `telefone`, `email`, `cargo`, `cidade`, `score`, além de `id` (UUID) e `created_at`.

Execute o script `supabase/migrations/001_candidatos.sql` no **SQL Editor** do painel do Supabase (ou integre ao fluxo da CLI do Supabase, se usar).

Com **RLS** ativado e sem políticas públicas, apenas o backend com a **service role** acessa a tabela (a service role ignora RLS). Não exponha essa chave no frontend.

## Variáveis de ambiente

Veja **`.env.example`**. Resumo:

- **Backend** (`backend/.env`): `SUPABASE_URL` (só `https://xxx.supabase.co`), `SUPABASE_SERVICE_ROLE_KEY` (chave **service_role**, não URL), `PORT`.
- **Frontend** (`frontend/.env.local`): em **dev**, `GEGE_API_URL=http://127.0.0.1:4000` para o Next (servidor) falar com o Express. O **browser** usa o proxy interno **`/gege-api`** (configurado no `next.config.ts`), evitando CORS entre portas.
- **Produção**: defina `NEXT_PUBLIC_API_URL` com a URL pública da API.

## API (CRUD)

Base: `http://localhost:4000` (ou a URL que você configurar).

| Método | Rota | Ação |
|--------|------|------|
| GET | `/api/candidatos` | Lista todos |
| GET | `/api/candidatos/:id` | Detalhe |
| POST | `/api/candidatos` | Cria (JSON; `nome` obrigatório) |
| PUT | `/api/candidatos/:id` | Atualiza (JSON parcial) |
| DELETE | `/api/candidatos/:id` | Remove |

`GET /health` retorna status da API.

## Como rodar

1. Crie o projeto no Supabase, rode a migration SQL e copie **Project URL** e a chave **service_role** (Settings → API → Legacy API keys).

2. **`backend/.env`**: preencha `SUPABASE_URL` e **`SUPABASE_SERVICE_ROLE_KEY`** (sem isso a API não sobe).

3. **`frontend/.env.local`**: use `GEGE_API_URL=http://127.0.0.1:4000` (veja `.env.example`).

4. **Um comando (recomendado)** — na pasta raiz do repositório (`gege/`):

   ```bash
   npm install
   npm run install:all
   npm run dev
   ```

   Isso sobe **backend (4000)** e **frontend (3000)** juntos.

5. Ou em dois terminais: `npm run dev` em `backend/` e `npm run dev` em `frontend/`.

6. Abra o endereço que o Next mostrar (geralmente [http://localhost:3000](http://localhost:3000)).

## Scripts úteis

- Raiz: `npm run dev` (backend + frontend), `npm run install:all`.
- Backend: `npm run dev`, `npm run build` + `npm start`.
- Frontend: `npm run dev`, `npm run build`, `npm start`.

## Segurança

- Use a **service role** apenas no servidor (variável do backend, nunca `NEXT_PUBLIC_*`).
- Em produção, restrinja `CORS_ORIGIN` ao domínio do frontend.
