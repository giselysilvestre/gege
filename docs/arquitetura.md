# Arquitetura Gegê

## Stack

| Camada | Tecnologia |
|--------|------------|
| Frontend | Next.js 15 (App Router), React, TypeScript, Supabase Auth (cookies SSR) |
| Banco / Auth / Storage | Supabase (PostgreSQL, RLS, Storage) |
| API auxiliar | Express (TypeScript) — CRUD legado de candidatos em `/api/candidatos` |
| Processamento de CV | Node.js (`gege-cv-processor/`) — Gmail, Drive, Anthropic Claude, gravação no Supabase |

## Pastas do repositório

- **`frontend/`** — App Next: páginas (`src/app/`), componentes, `app/api/*` (rotas serverless do Next).
- **`backend/`** — Servidor Express na porta configurável (`PORT`, padrão 4000); em dev o Next faz proxy de `/gege-api` → Express.
- **`supabase/migrations/`** — Evolução versionada do schema (aplicar em ordem numérica).
- **`gege-cv-processor/`** — Scripts de ingestão de CVs (PDF por e-mail), chamada ao Claude e upsert em `candidatos`, `candidatos_experiencia`, `candidatos_analise`.

## Fluxos de dados (resumo)

1. **Recrutador logado** — Browser usa `NEXT_PUBLIC_SUPABASE_*` + sessão; RLS restringe por cliente (e-mail do JWT).
2. **Listagens enriquecidas** — `GET /api/candidatos/list` lê `vw_candidaturas_enriquecida` e devolve JSON para dashboard/candidatos.
3. **Match de vaga** — `POST /api/vagas/[id]/match` usa service role no servidor; calcula compatibilidade (regras em `frontend/src/lib/score-calc.ts`) e insere/atualiza candidaturas.
4. **Currículo** — Processador extrai texto do PDF, chama Claude com o prompt documentado em `prompt-avaliacao-candidato.md`, persiste análise e experiências.

## Variáveis de ambiente críticas

Ver `.env.example` na raiz. **Nunca** commitar chaves reais. Service role só em servidor (sem `NEXT_PUBLIC_`).
