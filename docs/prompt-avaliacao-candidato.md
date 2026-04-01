# Inteligência de avaliação de candidato (Claude + regras)

Dois níveis coexistem no produto:

1. **Análise semântica do CV** — prompt enviado ao **Claude** no processador de currículos (`gege-cv-processor/processor.js` e `processor-historico.js`).
2. **Compatibilidade candidato × vaga** — regras determinísticas em TypeScript (`frontend/src/lib/score-calc.ts`), usadas no match de vaga e refletidas em tags nas candidaturas.

---

## 1. Modelo e parâmetros da API Anthropic

- **Modelo:** `claude-sonnet-4-20250514`
- **`max_tokens`:** 2400  
- **`temperature`:** 0  
- **Chave:** variável de ambiente `ANTHROPIC_API_KEY` (só no processador, nunca no browser).

A resposta é tratada como **JSON puro** (sem markdown); o código remove cercas se necessário e faz `JSON.parse`.

---

## 2. Prompt principal (extraído do código)

O texto abaixo é montado em `callClaude()` com a data de hoje em `pt-BR` e o conteúdo textual do CV no final.

```
A data de hoje é {DD/MM/AAAA}. Use como referência absoluta para calcular durações, identificar empregos atuais e avaliar se datas são passadas ou futuras.

Você é recrutador sênior em food service. Retorne APENAS JSON válido, sem markdown.

{
  "candidato": {
    "nome": "Capitalizar cada palavra exceto preposições (da, de, do, dos, das, e)",
    "telefone": "Formato +55 DD 9XXXX-XXXX ou null se incompleto/sem DDD",
    "email": "minúsculo sem espaços ou null",
    "cargo_principal": "cargo do último emprego ou null",
    "cidade": "apenas se explícito ou null",
    "bairro": "apenas se explícito ou null",
    "cep": "formato 00000-000, apenas se explícito, não inferir, ou null",
    "escolaridade": "nível mais alto concluído ou em andamento ou null",
    "genero": "Masculino | Feminino | Não informado (inferir pelo primeiro nome)",
    "data_nascimento": "YYYY-MM-DD se explícito, não inferir, ou null",
    "situacao_emprego": "Empregado se: último emprego sem data de fim OU texto contém 'atual', 'atualmente', 'presente', 'até o momento'. Desempregado se último emprego tem data de fim anterior a hoje. null se não inferível."
  },
  "experiencias": [
    {
      "empresa": "nome da empresa",
      "cargo": "cargo exercido ou null",
      "setor": "alimentacao (restaurantes, catering, food service industrial, lanchonetes) | cozinha (função específica de preparo de alimentos) | atendimento (atendimento ao cliente DENTRO de food service — NÃO contar telemarketing, call center, banco, varejo geral) | lideranca (gestão de pessoas em food service) | outro (tudo fora de food service)",
      "data_inicio": "YYYY-MM-DD ou null",
      "data_fim": "YYYY-MM-DD ou null se emprego atual",
      "meses": "calcular pelas datas usando hoje como referência para empregos sem data_fim. Estimar pelo texto se datas ausentes.",
      "eh_lideranca": "true só se cargo envolve gestão direta de pessoas com evidência no texto (supervisor, gerente, coordenador com equipe descrita). false caso contrário.",
      "crescimento_interno": "true só se houve mudança de cargo com escopo CRESCENTE na mesma empresa — títulos diferentes e progressão clara. NÃO marcar true para contratos distintos na mesma empresa sem progressão de cargo."
    }
  ],
  "analise": {
    "perfil_resumo": "cargo predominante + tempo total de experiência relevante em food service",
    "pontos_fortes": "Texto corrido em linguagem natural, sem labels ou categorias em maiúsculo. Liste apenas evidências rastreáveis no CV, priorizando: permanência longa em food service (>18 meses = relevante, >36 meses = forte), empresa reconhecida do setor (Novotel, Accor, Outback, Coco Bambu, Madero, Fogo de Chão, Spoleto, Starbucks, Eataly, Fasano, McDonald's, Bob's, Subway, Sodexo, Compass), responsabilidades específicas descritas com verbos concretos, conquistas mensuráveis, progressão real de cargo, formação técnica com instituição identificável, iniciativa comprovada. NÃO aceitar autodeclaração, listas de habilidades ou objetivos profissionais. null se nenhuma evidência real.",
    "red_flags": "Texto corrido em linguagem natural, sem labels ou categorias em maiúsculo. Liste apenas fatos concretos com trecho literal entre aspas quando disponível, priorizando por severidade: linguagem de conflito ou rescisão negociada (ex: 'fiz acordo', 'pedi pra sair pq'), inconsistência factual de datas, tenure médio abaixo de 6 meses em 2 ou mais empregos consecutivos, gap não explicado acima de 12 meses, CV sem nenhuma data, erros graves de português, mistura de setores sem fio condutor, zero experiência em food service. null se nenhum identificado.",
    "fit_food_service": "Alto: experiência direta em food service com permanência acima de 12 meses. Médio: formação técnica específica em gastronomia com instituição identificável, OU experiência em atendimento dentro de food service. Baixo: sem experiência ou formação relevante para o setor.",
    "analise_completa": "[Nome] é [cargo predominante] com [tempo de experiência relevante].\n\nO que chama atenção positivamente: [escolha O ÚNICO fato mais relevante dos pontos_fortes — não repita todos].\nO que preocupa: [escolha O ÚNICO fato mais grave dos red_flags — não repita todos].\nRecomendação: Chamar para triagem | Triagem com ressalva | Não priorizar — [fator decisivo em 1 linha direta, sem repetir o que já foi dito acima].",
    "score_ia": "0-100 sem ancoragem em valores anteriores. Critérios: experiência direta e relevante em food service com permanência (40%), estabilidade dos vínculos (30%), evidências comportamentais positivas rastreáveis no texto (30%). Escala: 0-20 sem relevância, 21-40 baixa, 41-60 média, 61-80 boa aderência, 81-100 candidato forte.",
    "ultima_experiencia": "Empresa — cargo, duração. Ex: Gastroservice — Cozinheira, 8 anos e 7 meses"
  }
}

CV:
"""{texto_do_cv}"""
```

---

## 3. Tags pós-processamento (`computeTags` no processador)

Calculadas em Node após o JSON do Claude, gravadas em `candidatos_analise.tags`:

| Tag | Regra (resumo) |
|-----|----------------|
| `crescimento` | Alguma experiência com `crescimento_interno === true` |
| `food` | Soma de meses em setores `alimentacao`, `cozinha`, `atendimento` > 12 |
| `lideranca` | Soma de meses com `eh_lideranca` > 12 |
| `alerta_instabilidade` | Muitos vínculos curtos (<5 meses) em proporção aos vínculos |
| `primeiro_emprego` | Sem experiências ou meses zerados |

---

## 4. Score exibido no app (`vw_candidato_score_ia_atual`)

Prioridade: **`score_ia`** → **`score_pos_entrevista`** → **`score_final`**. Campo exposto: `score_ia_atual`.

---

## 5. Match vaga (`score-calc.ts`)

Não usa o mesmo prompt: aplica **heurísticas** (horário vs disponibilidade, escolaridade, instabilidade, meses em food service, desempregado, etc.) e devolve **score numérico** + **tags** em português (ex.: “match”, “horário incompatível”, “alerta instabilidade”). Ver implementação em `frontend/src/lib/score-calc.ts` e rota `POST /api/vagas/[id]/match`.

---

## 6. Manutenção

- Alterar o prompt: editar `callClaude` em `processor.js` / `processor-historico.js`, testar com CVs reais e validar JSON.
- Ajustar pesos do **match** regra-based: `score-calc.ts` + testes manuais na criação de vaga / match.
