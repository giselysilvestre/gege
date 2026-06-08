const express = require("express");
const axios = require("axios");
const dotenv = require("dotenv");
const { createClient } = require("@supabase/supabase-js");
const WebSocket = require("ws");
const Anthropic = require("@anthropic-ai/sdk");
const { WhatsAppClient } = require("@kapso/whatsapp-cloud-api");
const pdfParse = require("pdf-parse/lib/pdf-parse.js");
const Groq = require("groq-sdk");
const { SYSTEM_PROMPT_BASE } = require("./ana-prompt");
const {
  expandKapsoWebhookBodies,
  extractKapsoInboundFromPayload,
  phoneNumberIdMatchesConfigured,
  normalizeE164Digits: normalizeE164DigitsKapso,
} = require("./webhook-kapso");
const {
  isKnownOutboundKapsoMessageId,
  isEchoOfRecentCrmOutbound,
} = require("./inbound-guards");
const { linhasBeneficiosFromJson } = require("./beneficios-vaga");
dotenv.config();

let groqClient = null;
function getGroqClient() {
  const key = process.env.GROQ_API_KEY;
  if (!key) return null;
  if (!groqClient) groqClient = new Groq({ apiKey: key });
  return groqClient;
}

const PORT = Number(process.env.PORT || 3333);
const KAPSO_PHONE_NUMBER_ID = process.env.KAPSO_PHONE_NUMBER_ID || "";
const APP_VERSION = "webhook-kapso-v2-batch-2026-06-04";

const MENSAGEM_SEM_AGENDAMENTO =
  "obrigada por responder! vou encaminhar seu perfil pro time do cliente analisar. se você for selecionado pra próxima etapa, o próprio time entra em contato com você — eu não marco entrevista por aqui. qualquer dúvida, pode mandar mensagem.";

const MENSAGEM_CANDIDATO_PERGUNTA_ENTREVISTA =
  "quem define data, horário e local de entrevista é o time da empresa, não eu. assim que tiverem retorno sobre seu perfil, eles te avisam. não consigo agendar nem confirmar horário por aqui.";

const MAX_HISTORY_MESSAGES = 20;

const app = express();
app.use(express.json({ limit: "2mb" }));

/** Dedupe de retries do Kapso via header X-Idempotency-Key */
const processedIdempotencyKeys = new Map();
const IDEMPOTENCY_TTL_MS = 10 * 60 * 1000; // 10 minutos

function idempotencyHas(key) {
  const ts = processedIdempotencyKeys.get(key);
  if (!ts) return false;
  if (Date.now() - ts > IDEMPOTENCY_TTL_MS) {
    processedIdempotencyKeys.delete(key);
    return false;
  }
  return true;
}

function idempotencyAdd(key) {
  processedIdempotencyKeys.set(key, Date.now());
  if (processedIdempotencyKeys.size > 2000) {
    const now = Date.now();
    for (const [k, ts] of processedIdempotencyKeys) {
      if (now - ts > IDEMPOTENCY_TTL_MS) processedIdempotencyKeys.delete(k);
    }
  }
}

const pendingMessages = new Map();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { transport: WebSocket },
  }
);

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || "",
});

const kapsoClient = new WhatsAppClient({
  baseUrl: "https://api.kapso.ai/meta/whatsapp",
  kapsoApiKey: process.env.KAPSO_API_KEY,
});

const SYSTEM_PROMPT = SYSTEM_PROMPT_BASE;

function inferirTipoCargo(cargo) {
  const texto = (cargo || "").toLowerCase();
  if (/\b(supervisor|supervisora|gerente|coordenador|coordenadora|líder|lider)\b/.test(texto)) {
    return "lideranca";
  }
  return "operacional";
}

function normalizeE164Digits(phone) {
  return normalizeE164DigitsKapso(phone);
}

/** Vincula conversation_id da Kapso à sessão ativa (disparo costuma não trazer esse id). */
async function linkKapsoConversationToActiveSession(candidatoId, conversationId) {
  if (!candidatoId || !conversationId) return;
  const { error } = await supabase
    .from("whatsapp_sessoes")
    .update({ kapso_session_id: conversationId })
    .eq("candidato_id", candidatoId)
    .eq("status", "ativo");
  if (error) {
    console.error("[webhook] erro ao vincular kapso_session_id:", error.message);
  }
}

function formatBrPhoneFromDigits(phoneDigits) {
  const d = normalizeE164Digits(phoneDigits);
  if (d.length === 11) {
    return `+55 ${d.slice(0, 2)} ${d.slice(2, 7)}-${d.slice(7, 11)}`;
  }
  if (d.length === 13 && d.startsWith("55")) {
    return `+55 ${d.slice(2, 4)} ${d.slice(4, 9)}-${d.slice(9, 13)}`;
  }
  return null;
}

function buildPhoneLookupVariants(phoneDigits) {
  const onlyDigits = normalizeE164Digits(phoneDigits);
  const variants = new Set([onlyDigits, `+${onlyDigits}`]);
  const formattedBr = formatBrPhoneFromDigits(onlyDigits);
  if (formattedBr) variants.add(formattedBr);
  if (onlyDigits.startsWith("55")) {
    const local = onlyDigits.slice(2);
    if (local) {
      variants.add(local);
      variants.add(`+55${local}`);
      const localFormattedBr = formatBrPhoneFromDigits(local);
      if (localFormattedBr) variants.add(localFormattedBr);
    }
  }
  return Array.from(variants).filter(Boolean);
}

async function resolveCandidatoIdByPhone(phoneDigits) {
  const targetDigits = normalizeE164Digits(phoneDigits);
  const phoneVariants = buildPhoneLookupVariants(phoneDigits);
  const final8 = targetDigits.slice(-8);
  const final4 = targetDigits.slice(-4);

  // 1) Tentativa direta por variações exatas
  const { data, error } = await supabase
    .from("candidatos")
    .select("id,telefone,nome")
    .in("telefone", phoneVariants)
    .limit(10);

  if (error) {
    console.error("[supabase] erro ao buscar candidato por telefone:", error);
    throw error;
  }

  let matches = (data || []).filter((c) => normalizeE164Digits(c.telefone || "") === targetDigits);

  // 2) Fallback robusto: busca por final do número e normaliza em memória
  if (matches.length === 0 && final8) {
    const { data: approx, error: approxErr } = await supabase
      .from("candidatos")
      .select("id,telefone,nome")
      // Busca ampla por sufixo curto para funcionar com formatos como "+55 21 97026-9716".
      .ilike("telefone", `%${final4}%`)
      .limit(30);
    if (approxErr) {
      console.error("[supabase] erro no fallback de telefone:", approxErr);
      throw approxErr;
    }
    matches = (approx || []).filter((c) => normalizeE164Digits(c.telefone || "") === targetDigits);
  }

  if (matches.length === 1) return matches[0].id;
  if (matches.length > 1) {
    // 3) Desempate: prioriza candidato com sessão ativa mais recente
    const ids = matches.map((m) => m.id);
    const { data: sessoes, error: sessErr } = await supabase
      .from("whatsapp_sessoes")
      .select("candidato_id, status, ultima_outbound_at, candidatura_id")
      .in("candidato_id", ids)
      .eq("status", "ativo")
      .order("ultima_outbound_at", { ascending: false, nullsFirst: false })
      .limit(1);
    if (!sessErr && sessoes && sessoes.length > 0) {
      return sessoes[0].candidato_id;
    }
    // sem sessão ativa: fica com o primeiro match normalizado
    return matches[0].id;
  }

  const canonicalPhone = phoneVariants[0] || normalizeE164Digits(phoneDigits);
  const { data: created, error: createError } = await supabase
    .from("candidatos")
    .insert({
      nome: `Candidato WhatsApp ${canonicalPhone}`,
      telefone: canonicalPhone,
      origem: "whatsapp",
    })
    .select("id")
    .single();

  if (createError) {
    // Concorrência/duplicidade: outro fluxo pode ter criado o candidato entre a leitura e o insert.
    // Em vez de quebrar o webhook, reaproveita o cadastro existente do mesmo telefone normalizado.
    if (createError.code === "23505") {
      const { data: retry, error: retryErr } = await supabase
        .from("candidatos")
        .select("id,telefone")
        .ilike("telefone", `%${final4}%`)
        .limit(30);
      if (!retryErr) {
        const found = (retry || []).find(
          (c) => normalizeE164Digits(c.telefone || "") === targetDigits
        );
        if (found?.id) return found.id;
      }
    }
    console.error("[supabase] erro ao criar candidato automático:", createError);
    throw createError;
  }
  return created.id;
}

async function resolveCandidatoIdByConversation(conversationId) {
  if (!conversationId) return null;
  const { data, error } = await supabase
    .from("whatsapp_sessoes")
    .select("candidato_id, status, candidatura_id, ultima_outbound_at")
    .eq("kapso_session_id", conversationId)
    .eq("status", "ativo")
    .order("ultima_outbound_at", { ascending: false, nullsFirst: false })
    .limit(1);

  if (error) {
    console.error("[supabase] erro ao resolver candidato por conversationId:", error);
    return null;
  }
  return data?.[0]?.candidato_id || null;
}

async function getOrCreateActiveSession(candidatoId, candidaturaId = null) {
  // procura sessão ativa específica dessa candidatura (se informada)
  // ou qualquer sessão ativa se não tiver candidatura (fluxo reativo)
  let query = supabase
    .from("whatsapp_sessoes")
    .select("id, candidatura_id, tipo_fluxo, etapa_atual")
    .eq("candidato_id", candidatoId)
    .eq("status", "ativo")
    .order("ultima_outbound_at", { ascending: false, nullsFirst: false });

  if (candidaturaId) {
    query = query.eq("candidatura_id", candidaturaId);
  }

  const { data: existentes, error: existingError } = await query.limit(1);
  if (existingError) {
    console.error("[supabase] erro ao buscar sessão ativa:", existingError);
    throw existingError;
  }
  if (existentes && existentes.length > 0) return existentes[0].id;

  // não achou: cria sessão nova com tipo_fluxo e etapa_atual corretos
  const nowIso = new Date().toISOString();
  const { data: created, error: createError } = await supabase
    .from("whatsapp_sessoes")
    .insert({
      candidato_id: candidatoId,
      candidatura_id: candidaturaId,
      status: "ativo",
      tipo_fluxo: candidaturaId ? "candidatura" : "reativo",
      etapa_atual: "abertura",
      etapas_concluidas: [],
      primeiro_contato_at: nowIso,
    })
    .select("id")
    .single();

  if (createError) {
    console.error("[supabase] erro ao criar sessão ativa:", createError);
    throw createError;
  }
  return created.id;
}

/**
 * Carrega todas as sessões ativas de um candidato.
 * A mais recente (por ultima_outbound_at) vira o "foco" principal.
 * As outras ficam como contexto adicional.
 */
async function loadAllActiveSessionsContext(candidatoId) {
  const { data: sessoes, error } = await supabase
    .from("whatsapp_sessoes")
    .select("id, candidatura_id, tipo_fluxo, etapa_atual, candidato_respondeu, ultima_outbound_at")
    .eq("candidato_id", candidatoId)
    .eq("status", "ativo")
    .order("ultima_outbound_at", { ascending: false, nullsFirst: false });

  if (error) {
    console.error("[supabase] erro ao buscar sessões ativas:", error);
    return { foco: null, outras: [] };
  }
  if (!sessoes || sessoes.length === 0) return { foco: null, outras: [] };

  const parseIso = (v) => (v ? new Date(v).getTime() : 0);
  const prioridade = (s) => {
    let p = 0;
    if (s?.tipo_fluxo === "candidatura" && s?.candidatura_id) p += 100;
    if (s?.etapa_atual === "disparo_template") p += 50;
    if (s?.etapa_atual === "apresentacao_vaga") p += 40;
    if (s?.etapa_atual === "confirma_endereco") p += 30;
    if (s?.etapa_atual === "mini_entrevista") p += 20;
    return p;
  };

  // Regra de foco: prioriza sessão proativa de candidatura e, em empate, mais recente.
  const ordenadas = [...sessoes].sort((a, b) => {
    const pa = prioridade(a);
    const pb = prioridade(b);
    if (pb !== pa) return pb - pa;
    return parseIso(b?.ultima_outbound_at) - parseIso(a?.ultima_outbound_at);
  });

  const [foco, ...outras] = ordenadas;
  return { foco, outras };
}

/**
 * Monta o objeto de contexto da vaga de uma candidatura.
 * Lê candidaturas → vagas → cliente_unidades → clientes + parse beneficios_json.
 */
async function montarContextoVaga(candidaturaId) {
  if (!candidaturaId) return null;

  // 1) Candidatura -> pega vaga_id
  const { data: cand, error: candErr } = await supabase
    .from("candidaturas")
    .select("id, vaga_id")
    .eq("id", candidaturaId)
    .maybeSingle();

  if (candErr || !cand?.vaga_id) {
    console.error("[contexto-vaga] candidatura sem vaga_id:", candErr);
    return null;
  }

  // 2) Vaga -> pega dados base + unidade + cliente
  const { data: vaga, error: vagaErr } = await supabase
    .from("vagas")
    .select(
      `id, cliente_id, unidade_id, cargo, salario, escala, horario, beneficios_json,
       unidade:cliente_unidades(id, nome, endereco_linha, bairro, cidade, uf),
       cliente:clientes(id, nome_empresa)`
    )
    .eq("id", cand.vaga_id)
    .maybeSingle();

  if (vagaErr || !vaga) {
    console.error("[contexto-vaga] erro ao carregar vaga:", vagaErr);
    return null;
  }

  const v = vaga;
  const u = Array.isArray(v.unidade) ? v.unidade[0] : v.unidade;
  const clienteDireto = Array.isArray(v.cliente) ? v.cliente[0] : v.cliente;
  const b = v.beneficios_json || {};

  // 3) Fallback do cliente via unidade, se o join direto vier vazio
  let clienteNome = clienteDireto?.nome_empresa || "";
  if (!clienteNome && u?.id) {
    const { data: unidadeComCliente } = await supabase
      .from("cliente_unidades")
      .select("id, cliente:clientes(nome_empresa)")
      .eq("id", u.id)
      .maybeSingle();
    const clienteViaUnidade = Array.isArray(unidadeComCliente?.cliente)
      ? unidadeComCliente.cliente[0]
      : unidadeComCliente?.cliente;
    clienteNome = clienteViaUnidade?.nome_empresa || "";
  }

  const beneficios_linhas = linhasBeneficiosFromJson(b);

  return {
    cliente_nome: clienteNome,
    cargo: v.cargo || "",
    unidade_nome: u?.nome || "",
    salario: v.salario ? Number(v.salario).toFixed(2).replace(".", ",") : "",
    beneficios_json: b,
    beneficios_linhas,
    endereco_linha: u?.endereco_linha || "",
    bairro: u?.bairro || "",
    cidade: u?.cidade || "",
    uf: u?.uf || "",
    escala: v.escala || "",
    horario: v.horario || "",
  };
}

/**
 * Carrega histórico de mensagens de UMA sessão específica (não do candidato inteiro).
 * Evita misturar conversas de vagas diferentes.
 */
async function loadConversationHistoryBySessao(sessaoId) {
  const { data, error } = await supabase
    .from("whatsapp_eventos")
    .select("direcao, conteudo")
    .eq("sessao_id", sessaoId)
    .order("criado_em", { ascending: true });

  if (error) {
    console.error("[supabase] erro ao carregar histórico:", error);
    return [];
  }

  const mapped = (data || [])
    .map((event) => {
      const role = event.direcao === "inbound" ? "user" : "assistant";
      const content = typeof event.conteudo === "string" ? event.conteudo : "";
      return { role, content };
    })
    .filter((m) => typeof m.content === "string" && m.content.length > 0);

  if (mapped.length > MAX_HISTORY_MESSAGES) {
    return mapped.slice(mapped.length - MAX_HISTORY_MESSAGES);
  }
  return mapped;
}

async function saveMessageEvent({ sessaoId, candidatoId, direcao, conteudo }) {
  const { error } = await supabase.from("whatsapp_eventos").insert({
    sessao_id: sessaoId,
    candidato_id: candidatoId,
    direcao,
    tipo_midia: "texto",
    conteudo,
    criado_em: new Date().toISOString(),
  });

  if (error) {
    console.error("[supabase] erro ao salvar evento:", error);
    throw error;
  }
}

function extrairJsonSeguro(texto) {
  if (!texto) return null;
  const limpo = String(texto).replace(/```json|```/g, "").trim();
  try {
    return JSON.parse(limpo);
  } catch (_err) {
    const ini = limpo.indexOf("{");
    const fim = limpo.lastIndexOf("}");
    if (ini >= 0 && fim > ini) {
      try {
        return JSON.parse(limpo.slice(ini, fim + 1));
      } catch (_err2) {
        return null;
      }
    }
    return null;
  }
}

async function atualizarScorePosEntrevista(candidatoId, sessaoId, tipoCargo) {
  try {
    const { data: sessao } = await supabase
      .from("whatsapp_sessoes")
      .select("etapa_atual")
      .eq("id", sessaoId)
      .maybeSingle();

    if (!sessao || sessao.etapa_atual !== "encerramento") return;

    const historico = await loadConversationHistoryBySessao(sessaoId);
    if (!historico || historico.length === 0) return;

    const respostasCandidato = historico.filter((m) => m.role === "user" && m.content).length;
    if (respostasCandidato < 3) return;

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
    if (perguntasRoteiroRespondidas < 3) return;

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
    if (!avaliacao) return;

    const scorePos = Number.parseInt(avaliacao.score_pos_entrevista, 10);
    if (Number.isNaN(scorePos)) return;
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

    console.log(
      `[entrevista-score] scored candidato ${candidatoId}: ${scorePosSanitizado} (final: ${scoreFinal})`
    );
  } catch (err) {
    console.error("[entrevista-score] erro ao atualizar score pós-entrevista:", err);
  }
}

function montarMensagemApresentacaoVaga(contextoVaga) {
  if (!contextoVaga) {
    return "me dá um minuto que vou confirmar os detalhes da vaga com o time";
  }

  const benefLines =
    contextoVaga.beneficios_linhas?.length > 0
      ? contextoVaga.beneficios_linhas
      : linhasBeneficiosFromJson(contextoVaga.beneficios_json);

  const bloco = [
    `Que ótimo! é uma vaga pra ${contextoVaga.cliente_nome}:`,
    `🧑‍🍳 ${contextoVaga.cargo} — ${contextoVaga.unidade_nome}`,
    `💰 Salário: R$ ${contextoVaga.salario}`,
    ...benefLines,
    `📍 ${contextoVaga.endereco_linha}, ${contextoVaga.bairro} — ${contextoVaga.cidade}/${contextoVaga.uf}`,
    `🕐 Escala ${contextoVaga.escala} (${contextoVaga.horario})`,
    "",
    "você tem interesse pela vaga?",
  ];

  return bloco.join("\n");
}

function normalizarTextoRespostaCurta(s) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Resposta afirmativa à pergunta "tem interesse pela vaga?" */
function detectaSimInteresseVaga(texto) {
  const t = normalizarTextoRespostaCurta(texto);
  if (!t) return false;
  if (/sei\b|talvez|duvid|pergunta|\?/.test(t)) return false;
  return /^(sim|s|ok|pode|quero|tenho interesse|com certeza|bora|show|beleza|fechado|topo|aceito|isso|uhum)\b|^sim[\s,.\-]|^ok[\s,.\-]|^👍/.test(
    t
  );
}

/** Resposta negativa explícita (evita "não sei", perguntas etc.) */
function detectaNaoInteresseVaga(texto) {
  const t = normalizarTextoRespostaCurta(texto);
  if (!t) return false;
  if (/sei\b|talvez|duvid|pergunta|\?/.test(t)) return false;
  return (
    /^(não|nao)(\s*[,.]|$)|^n(\s*[,.]|$)|^não quero|^nao quero|^sem interesse|^não tenho interesse|^nao tenho interesse|^prefiro não|^prefiro nao|^passo$|^desisto|^obrigad[oa].*\bn(ão|ao)\b/.test(
      t
    )
  );
}

function inferirEtapaPorMensagemAna(etapaAtual, assistantMessage) {
  const t = normalizarTextoRespostaCurta(assistantMessage);
  if (!t) return null;

  if (
    t.includes("vou te fazer algumas perguntas rapidas") ||
    t.includes("te conhecer melhor") ||
    t.includes("me conta sobre seu ultimo emprego")
  ) {
    return "mini_entrevista";
  }

  if (
    t.includes("vou passar seu perfil") ||
    t.includes("encaminhar seu perfil") ||
    t.includes("nao marco entrevista")
  ) {
    return "encerramento";
  }

  if (
    t.includes("boa sorte") ||
    t.includes("fico a disposicao se surgir algo no futuro") ||
    t.includes("nao vou mais te contactar")
  ) {
    if (
      etapaAtual === "mini_entrevista" ||
      etapaAtual === "agendamento_entrevista" ||
      etapaAtual === "encerramento"
    ) {
      return "encerramento";
    }
  }

  return null;
}

function mensagemTentaAgendarEntrevista(texto) {
  const t = normalizarTextoRespostaCurta(texto);
  if (!t) return false;
  if (t.includes("nao marco entrevista") || t.includes("nao agendo entrevista")) return false;

  const padroes = [
    /\b(agend|marcar|marquei|remarcar).{0,40}\bentrevist/,
    /\bentrevist.{0,40}\b(agend|marcar|remarc)/,
    /\bconsegui\b.{0,30}\b(agendar|marcar)\b/,
    /\bentrevista\b.{0,25}\b(amanha|hoje|segunda|terca|quarta|quinta|sexta|sabado|domingo)\b/,
    /\b(amanha|hoje|segunda|terca|quarta|quinta|sexta)\b.{0,25}\b(as|a)\s*\d{1,2}\s*h\b/,
    /\bentrevista\b.{0,20}\b(as|a)\s*\d{1,2}\s*h\b/,
    /\bconfirmad[oa].{0,30}\b(as|a)\s*\d{1,2}\s*h\b/,
    /\bhorari[oa]s?\s+disponiveis\b/,
    /\bte espero\b.{0,30}\b(entrevista|loja|endereco)\b/,
    /\bcomparec/,
    /\bvolto aqui pra marcar uma entrevista presencial\b/,
    /\bentrevista presencial com voce\b/,
    /\bquerem marcar a entrevista presencial\b/,
  ];
  return padroes.some((re) => re.test(t));
}

function candidatoPerguntaAgendamento(texto) {
  const t = normalizarTextoRespostaCurta(texto);
  if (!t) return false;
  return (
    /\b(que dia|qual dia|que horario|qual horario|que hora|qual hora)\b/.test(t) &&
    /\b(entrevist|marcar|agend)\b/.test(t)
  );
}

function sanitizarMensagemAna(etapaAtual, userMessage, assistantMessage) {
  const msg = String(assistantMessage || "").trim();
  const user = normalizarTextoRespostaCurta(userMessage);
  const etapa = normalizarTextoRespostaCurta(etapaAtual || "");

  if (candidatoPerguntaAgendamento(userMessage)) {
    return MENSAGEM_CANDIDATO_PERGUNTA_ENTREVISTA;
  }

  if (mensagemTentaAgendarEntrevista(msg)) {
    console.warn("[ana] bloqueio agendamento de entrevista:", msg.slice(0, 120));
    return MENSAGEM_SEM_AGENDAMENTO;
  }

  // Evita alucinação de "fala do candidato" em primeira pessoa pela Ana.
  if (
    etapa === "mini_entrevista" &&
    /^(trabalhei|meu desligamento|eu lido|eu trabalhei)\b/i.test(msg)
  ) {
    return "pode me contar melhor? me fala sobre seu último emprego.";
  }

  // Quando candidato responde algo como "tanto faz", Ana deve apenas conduzir pergunta.
  if (etapa === "mini_entrevista" && /forma como preferir|tanto faz|como preferir/.test(user)) {
    return "pode me contar melhor? me fala sobre seu último emprego.";
  }

  return msg;
}

async function sendWhatsAppMessage(toDigits, message) {
  const phoneNumberId = process.env.KAPSO_PHONE_NUMBER_ID;
  const apiKey = process.env.KAPSO_API_KEY;

  if (!apiKey || !phoneNumberId) {
    throw new Error("KAPSO_API_KEY ou KAPSO_PHONE_NUMBER_ID não configurados no servidor");
  }

  const url = `https://api.kapso.ai/meta/whatsapp/v24.0/${phoneNumberId}/messages`;
  const body = {
    messaging_product: "whatsapp",
    to: toDigits,
    type: "text",
    text: { body: message },
  };

  console.log("[kapso] enviando para URL:", url);

  const response = await axios.post(url, body, {
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
  });
  console.log("[kapso] mensagem enviada, status:", response.status);
  return response.data;
}

async function sendKapsoMessage(toDigits, message) {
  await sendWhatsAppMessage(toDigits, message);
}

async function processarMidia(msg, phoneNumberId, candidatoId) {
  try {
    const tipo = msg.type;
    const mediaId = msg.audio?.id || msg.document?.id || msg.image?.id;
    if (!mediaId) return null;

    console.log("[processarMidia] mediaId:", mediaId, "tipo:", tipo);
    const bytes = await kapsoClient.media.download({
      mediaId,
      phoneNumberId,
    });
    console.log(
      "[processarMidia] bytes recebidos:",
      bytes?.byteLength || bytes?.length || typeof bytes
    );
    const buffer = Buffer.from(bytes);
    console.log("[processarMidia] buffer size:", buffer.length);

    if (tipo === "audio") {
      const groq = getGroqClient();
      if (!groq) {
        console.error("[processarMidia] GROQ_API_KEY ausente — áudio não transcrito");
        return null;
      }
      const transcricao = await groq.audio.transcriptions.create({
        file: new File([buffer], "audio.ogg", { type: "audio/ogg" }),
        model: "whisper-large-v3",
        language: "pt",
        response_format: "text",
      });
      return `[áudio transcrito]: ${transcricao}`;
    }

    if (tipo === "document" && msg.document?.mime_type === "application/pdf") {
      const parsed = await pdfParse(buffer);
      const cvText = parsed.text.slice(0, 3000);
      const dados = await processarCV(cvText, candidatoId);
      if (dados) {
        const cargo = dados.candidato.cargo_principal || "não identificado";
        const ultimaExp = dados.analise.ultima_experiencia || "não identificada";
        return `[currículo processado]: cargo principal: ${cargo}. última experiência: ${ultimaExp}`;
      }
      return `[currículo recebido]: ${cvText}`;
    }

    if (tipo === "image") {
      const base64 = buffer.toString("base64");
      const mimeType = msg.image?.mime_type || "image/jpeg";

      const response = await anthropic.messages.create({
        model: process.env.CLAUDE_MODEL || "claude-3-5-sonnet-latest",
        max_tokens: 2000,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mimeType,
                  data: base64,
                },
              },
              {
                type: "text",
                text: "Esta é uma imagem de um currículo. Extraia todo o texto visível e retorne apenas o texto extraído, sem comentários.",
              },
            ],
          },
        ],
      });

      const textOut = (response.content || [])
        .filter((c) => c.type === "text")
        .map((c) => c.text)
        .join("\n");
      const cvText = textOut;
      const dados = await processarCV(cvText, candidatoId);
      if (dados) {
        const cargo = dados.candidato.cargo_principal || "não identificado";
        const ultimaExp = dados.analise.ultima_experiencia || "não identificada";
        return `[currículo processado]: cargo principal: ${cargo}. última experiência: ${ultimaExp}`;
      }
      return `[imagem de currículo recebida]: ${cvText.slice(0, 500)}`;
    }

    return null;
  } catch (err) {
    console.error("[processarMidia] erro:", err);
    return null;
  }
}

async function processarCV(cvText, candidatoId) {
  const hoje = new Date().toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const prompt = `A data de hoje é ${hoje}. Use como referência absoluta para calcular durações, identificar empregos atuais e avaliar se datas são passadas ou futuras.
Você é recrutador sênior em food service. Retorne APENAS JSON válido, sem markdown.
{
  "candidato": {
    "nome": "Capitalizar cada palavra exceto preposições (da, de, do, dos, das, e)",
    "cargo_principal": "cargo do último emprego ou null",
    "cidade": "apenas se explícito ou null",
    "bairro": "apenas se explícito ou null",
    "cep": "formato 00000-000, apenas se explícito, não inferir, ou null",
    "escolaridade": "nível mais alto concluído ou em andamento ou null",
    "genero": "Masculino | Feminino | Não informado (inferir pelo primeiro nome)",
    "data_nascimento": "YYYY-MM-DD se explícito, não inferir, ou null",
    "situacao_emprego": "Empregado se último emprego sem data de fim OU texto contém 'atual', 'atualmente', 'presente'. Desempregado se último emprego tem data de fim anterior a hoje. null se não inferível."
  },
  "experiencias": [
    {
      "empresa": "nome da empresa",
      "cargo": "cargo exercido ou null",
      "setor": "alimentacao | cozinha | atendimento | lideranca | outro",
      "data_inicio": "YYYY-MM-DD ou null",
      "data_fim": "YYYY-MM-DD ou null se emprego atual",
      "meses": "calcular pelas datas usando hoje como referência para empregos sem data_fim",
      "eh_lideranca": "true só se cargo envolve gestão direta de pessoas com evidência no texto",
      "crescimento_interno": "true só se houve mudança de cargo com escopo crescente na mesma empresa"
    }
  ],
  "analise": {
    "perfil_resumo": "cargo predominante + tempo total de experiência relevante em food service",
    "pontos_fortes": "texto corrido, apenas evidências rastreáveis no CV, null se nenhuma",
    "red_flags": "texto corrido, fatos concretos com trecho literal entre aspas, null se nenhum",
    "fit_food_service": "Alto | Médio | Baixo",
    "analise_completa": "[Nome] é [cargo] com [tempo]. O que chama atenção: [fato]. O que preocupa: [fato]. Recomendação: Chamar para triagem | Triagem com ressalva | Não priorizar — [fator decisivo].",
    "score_ia": "0-100. Experiência direta food service com permanência (40%), estabilidade vínculos (30%), evidências comportamentais (30%)",
    "ultima_experiencia": "Empresa — cargo, duração"
  }
}
CV:
"""${cvText}"""`;

  try {
    const msg = await anthropic.messages.create({
      model: process.env.CLAUDE_MODEL || "claude-3-5-sonnet-latest",
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    });

    const textOut = (msg.content || [])
      .filter((c) => c.type === "text")
      .map((c) => c.text)
      .join("\n");
    const raw = textOut.replace(/```json|```/g, "").trim();
    const dados = JSON.parse(raw);

    const updateCandidato = {};
    if (dados.candidato.nome) updateCandidato.nome = dados.candidato.nome;
    if (dados.candidato.cargo_principal) updateCandidato.cargo_principal = dados.candidato.cargo_principal;
    if (dados.candidato.cidade) updateCandidato.cidade = dados.candidato.cidade;
    if (dados.candidato.bairro) updateCandidato.bairro = dados.candidato.bairro;
    if (dados.candidato.cep) updateCandidato.cep = dados.candidato.cep;
    if (dados.candidato.escolaridade) updateCandidato.escolaridade = dados.candidato.escolaridade;
    if (dados.candidato.genero) updateCandidato.genero = dados.candidato.genero;
    if (dados.candidato.data_nascimento) updateCandidato.data_nascimento = dados.candidato.data_nascimento;
    if (dados.candidato.situacao_emprego) updateCandidato.situacao_emprego = dados.candidato.situacao_emprego;

    if (Object.keys(updateCandidato).length > 0) {
      await supabase.from("candidatos").update(updateCandidato).eq("id", candidatoId);
    }

    if (dados.experiencias?.length > 0) {
      const experiencias = dados.experiencias.map((exp) => ({
        candidato_id: candidatoId,
        empresa: exp.empresa,
        cargo: exp.cargo,
        setor: exp.setor,
        data_inicio: exp.data_inicio,
        data_fim: exp.data_fim,
        meses: exp.meses,
        eh_lideranca: exp.eh_lideranca === "true" || exp.eh_lideranca === true,
        crescimento_interno: exp.crescimento_interno === "true" || exp.crescimento_interno === true,
      }));
      await supabase.from("candidatos_experiencia").insert(experiencias);
    }

    const analiseData = {
      candidato_id: candidatoId,
      perfil_resumo: dados.analise.perfil_resumo,
      pontos_fortes: dados.analise.pontos_fortes,
      red_flags: dados.analise.red_flags,
      fit_food_service: dados.analise.fit_food_service,
      analise_completa: dados.analise.analise_completa,
      score_ia: parseInt(dados.analise.score_ia, 10) || null,
      ultima_experiencia: dados.analise.ultima_experiencia,
      modelo_usado: process.env.CLAUDE_MODEL || "claude-3-5-sonnet-latest",
      processado_em: new Date().toISOString(),
    };

    const { data: analiseExistente } = await supabase
      .from("candidatos_analise")
      .select("id")
      .eq("candidato_id", candidatoId)
      .single();

    if (analiseExistente) {
      await supabase.from("candidatos_analise").update(analiseData).eq("candidato_id", candidatoId);
    } else {
      await supabase.from("candidatos_analise").insert(analiseData);
    }

    console.log("[processarCV] salvo no Supabase para candidato:", candidatoId);
    return dados;
  } catch (err) {
    console.error("[processarCV] erro:", err);
    return null;
  }
}

async function getGeResponse(candidatoId, userMessage) {
  // 1. Carrega sessões ativas do candidato
  const { foco, outras } = await loadAllActiveSessionsContext(candidatoId);

  // 2. Garante sessão (se não tem foco, cria reativa)
  const sessaoId = foco?.id || (await getOrCreateActiveSession(candidatoId));

  // 3. Registra evento inbound
  await saveMessageEvent({
    sessaoId,
    candidatoId,
    direcao: "inbound",
    conteudo: userMessage,
  });

  // 4. Atualiza sessão: candidato respondeu + avança etapa se era disparo_template
  const nowIso = new Date().toISOString();
  const updates = {
    ultima_inbound_at: nowIso,
    candidato_respondeu: true,
  };
  if (foco && !foco.candidato_respondeu) {
    updates.primeira_resposta_at = nowIso;
  }
  if (foco?.etapa_atual === "disparo_template" && foco?.candidatura_id) {
    updates.etapa_atual = "apresentacao_vaga";
  }
  if (foco?.etapa_atual === "apresentacao_vaga") {
    if (detectaSimInteresseVaga(userMessage)) {
      updates.etapa_atual = "confirma_endereco";
    } else if (detectaNaoInteresseVaga(userMessage)) {
      updates.etapa_atual = "encerramento";
    }
  }
  await supabase.from("whatsapp_sessoes").update(updates).eq("id", sessaoId);

  // 5. Busca dados do candidato e análise
  let candidato = null;
  let analise = null;
  try {
    const { data: cand } = await supabase
      .from("candidatos")
      .select("nome, cargo_principal, cidade, bairro, cep, situacao_emprego, status_disponibilidade")
      .eq("id", candidatoId)
      .single();
    candidato = cand;

    const { data: anal } = await supabase
      .from("candidatos_analise")
      .select("score_ia, tags, fit_food_service, ultima_experiencia, disponibilidade_horario")
      .eq("candidato_id", candidatoId)
      .single();
    analise = anal;
  } catch (err) {
    console.error("[getGeResponse] erro ao buscar dados do candidato:", err);
  }

  // 6. Define estado efetivo para o prompt já refletir transição de etapa no mesmo turno
  const candidaturaFocoId = foco?.candidatura_id || null;
  const tipoFluxoAtual = foco?.tipo_fluxo || (candidaturaFocoId ? "candidatura" : "reativo");
  const etapaAtualPrompt = updates.etapa_atual || foco?.etapa_atual || "abertura";

  // 7. Monta contexto da vaga em foco (se houver candidatura vinculada)
  const contextoVaga = candidaturaFocoId ? await montarContextoVaga(candidaturaFocoId) : null;

  // 8. Injeta placeholders no system prompt
  const cargoReferencia =
    contextoVaga?.cargo || candidato?.cargo_principal || "";
  const tipoCargo = inferirTipoCargo(cargoReferencia);

  let systemPromptDinamico = SYSTEM_PROMPT
    .replace(/\{\{nome\}\}/g, candidato?.nome || "não informado")
    .replace(/\{\{cargo_principal\}\}/g, candidato?.cargo_principal || "não informado")
    .replace(/\{\{tipo_cargo\}\}/g, tipoCargo)
    .replace(/\{\{cidade\}\}/g, candidato?.cidade || "não informada")
    .replace(/\{\{bairro\}\}/g, candidato?.bairro || "não informado")
    .replace(/\{\{situacao_emprego\}\}/g, candidato?.situacao_emprego || "não informada")
    .replace(/\{\{score_ia\}\}/g, analise?.score_ia?.toString() || "não calculado")
    .replace(/\{\{tags\}\}/g, analise?.tags?.join(", ") || "nenhuma")
    .replace(/\{\{fit_food_service\}\}/g, analise?.fit_food_service || "não avaliado")
    .replace(/\{\{disponibilidade_horario\}\}/g, analise?.disponibilidade_horario || "não informada")
    .replace(/\{\{tipo_fluxo\}\}/g, tipoFluxoAtual)
    .replace(/\{\{etapa_atual\}\}/g, etapaAtualPrompt);

  if (contextoVaga) {
    systemPromptDinamico = systemPromptDinamico
      .replace(/\{\{vaga\.cliente_nome\}\}/g, contextoVaga.cliente_nome)
      .replace(/\{\{vaga\.cargo\}\}/g, contextoVaga.cargo)
      .replace(/\{\{vaga\.unidade_nome\}\}/g, contextoVaga.unidade_nome)
      .replace(/\{\{vaga\.salario\}\}/g, contextoVaga.salario)
      .replace(/\{\{vaga\.bonus_meta\}\}/g, contextoVaga.bonus_meta)
      .replace(/\{\{vaga\.vale_alimentacao\}\}/g, contextoVaga.vale_alimentacao)
      .replace(/\{\{vaga\.endereco_linha\}\}/g, contextoVaga.endereco_linha)
      .replace(/\{\{vaga\.bairro\}\}/g, contextoVaga.bairro)
      .replace(/\{\{vaga\.cidade\}\}/g, contextoVaga.cidade)
      .replace(/\{\{vaga\.uf\}\}/g, contextoVaga.uf)
      .replace(/\{\{vaga\.escala\}\}/g, contextoVaga.escala)
      .replace(/\{\{vaga\.horario\}\}/g, contextoVaga.horario)
      .replace(
        /\{\{vaga\.beneficios_linhas\}\}/g,
        (contextoVaga.beneficios_linhas || []).join("\n")
      );
  } else {
    systemPromptDinamico = systemPromptDinamico.replace(/\{\{vaga\.[^}]+\}\}/g, "");
  }

  // 9. Nota sobre outras sessões ativas (se houver)
  if (outras && outras.length > 0) {
    const lista = outras
      .map((s) => `- candidatura_id=${s.candidatura_id || "sem vaga"}, etapa=${s.etapa_atual}`)
      .join("\n");
    systemPromptDinamico += `\n\n## OUTRAS CONVERSAS ATIVAS DESTE CANDIDATO\n${lista}\n\nFoque na conversa em andamento. Se o candidato mencionar outra vaga, peça contexto antes de responder.`;
  }

  // 10. Só neste turno (vindo do template): texto fixo da vaga. Depois do "sim" inicial a etapa já é apresentacao_vaga no BD — não repetir o bloco.
  if (
    tipoFluxoAtual === "candidatura" &&
    etapaAtualPrompt === "apresentacao_vaga" &&
    foco?.etapa_atual === "disparo_template"
  ) {
    const assistantMessage = montarMensagemApresentacaoVaga(contextoVaga);

    await saveMessageEvent({
      sessaoId,
      candidatoId,
      direcao: "outbound",
      conteudo: assistantMessage,
    });
    await supabase
      .from("whatsapp_sessoes")
      .update({ ultima_outbound_at: new Date().toISOString() })
      .eq("id", sessaoId);

    return assistantMessage;
  }

  // 11. Carrega histórico DA SESSÃO (não do candidato inteiro)
  const history = await loadConversationHistoryBySessao(sessaoId);

  // 12. Chama Claude
  const response = await anthropic.messages.create({
    model: process.env.CLAUDE_MODEL || "claude-sonnet-4-5",
    max_tokens: 300,
    system: systemPromptDinamico,
    messages: history,
  });

  const rawAssistantMessage = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
  const assistantMessage = sanitizarMensagemAna(etapaAtualPrompt, userMessage, rawAssistantMessage);

  const etapaInferida = inferirEtapaPorMensagemAna(etapaAtualPrompt, assistantMessage);
  if (etapaInferida) {
    await supabase
      .from("whatsapp_sessoes")
      .update({ etapa_atual: etapaInferida })
      .eq("id", sessaoId);
  }

  // 13. Registra outbound e atualiza ultima_outbound_at
  await saveMessageEvent({
    sessaoId,
    candidatoId,
    direcao: "outbound",
    conteudo: assistantMessage,
  });
  await supabase
    .from("whatsapp_sessoes")
    .update({ ultima_outbound_at: new Date().toISOString() })
    .eq("id", sessaoId);

  if (tipoFluxoAtual === "candidatura") {
    await atualizarScorePosEntrevista(candidatoId, sessaoId, tipoCargo);
  }

  return assistantMessage;
}

function consumeIdempotencyKey(req, res) {
  const key = req.headers["x-idempotency-key"];
  if (!key) return true;

  if (idempotencyHas(key)) {
    console.log("[webhook] duplicata ignorada (X-Idempotency-Key):", key);
    res.status(200).json({ ok: true, duplicate: true });
    return false;
  }

  idempotencyAdd(key);
  return true;
}

app.get("/health", (_req, res) => {
  res.status(200).json({
    ok: true,
    version: APP_VERSION,
    kapso_phone_configured: Boolean(KAPSO_PHONE_NUMBER_ID),
    supabase_configured: Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ),
  });
});

async function queueInboundForProcessing(extracted) {
  const { conversationId, to, text, phoneNumberId, type, msg } = extracted;

  if (text === "ping-verificacao-integracao") {
    console.log("[webhook] ping de verificação (sem resposta automática)");
    return { ok: true, ping: true };
  }

  console.log(`[webhook] inbound ${to} conv=${conversationId || "—"} texto=${text || `[${type}]`}`);

  const candidatoId =
    (conversationId ? await resolveCandidatoIdByConversation(conversationId) : null) ||
    (await resolveCandidatoIdByPhone(to));

  if (!candidatoId) {
    console.error("[webhook] candidato não encontrado para telefone", to);
    await sendKapsoMessage(
      to,
      "oi! recebi sua mensagem — estou com uma instabilidade no cadastro. pode mandar seu nome completo?"
    );
    return { ok: false, reason: "no_candidato" };
  }

  if (extracted.messageId && (await isKnownOutboundKapsoMessageId(extracted.messageId))) {
    console.log("[webhook] ignorado: eco outbound (kapso_message_id)", extracted.messageId);
    return { ok: true, skipped: "outbound_echo_id" };
  }

  if (conversationId) {
    await linkKapsoConversationToActiveSession(candidatoId, conversationId);
  }

  let textoFinal = text;
  if (!textoFinal && (type === "audio" || type === "document" || type === "image")) {
    textoFinal = await processarMidia(msg, phoneNumberId || KAPSO_PHONE_NUMBER_ID, candidatoId);
    if (!textoFinal) {
      await sendKapsoMessage(
        to,
        "não consegui processar esse arquivo. pode mandar em texto ou tentar de novo?"
      );
      return { ok: true, media_unparsed: true };
    }
  }

  if (textoFinal && (await isEchoOfRecentCrmOutbound(candidatoId, textoFinal))) {
    console.log("[webhook] ignorado: eco de mensagem manual do CRM");
    return { ok: true, skipped: "manual_crm_echo" };
  }

  const chave = to;
  if (pendingMessages.has(chave)) {
    clearTimeout(pendingMessages.get(chave).timer);
    pendingMessages.get(chave).texts.push(textoFinal);
  } else {
    pendingMessages.set(chave, { texts: [textoFinal], timer: null });
  }

  pendingMessages.get(chave).timer = setTimeout(async () => {
    const textoAgregado = pendingMessages.get(chave).texts.join(" ");
    pendingMessages.delete(chave);
    try {
      const resposta = await getGeResponse(candidatoId, textoAgregado);
      await sendKapsoMessage(to, resposta);
    } catch (err) {
      console.error("[webhook] erro ao processar mensagem agregada:", err.message || err);
    }
  }, 3000);

  return { ok: true };
}

app.post("/webhook", async (req, res) => {
  try {
    if (!consumeIdempotencyKey(req, res)) return;

    const expanded = expandKapsoWebhookBodies(req.headers, req.body);
    if (expanded.skipReason) {
      console.log("[webhook] ignorado:", expanded.skipReason, "event=", expanded.eventType);
      return res.status(200).json({ ok: true, skipped: expanded.skipReason });
    }

    const results = [];
    for (const itemPayload of expanded.items) {
      const messageId = itemPayload?.message?.id;
      if (messageId) {
        if (idempotencyHas(messageId)) {
          console.log("[webhook] duplicata ignorada (message.id):", messageId);
          results.push({ duplicate: true });
          continue;
        }
        idempotencyAdd(messageId);
      }

      const extracted = extractKapsoInboundFromPayload(itemPayload);
      if (extracted.skip) {
        console.log("[webhook] item ignorado:", extracted.reason, extracted.messageType || "");
        results.push({ skipped: extracted.reason });
        continue;
      }

      if (extracted.messageId && (await isKnownOutboundKapsoMessageId(extracted.messageId))) {
        console.log("[webhook] ignorado: eco outbound (id)", extracted.messageId);
        results.push({ skipped: "outbound_echo_id" });
        continue;
      }

      if (
        !phoneNumberIdMatchesConfigured(extracted.phoneNumberId, KAPSO_PHONE_NUMBER_ID)
      ) {
        console.error(
          "[webhook] phone_number_id divergente — inbound=",
          extracted.phoneNumberId,
          "env=",
          KAPSO_PHONE_NUMBER_ID
        );
        results.push({ skipped: "phone_number_mismatch" });
        continue;
      }

      const r = await queueInboundForProcessing(extracted);
      results.push(r);
    }

    return res.status(200).json({ ok: true, processed: results.length, results });
  } catch (err) {
    console.error("[webhook] ERRO NÃO CAPTURADO:", err);
    res.status(500).json({ error: err.message });
  }
});

function validateStartupEnv() {
  const required = [
    "KAPSO_API_KEY",
    "KAPSO_PHONE_NUMBER_ID",
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "ANTHROPIC_API_KEY",
  ];
  const missing = required.filter((k) => !process.env[k] || !String(process.env[k]).trim());
  if (missing.length) {
    console.error("[startup] VARIÁVEIS OBRIGATÓRIAS AUSENTES:", missing.join(", "));
    console.error("[startup] O bot sobe, mas webhook/disparo vão falhar até corrigir no Railway.");
  } else {
    console.log("[startup] variáveis críticas OK (Kapso + Supabase + Anthropic)");
  }
}

app.listen(PORT, "0.0.0.0", () => {
  validateStartupEnv();
  console.log(`[whatsapp-bot] rodando em 0.0.0.0:${PORT}`);
  console.log("[whatsapp-bot] webhook POST /webhook (Kapso v2 + batch)");
  console.log(`[whatsapp-bot] version=${APP_VERSION}`);
});
