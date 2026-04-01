# Contribuindo com o projeto Gegê

## Branches

- **`main`**: linha estável; integrações preferenciais via merge após revisão.
- Trabalho novo: branch descritiva, ex. `feat/config-email`, `fix/lista-candidatos`.

## Commits (Conventional Commits)

Formato sugerido:

```
<tipo>(<escopo opcional>): <descrição curta no imperativo>

Corpo opcional: contexto, breaking changes, referência a issue.
```

**Tipos comuns:** `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `ci`.

Exemplos:

- `feat(banco): paginação no banco de talentos`
- `fix(api): tratamento de erro na lista de candidatos`
- `docs: atualiza jornadas e schema`

## Pull requests

1. Descreva **o quê** e **por quê**; anexe prints se for UI.
2. Confirme **`npm run build`** no `frontend/` e, se alterou backend, `npm run build` ou `tsc` no `backend/`.
3. Não commite **segredos** (`.env`, chaves API); use `.env.example` só com placeholders.

## Código

- TypeScript: preferir tipos explícitos em APIs públicas; evitar `any` sem necessidade.
- Frontend: seguir padrão existente (App Router, client components onde já há hooks).
- SQL: nova regra → nova migration numerada em `supabase/migrations/` (não editar migrations já aplicadas em produção).

## Documentação

- Alterações de schema ou fluxo de negócio: atualizar `docs/banco-de-dados.md` e/ou `docs/jornadas-gege.md`.
- Mudança no prompt do Claude: atualizar `docs/prompt-avaliacao-candidato.md` e o código em `gege-cv-processor/`.

## Índice da documentação

Ver [docs/README.md](./docs/README.md).
