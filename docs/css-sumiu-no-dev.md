# Página sem CSS no `localhost` (só HTML “cru”)

Isso **não é causado pelo Git commit** em si. O que costuma acontecer:

1. **Cache do Next em desenvolvimento** (pasta `.next`) corrompido ou inconsistente, principalmente no **Windows**, depois de muitas edições ou de parar/levantar o servidor várias vezes.
2. **Turbopack** (`--turbopack`) às vezes expõe bugs diferentes do modo normal; se sumir estilo, teste sem turbo.

## O que fazer (na pasta `frontend`)

```bash
npm run dev:reset
```

Isso apaga `.next` (e cache do script `clean`) e sobe o `next dev` de novo.

Alternativa manual:

```bash
npm run clean
npm run dev
```

Depois no navegador: **recarregar forçado** (Ctrl+Shift+R) ou aba anônima.

## Ordem dos CSS no app

No `layout.tsx` o projeto importa **`globals.css` antes** de `gege-mockup.css` (Tailwind + variáveis globais, depois tokens e componentes do mockup). Não coloque o mockup só com `@import` dentro do `globals` — no pipeline do Next isso já deu problema no passado.

## Produção (Vercel)

O `npm run build` gera CSS de forma estável. Se o build passa e só o **dev** falha, é quase sempre cache local.
