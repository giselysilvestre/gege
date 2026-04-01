# Jornadas esperadas na Gegê

Descrição das experiências **esperadas** para usuários do produto (não é manual de suporte, é mapa de fluxo).

---

## A. Recrutador / empresa (área logada)

Pré-condição: conta no **Supabase Auth** com e-mail associado a um registro em **`clientes`** (criação automática ou manual).

### A.1 Entrada e navegação

1. Acessa o site → redirecionamento para **`/login`** ou **`/dashboard`** conforme sessão.
2. Faz login (e-mail/senha).
3. Vê **shell** do app: sidebar (Dashboard, Vagas, Candidatos, Banco de Talentos, Carreira, Configurações) + topbar.

### A.2 Dashboard

- Visão de **métricas** (vagas ativas, candidatos, contratados, tempo médio).
- **Cards de vaga** com funil (inscritos, triagem, etc.) e atalho para lista de candidatos filtrada pela vaga.
- **Top candidatos** (amostra a partir da API de listagem).

### A.3 Vagas

- **Lista** (`/vagas`): vagas do cliente; pode abrir detalhe ou ir a candidatos por vaga.
- **Nova vaga** (`/vagas/nova`): preenche cargo, salário, modalidade, descrição; pode escolher **cargo do catálogo** para pré-preencher campos (`cliente_cargos`).
- Após criar, o sistema pode disparar **match** (compatibilidade) em background.
- **Detalhe por ID** (`/vagas/[id]`): redireciona para **`/candidatos?vaga={id}`** (lista filtrada).

### A.4 Candidatos

- **Lista** (`/candidatos`): tabela com filtros (vaga, tags, etapa, km), chips de filtro ativo, ordenação.
- Dados vêm de **`/api/candidatos/list`** (view enriquecida + RLS).
- **Detalhe** (`/candidatos/[id]`): ficha, experiências, ações (próxima etapa, reprovar, WhatsApp), contexto de vaga via query `?vaga=`.

**Funil de status** (conceito): `novo` → `em_triagem` → `em_entrevista` → `em_teste` → `contratado` (com ramos `reprovado` / `desistiu`). O app e o dashboard alinham contagem de “triagem” com `novo` + `em_triagem` onde aplicável.

### A.5 Banco de Talentos

- **`/banco`**: candidatos com **`disponivel = true`**, ordenação por data ou score IA, filtros por tags, card clicável para detalhe.
- Limite de página no cliente (ex.: 200 por carga) — ver código se precisar paginar.

### A.6 Carreira (visão recrutador)

- **`/carreira`**: página pública de divulgação **no contexto do cliente logado** (marca, textos, vagas abertas). Usada para pré-visualizar o que o candidato externo veria.

### A.7 Configurações

- **`/configuracoes`**: abas **Gerais** (marca, cores, textos, links, uploads para Storage), **Unidades** (CEP/endereço com ViaCEP), **Cargos** (catálogo com salário, modalidade, atividades, requisitos).
- Salva em **`cliente_configuracoes`**, **`cliente_unidades`**, **`cliente_cargos`**.

---

## B. Candidato externo (sem login no app de recrutamento)

### B.1 Página de carreiras

- Acessa URL da carreira (definida/configurada pelo cliente).
- Vê **hero** (logo, capa, textos “Trabalhe conosco” / “Sobre”), **lista de vagas** abertas do cliente, busca/filtros simples conforme UI.
- Pode seguir link de candidatura conforme integração (formulário externo, e-mail, ATS — o que estiver configurado no processo real de negócio).

### B.2 Ingestão de CV (backoffice automático)

- Não é tela do candidato: e-mail com PDF → **processador** → Claude → gravação em **`candidatos`**, experiências e análise.
- Candidato pode **não interagir** com o app Gegê nessa jornada.

---

## C. Administrador técnico / operação

- Aplica **migrations** no Supabase.
- Configura **variáveis de ambiente** no frontend, backend e processador.
- **Storage**: bucket `cliente-assets` para mídia de carreira.
- **Service role**: só servidores confiáveis; nunca no bundle do browser.

---

## D. Estados de erro esperados (UX)

- **401** na API de candidatos: sessão ausente ou cliente não resolvido → usuário deve refazer login ou corrigir vínculo `clientes.email`.
- **Lista vazia**: pode ser filtro, falta de candidaturas, RLS ou view desatualizada — ver `docs/banco-de-dados.md` e logs da API.

---

## E. Mapa rápido URL ↔ jornada

| URL | Quem |
|-----|------|
| `/login` | Recrutador |
| `/dashboard` | Recrutador |
| `/vagas`, `/vagas/nova` | Recrutador |
| `/candidatos`, `/candidatos/[id]` | Recrutador |
| `/banco` | Recrutador |
| `/carreira` | Recrutador (preview) / público conforme deploy |
| `/configuracoes` | Recrutador admin |

Atualize este documento quando novas rotas ou fluxos forem adicionados ao produto.
