const dotenv = require("dotenv");
const { createClient } = require("@supabase/supabase-js");
const Anthropic = require("@anthropic-ai/sdk");

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || "",
});

const fromIso = process.argv[2] || new Date().toISOString().slice(0, 10);
const toIso = process.argv[3] || new Date().toISOString().slice(0, 10);
const limitArg = Number.parseInt(process.argv[4] || "250", 10);
const hardLimit = Number.isNaN(limitArg) ? 250 : Math.max(1, Math.min(2000, limitArg));

function inferirTipoCargo(cargo) {
  const texto = (cargo || "").toLowerCase();
  if (/\b(supervisor|supervisora|gerente|coordenador|coordenadora|líder|lider)\b/.test(texto)) {
    return "lideranca";
  }
  return "operacional";
}

function extrairJsonSeguro(texto) {
  if (!texto) return null;
  const limpo = String(texto).replace(/```json|```/g, "").trim();
  try {
    return JSON.parse(limpo);
  } catch {
    const ini = limpo.indexOf("{");
    const fim = limpo.lastIndexOf("}");
    if (ini >= 0 && fim > ini) {
      try {
        return JSON.parse(limpo.slice(ini, fim + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

async function loadConversationHistoryBySessao(sessaoId) {
  const { data, error } = await supabase
    .from("whatsapp_eventos")
    .select("direcao,conteudo,criado_em")
    .eq("sessao_id", sessaoId)
    .order("criado_em", { ascending: true });

  if (error) throw error;
  return (data || [])
    .map((event) => ({
      role: event.direcao === "inbound" ? "user" : "assistant",
      content: typeof event.conteudo === "string" ? event.conteudo : "",
    }))
    .filter((m) => m.content);
}

async function resolverTipoCargo(candidatoId, candidaturaId) {
  if (candidaturaId) {
    const { data: cand } = await supabase
      .from("candidaturas")
      .select("vaga_id")
      .eq("id", candidaturaId)
      .maybeSingle();

    if (cand?.vaga_id) {
      const { data: vaga } = await supabase
        .from("vagas")
        .select("cargo")
        .eq("id", cand.vaga_id)
        .maybeSingle();
      if (vaga?.cargo) return inferirTipoCargo(vaga.cargo);
    }
  }

  const { data: candidato } = await supabase
    .from("candidatos")
    .select("cargo_principal")
    .eq("id", candidatoId)
    .maybeSingle();

  return inferirTipoCargo(candidato?.cargo_principal);
}

async function atualizarScorePosEntrevista(candidatoId, sessaoId, tipoCargo) {
  const { data: sessao } = await supabase
    .from("whatsapp_sessoes")
    .select("etapa_atual")
    .eq("id", sessaoId)
    .maybeSingle();

  if (!sessao || sessao.etapa_atual !== "encerramento") {
    return { ok: false, reason: "nao_encerramento" };
  }

  const historico = await loadConversationHistoryBySessao(sessaoId);
  if (!historico || historico.length === 0) return { ok: false, reason: "sem_historico" };

  const respostasCandidato = historico.filter((m) => m.role === "user" && m.content).length;
  if (respostasCandidato < 3) return { ok: false, reason: "poucas_respostas" };

  const roteiroMini = [
    "me conta sobre seu último emprego",
    "quantas vezes você costuma faltar",
    "como tá sua disponibilidade de horário",
    "você já trabalhou em dia de pico",
    "qual foi o pior perrengue ou situação com cliente",
    "qual foi o pior perrengue ou situação que teve com um colaborador",
    "na sua visão, quais são os processos mais importantes",
  ];
  const perguntasRoteiroRespondidas = roteiroMini.filter((trecho) =>
    historico.some(
      (m) =>
        m.role === "assistant" &&
        m.content &&
        m.content.toLowerCase().includes(trecho)
    )
  ).length;
  if (perguntasRoteiroRespondidas < 3) return { ok: false, reason: "roteiro_insuficiente" };

  const transcricao = historico
    .map((m) => `${m.role === "assistant" ? "ana" : "candidato"}: ${m.content}`)
    .join("\n");

  const cargo = tipoCargo || "operacional";
  const isLideranca = cargo === "lideranca";

  const guiaOperacional = `
P1 — ÚLTIMO EMPREGO (0-20)
Pergunta: "me conta sobre seu último emprego, o que você fazia no dia a dia e por que saiu?"
Avaliar: experiência na função e motivo de saída legítimo.
Boa (17-20): descreve 2+ atividades concretas, motivo de saída claro e limpo, ficou 6+ meses, experiência em food service.
Média (10-16): descreve cargo mas função genérica, motivo vago sem red flag, menos de 6 meses com justificativa parcial.
Ruim (0-9): não sabe descrever o que fazia, fala mal da empresa com rancor, ficou menos de 2 meses sem justificativa, motivo evasivo quando aprofundado, 3+ empregos curtos em sequência.
Red flag eliminatório: indício de justa causa, contradição com perfil.

P2 — PICO E PRESSÃO (0-20)
Pergunta: "você já trabalhou em dia de pico, tipo sábado cheio ou véspera de feriado? como foi?"
Avaliar: já viveu ritmo real de food service, reage com resiliência ou ansiedade.
Boa (17-20): exemplo específico de pico, descreve como lidou, tom neutro ou positivo.
Média (10-16): confirma experiência mas sem detalhe, ou sem food service mas com ambiente de alta demanda.
Ruim (0-9): nunca trabalhou em pico + fallback genérico sem exemplo, ou demonstra aversão ao ritmo acelerado.

P3 — CLIENTE DIFÍCIL (0-20)
Pergunta: "qual foi o pior perrengue ou situação com cliente bravo que reclamou de algo? o que você fez pra resolver?"
Avaliar: temperamento real, desescalou ou escalou, exemplo concreto.
Boa (17-20): exemplo concreto, tomou iniciativa antes de chamar supervisor, situação controlada, tom calmo.
Média (10-16): tem exemplo mas resolveu passivamente ou sem detalhe do resultado.
Ruim (0-9): culpa o cliente, aplicou regra sem empatia, "nunca tive cliente difícil", resposta genérica sem exemplo.

P4 — FALTAS E ATRASOS (0-20)
Pergunta: "quantas vezes você costuma faltar ou se atrasar no mês? e, se acontece, como você costuma lidar com isso?"
Avaliar: responde com número ou foge, avisa antes ou depois, naturaliza falta.
Boa (17-20): número baixo com contexto crível, avisa antes, exemplo concreto de como avisou.
Média (10-16): responsável no discurso mas sem número ("raramente", "só em caso de doença").
Ruim (0-9): não responde quantas vezes, avisa no dia ou depois, naturaliza falta.
Red flag eliminatório: "todo mundo falta, é normal" ou frequência declarada acima de 2x/mês.

P5 — DISPONIBILIDADE (0-20)
Pergunta: "como tá sua disponibilidade de horário e escala? tem alguma restrição?"
Avaliar: compatibilidade real com a escala da vaga.
Boa (17-20): disponibilidade total sem restrição, ou explica por que a escala funciona pra ela.
Média (10-16): disponível mas com preferência contrária à escala (risco de desistência — registrar).
Ruim/eliminatório (0): restrição real incompatível com a escala.`;

  const guiaLideranca = `
P1 — ÚLTIMO EMPREGO (0-20)
Pergunta: "me conta sobre seu último emprego, o que você fazia no dia a dia e por que saiu?"
Avaliar: experiência na função de gestão e motivo de saída legítimo.
Boa (17-20): descreve cargo de gestão com escopo claro (equipe, processos), motivo de saída limpo, ficou 6+ meses.
Média (10-16): descreve cargo mas função de gestão vaga, motivo impreciso sem red flag.
Ruim (0-9): não descreve gestão de pessoas, fala mal com rancor, múltiplos empregos curtos sem explicação, indício de justa causa.

P2 — CONFLITO COM COLABORADOR (0-20)
Pergunta: "qual foi o pior perrengue ou situação que teve com um colaborador? o que você fez pra resolver?"
Avaliar: exemplo real de gestão de conflito, resolveu ou evitou, postura de gestor.
Boa (17-20): exemplo concreto com contexto, ação tomada com detalhes, consequência ou aprendizado, não culpa só o colaborador.
Média (10-16): exemplo vago, ação correta mas sem detalhe do resultado.
Ruim (0-9): "nunca tive conflito sério", culpa só o colaborador, resolveu evitando, resposta inteiramente genérica.

P3 — VISÃO OPERACIONAL (0-20)
Pergunta: "na sua visão, quais são os processos mais importantes pra uma loja funcionar bem?"
Avaliar: visão operacional real, cita processos concretos, exemplo de como aplicava.
Boa (17-20): cita 2+ processos específicos (escala, CMV, abertura/fechamento, treinamento, estoque, metas), com exemplo aplicado.
Média (10-16): processos corretos mas genéricos, sem exemplo aplicado.
Ruim (0-9): resposta abstrata sem processo operacional concreto, evidencia que nunca geriu loja de verdade.

P4 — FALTAS E ATRASOS (0-20)
[igual ao operacional]

P5 — DISPONIBILIDADE (0-20)
[igual ao operacional]`;

  const guia = isLideranca ? guiaLideranca : guiaOperacional;

  const prompt = `Você é analista de recrutamento especializado em food service.
Avalie a mini-entrevista abaixo usando o guia de critérios fornecido.
Retorne APENAS JSON válido, sem markdown.

GUIA DE AVALIAÇÃO:
${guia}

REGRAS:
- Avaliar cada pergunta com nota 0-20.
- Se pergunta não foi feita ou não foi respondida: nota 0, marcar como "nao_respondida".
- Red flag eliminatório em qualquer pergunta: score_pos_entrevista máximo 30.
- Basear avaliação exclusivamente no que o candidato disse. Sem inferência.
- Incluir trecho literal da conversa que embasou cada nota.

Retorne:
{
  "score_pos_entrevista": 0-100,
  "notas": {
    "p1_trajetoria": 0-20,
    "p2_cargo_especifico": 0-20,
    "p3_cargo_especifico": 0-20,
    "p4_faltas": 0-20,
    "p5_disponibilidade": 0-20
  },
  "trechos": {
    "p1": "trecho literal que embasou a nota",
    "p2": "trecho literal",
    "p3": "trecho literal",
    "p4": "trecho literal",
    "p5": "trecho literal"
  },
  "red_flags": "descrever se houver, ou null",
  "analise_pos_entrevista": "resumo objetivo em 2-3 linhas: pontos fortes, riscos, recomendação",
  "momento_profissional": "situação atual em 1 linha",
  "pontos_positivos": "texto curto",
  "pontos_melhoria": "texto curto"
}

Conversa:
"""${transcricao}"""`;

  const resposta = await anthropic.messages.create({
    model: process.env.CLAUDE_MODEL || "claude-sonnet-4-5",
    max_tokens: 800,
    messages: [{ role: "user", content: prompt }],
  });

  const texto = (resposta.content || [])
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("\n")
    .trim();

  const avaliacao = extrairJsonSeguro(texto);
  if (!avaliacao) return { ok: false, reason: "json_invalido" };

  const scorePos = Number.parseInt(avaliacao.score_pos_entrevista, 10);
  if (Number.isNaN(scorePos)) return { ok: false, reason: "score_invalido" };
  const scorePosSanitizado = Math.max(0, Math.min(100, scorePos));

  const { data: analiseAtual } = await supabase
    .from("candidatos_analise")
    .select("id, score_ia")
    .eq("candidato_id", candidatoId)
    .maybeSingle();

  const scoreIa = Number.parseInt(analiseAtual?.score_ia, 10);
  const scoreFinal = Number.isNaN(scoreIa)
    ? scorePosSanitizado
    : Math.round(scoreIa * 0.6 + scorePosSanitizado * 0.4);

  const payload = {
    score_pos_entrevista: scorePosSanitizado,
    notas_entrevista: avaliacao.notas || null,
    trechos_entrevista: avaliacao.trechos || null,
    red_flags_entrevista: avaliacao.red_flags || null,
    analise_pos_entrevista: avaliacao.analise_pos_entrevista || null,
    momento_profissional: avaliacao.momento_profissional || null,
    pontos_positivos: avaliacao.pontos_positivos || null,
    pontos_melhoria: avaliacao.pontos_melhoria || null,
    score_final: scoreFinal,
    atualizado_em: new Date().toISOString(),
  };

  if (analiseAtual?.id) {
    await supabase.from("candidatos_analise").update(payload).eq("candidato_id", candidatoId);
  } else {
    await supabase.from("candidatos_analise").insert({
      candidato_id: candidatoId,
      ...payload,
      processado_em: new Date().toISOString(),
    });
  }

  return { ok: true, scorePos: scorePosSanitizado, scoreFinal, tipoCargo: cargo };
}

async function main() {
  console.log(`[score-batch] periodo ${fromIso} ate ${toIso} | limite ${hardLimit}`);

  const fromStart = `${fromIso}T00:00:00.000Z`;
  const toEnd = `${toIso}T23:59:59.999Z`;

  const { data: sessoes, error } = await supabase
    .from("whatsapp_sessoes")
    .select("id,candidato_id,candidatura_id,tipo_fluxo,etapa_atual,ultima_inbound_at,ultima_outbound_at,criado_em")
    .eq("tipo_fluxo", "candidatura")
    .gte("ultima_inbound_at", fromStart)
    .lte("ultima_inbound_at", toEnd)
    .order("ultima_inbound_at", { ascending: false })
    .limit(hardLimit);

  if (error) throw error;
  console.log(`[score-batch] sessoes candidatas: ${sessoes?.length || 0}`);

  let ok = 0;
  let skipped = 0;
  let failed = 0;

  for (const s of sessoes || []) {
    try {
      const tipoCargo = await resolverTipoCargo(s.candidato_id, s.candidatura_id);
      const result = await atualizarScorePosEntrevista(s.candidato_id, s.id, tipoCargo);
      if (result.ok) {
        ok += 1;
        console.log(
          `[ok] sessao=${s.id} tipo=${result.tipoCargo} score_pos=${result.scorePos} score_final=${result.scoreFinal}`
        );
      } else {
        skipped += 1;
        console.log(`[skip] sessao=${s.id} reason=${result.reason}`);
      }
    } catch (err) {
      failed += 1;
      console.error(`[erro] sessao=${s.id}`, err?.message || err);
    }
  }

  console.log(`[score-batch] fim | ok=${ok} skipped=${skipped} failed=${failed}`);
}

main().catch((err) => {
  console.error("[score-batch] erro fatal:", err);
  process.exit(1);
});
