# Deploy em produção (ex.: gege.ia.br)

## Onde está o código

- **No seu computador:** pasta `C:\Users\gisel\dev\gege` (é o “workspace” que o Cursor usa).
- **No GitHub (cópia na nuvem):** repositório  
  **https://github.com/giselysilvestre/gege**  
  O Git chama isso de `origin`. A Vercel vai puxar o código **desse** repositório depois que você conectar a conta.

**Importante:** o que ainda não foi commitado e enviado (`git push`) **não** aparece no GitHub. Só entra no deploy o que estiver na branch (normalmente `main`) no GitHub. Se quiser, no final da conversa você pode pedir para revisar o que falta commitar.

---

O guia abaixo publica o **frontend Next.js**. Em produção o app usa **Supabase** (login + dados) e as rotas **`app/api/*`** do Next. O **Express** (`backend/`) não entra nesse fluxo hoje (o atalho `/gege-api` só existe em desenvolvimento).

## 1. Antes de subir

- Migrations do Supabase aplicadas no projeto que você vai usar em produção.
- No PC: `cd frontend` → `npm run build` tem que terminar sem erro (é o mesmo tipo de build que a hospedagem roda).

## 2. Criar conta na Vercel (sem conta ainda)

1. Abra **https://vercel.com**
2. Clique em **Sign Up** (cadastrar).
3. Escolha **Continue with GitHub** (recomendado, porque seu código já está no GitHub).
4. Autorize a Vercel a acessar sua conta GitHub quando o GitHub pedir.

Pronto: você passa a ter login na Vercel ligado ao mesmo GitHub onde está o repo `giselysilvestre/gege`.

## 3. Primeiro deploy na Vercel

1. No painel da Vercel: **Add New…** → **Project** (ou **Import Project**).
2. Ela lista seus repositórios: selecione **`giselysilvestre/gege`**.
3. Antes de clicar em Deploy, abra **Root Directory** → **Edit** → escolha a pasta **`frontend`** (é onde está o `package.json` do Next). Sem isso o build quebra.
4. **Framework Preset:** Next.js (geralmente já vem certo).
5. **Build Command:** `npm run build` (padrão).
6. **Environment Variables** (nesta tela ou depois em Settings):

   | Nome | Valor (de onde tirar) |
   |------|------------------------|
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API → Project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API → anon **public** |
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → **service_role** (segredo; só servidor) |

7. Marque o ambiente **Production** (e **Preview** também, se quiser testar em URL de preview).
8. Clique em **Deploy** e espere o build terminar.

Se der erro, copie a mensagem do log da Vercel — dá para ajustar (quase sempre falta variável ou root directory errado).

## 4. Supabase Auth (login no domínio novo)

No Supabase: **Authentication → URL Configuration**

- **Site URL:** `https://gege.ia.br` (ou o domínio final).
- **Redirect URLs:** inclua algo como `https://gege.ia.br/**` (e o que a documentação do seu fluxo de auth pedir).

Sem isso o login pode falhar ou mandar para `localhost`.

## 5. Domínio gege.ia.br

Na Vercel: **Project → Settings → Domains** → adicione `gege.ia.br` (e `www.gege.ia.br` se quiser).

A Vercel mostra os **registros DNS** (CNAME, A, etc.) para você criar no **registrador** do domínio `.ia.br`. A propagação pode levar de minutos a algumas horas.

## 6. Depois do deploy

- Abra o site → `/login` ou `/dashboard` conforme a sessão.
- Teste login, Vagas, Candidatos, Configurações.

## 7. Express (`backend/`) e `/gege-api`

Em produção o Next **não** encaminha `/gege-api` para o Express. O recrutador usa Supabase + APIs do Next. Subir o Express só seria necessário em outro cenário (outro guia).

## 8. Outras hospedagens

Qualquer serviço que rode `npm run build` e `npm run start` na pasta `frontend` com as mesmas variáveis também serve (Docker, VPS, etc.), com Node compatível com Next.js 15.
