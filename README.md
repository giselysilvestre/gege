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

O arquivo **`.env.example`** na raiz lista todas as variáveis. Resumo:

- **Backend** (`backend/.env`): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PORT`, `CORS_ORIGIN`.
- **Frontend** (`frontend/.env.local`): `NEXT_PUBLIC_API_URL` (URL da API, ex.: `http://localhost:4000`).

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

1. Crie o projeto no Supabase, rode a migration SQL e copie **Project URL** e **service_role** (Settings → API).

2. **Backend**

   ```bash
   cd backend
   # Crie .env com as variáveis da seção "Backend" em ../.env.example
   npm install
   npm run dev
   ```

3. **Frontend** (outro terminal)

   ```bash
   cd frontend
   # Crie .env.local com NEXT_PUBLIC_API_URL (veja ../.env.example)
   npm install
   npm run dev
   ```

4. Abra [http://localhost:3000](http://localhost:3000).

## Scripts úteis

- Backend: `npm run dev` (desenvolvimento), `npm run build` + `npm start` (produção).
- Frontend: `npm run dev`, `npm run build`, `npm start`.

## Segurança

- Use a **service role** apenas no servidor (variável do backend, nunca `NEXT_PUBLIC_*`).
- Em produção, restrinja `CORS_ORIGIN` ao domínio do frontend.
