# Problemas no `localhost` (sem CSS ou erro `Cannot find module './611.js'`)

## Erro `Runtime Error: Cannot find module './611.js'` (ou outro número)

Isso vem do **Webpack/Next**: a pasta **`.next`** ficou **inconsistente** (chunks antigos apontando para arquivos que já não existem). Comum no **Windows** depois de `git pull`, parar o servidor no meio do build ou **dois `next dev` ao mesmo tempo**.

**Solução:** pare o servidor (Ctrl+C), na pasta `frontend` rode:

```bash
npm run dev:reset
```

Se ainda falhar: feche **todas** as janelas do terminal que estejam com `next dev`, confira que nada mais usa a porta **3000**, e rode de novo `npm run dev:reset`.

### Windows: `Internal Server Error` + `EPERM` no terminal (`.next\\server\\...`)

Se o log mostrar `EPERM: operation not permitted, open '...\\.next\\server\\webpack-runtime.js'`, o **Node ainda está usando a pasta `.next`** (ou o antivírus/OneDrive está a segurar ficheiros). **Não** rode `npm run clean` com o servidor ligado.

1. No terminal do `next dev`: **Ctrl+C**.
2. Na pasta `frontend`, use o fluxo que mata quem está na porta **3000** e só depois limpa:

```bash
npm run dev:reset:win
```

(Equivale a: encerrar o que escuta em 3000 → apagar `.next` → `next dev`.)

3. Se continuar: exclua a pasta `frontend\\.next` no Explorador **com todos os terminais fechados**, ou adicione `frontend\\.next` às exclusões do antivírus. Evite sincronizar a pasta do projeto com OneDrive em tempo real.

Se o projeto foi clonado em outro PC: dentro de `frontend` rode também `npm install` para a versão do Next bater com o `package.json` (no repo é Next 15).

---

## Página sem CSS no `localhost` (só HTML “cru”)

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
