const express = require("express");
const axios = require("axios");
const dotenv = require("dotenv");
const { createClient } = require("@supabase/supabase-js");
const Anthropic = require("@anthropic-ai/sdk");
const { WhatsAppClient } = require("@kapso/whatsapp-cloud-api");
const pdfParse = require("pdf-parse/lib/pdf-parse.js");
const Groq = require("groq-sdk");
const { SYSTEM_PROMPT_BASE } = require("./ana-prompt");
dotenv.config();

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const PORT = Number(process.env.PORT || 3333);
const KAPSO_PHONE_NUMBER_ID = process.env.KAPSO_PHONE_NUMBER_ID || "";

const MAX_HISTORY_MESSAGES = 20;

const app = express();
app.use(express.json({ limit: "2mb" }));

/** Dedupe de retries do Kapso via header X-Idempotency-Key */
const processedIdempotencyKeys = new Set();
const IDEMPOTENCY_CACHE_MAX = 5000;
const pendingMessages = new Map();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || "",
});

const kapsoClient = new WhatsAppClient({
  baseUrl: "https://api.kapso.ai/meta/whatsapp",
  kapsoApiKey: process.env.KAPSO_API_KEY,
});

const SYSTEM_PROMPT = SYSTEM_PROMPT_BASE;

/**
 * Extrai dados do webhook Kapso v2 (event whatsapp.message.received).
 */
function extractKapsoInbound(req) {
  const payload = req.body;
  const headerEvent = req.headers["x-webhook-event"];
  const bodyEvent = payload?.event;

  if (headerEvent !== "whatsapp.message.received" && bodyEvent !== "whatsapp.message.received") {
    return { skip: true, reason: "wrong_event" };
  }

  const msg = payload?.message;
  if (!msg) return { skip: true, reason: "no_message" };

  if (msg.kapso?.direction !== "inbound") {
    return { skip: true, reason: "not_inbound" };
  }

  if (msg.type !== "text" || !msg.text?.body) {
    const tiposSuportados = ["audio", "document", "image"];
    if (tiposSuportados.includes(msg.type) && msg.kapso?.has_media) {
      return {
        skip: false,
        from: msg.from,
        to: normalizeE164Digits(msg.from),
        text: null,
        type: msg.type,
        msg,
        conversationId: payload?.conversation?.id,
        phoneNumberId: payload?.conversation?.phone_number_id || payload?.phone_number_id,
      };
    }
    console.log("[webhook] mensagem não-texto recebida:", JSON.stringify(msg, null, 2));
    return { skip: true, reason: "not_supported" };
  }

  const conversationId = payload?.conversation?.id;
  const from = msg.from;
  const text = String(msg.text.body).trim();
  const phoneNumberId = payload?.conversation?.phone_number_id || payload?.phone_number_id;

  if (!conversationId || !from || !text) {
    return { skip: true, reason: "missing_fields" };
  }

  return {
    skip: false,
    conversationId,
    to: normalizeE164Digits(from),
    text,
    phoneNumberId,
  };
}

function normalizeE164Digits(phone) {
  return String(phone).replace(/\D/g, "");
}

function buildPhoneLookupVariants(phoneDigits) {
  const onlyDigits = normalizeE164Digits(phoneDigits);
  const variants = new Set([onlyDigits, `+${onlyDigits}`]);
  if (onlyDigits.startsWith("55")) {
    const local = onlyDigits.slice(2);
    if (local) {
      variants.add(local);
      variants.add(`+55${local}`);
    }
  }
  return Array.from(variants).filter(Boolean);
}

async function resolveCandidatoIdByPhone(phoneDigits) {
  const phoneVariants = buildPhoneLookupVariants(phoneDigits);
  const { data, error } = await supabase
    .from("candidatos")
    .select("id,telefone")
    .in("telefone", phoneVariants)
    .limit(1);

  if (error) {
    console.error("[supabase] erro ao buscar candidato por telefone:", error);
    throw error;
  }

  const candidate = (data || [])[0];
  if (candidate?.id) return candidate.id;

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
    console.error("[supabase] erro ao criar candidato automático:", createError);
    throw createError;
  }
  return created.id;
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

  const [foco, ...outras] = sessoes;
  return { foco, outras };
}

/**
 * Monta o objeto de contexto da vaga de uma candidatura.
 * Lê candidaturas → vagas → cliente_unidades → clientes + parse beneficios_json.
 */
async function montarContextoVaga(candidaturaId) {
  if (!candidaturaId) return null;

  const { data: cand, error: candErr } = await supabase
    .from("candidaturas")
    .select(
      `id, vaga_id,
       vaga:vagas(
         id, cargo, salario, escala, horario, beneficios_json, unidade_id,
         unidade:cliente_unidades(nome, endereco_linha, bairro, cidade, uf),
         cliente:clientes(nome_empresa)
       )`
    )
    .eq("id", candidaturaId)
    .maybeSingle();

  if (candErr || !cand?.vaga) {
    console.error("[contexto-vaga] erro ou vaga não encontrada:", candErr);
    return null;
  }

  const v = cand.vaga;
  const u = Array.isArray(v.unidade) ? v.unidade[0] : v.unidade;
  const cliente = Array.isArray(v.cliente) ? v.cliente[0] : v.cliente;
  const b = v.beneficios_json || {};

  return {
    cliente_nome: cliente?.nome_empresa || "",
    cargo: v.cargo || "",
    unidade_nome: u?.nome || "",
    salario: v.salario ? Number(v.salario).toFixed(2).replace(".", ",") : "",
    bonus_meta: b.bonus_meta || "",
    vale_alimentacao: b.vale_alimentacao != null ? String(b.vale_alimentacao) : "",
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

async function loadConversationHistory(candidatoId) {
  const { data, error } = await supabase
    .from("whatsapp_eventos")
    .select("direcao,conteudo")
    .eq("candidato_id", candidatoId)
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
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string");

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

async function sendWhatsAppMessage(toDigits, message) {
  const phoneNumberId = process.env.KAPSO_PHONE_NUMBER_ID;
  const apiKey = process.env.KAPSO_API_KEY;

  if (!apiKey || !phoneNumberId) {
    console.error("[kapso] KAPSO_API_KEY ou KAPSO_PHONE_NUMBER_ID não configurados");
    return;
  }

  // Doc Kapso: POST .../meta/whatsapp/v24.0/{phone_number_id}/messages
  const url = `https://api.kapso.ai/meta/whatsapp/v24.0/${phoneNumberId}/messages`;
  const body = {
    messaging_product: "whatsapp",
    to: toDigits,
    type: "text",
    text: { body: message },
  };

  console.log("[kapso] enviando para URL:", url);
  console.log("[kapso] body:", JSON.stringify(body));

  try {
    const response = await axios.post(url, body, {
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
    });
    console.log("[kapso] mensagem enviada, status:", response.status);
  } catch (err) {
    console.error("[kapso] erro ao enviar:", err?.response?.status, JSON.stringify(err?.response?.data));
  }
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

  // 6. Monta contexto da vaga em foco (se houver candidatura vinculada)
  const contextoVaga = foco?.candidatura_id
    ? await montarContextoVaga(foco.candidatura_id)
    : null;

  // 7. Injeta placeholders no system prompt
  let systemPromptDinamico = SYSTEM_PROMPT
    .replace(/\{\{nome\}\}/g, candidato?.nome || "não informado")
    .replace(/\{\{cargo_principal\}\}/g, candidato?.cargo_principal || "não informado")
    .replace(/\{\{cidade\}\}/g, candidato?.cidade || "não informada")
    .replace(/\{\{situacao_emprego\}\}/g, candidato?.situacao_emprego || "não informada")
    .replace(/\{\{score_ia\}\}/g, analise?.score_ia?.toString() || "não calculado")
    .replace(/\{\{tags\}\}/g, analise?.tags?.join(", ") || "nenhuma")
    .replace(/\{\{fit_food_service\}\}/g, analise?.fit_food_service || "não avaliado")
    .replace(/\{\{ultima_experiencia\}\}/g, analise?.ultima_experiencia || "não informada")
    .replace(/\{\{disponibilidade_horario\}\}/g, analise?.disponibilidade_horario || "não informada")
    .replace(/\{\{tipo_fluxo\}\}/g, foco?.tipo_fluxo || "reativo")
    .replace(/\{\{etapa_atual\}\}/g, foco?.etapa_atual || "abertura");

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
      .replace(/\{\{vaga\.horario\}\}/g, contextoVaga.horario);
  } else {
    systemPromptDinamico = systemPromptDinamico.replace(/\{\{vaga\.[^}]+\}\}/g, "");
  }

  // 8. Nota sobre outras sessões ativas (se houver)
  if (outras && outras.length > 0) {
    const lista = outras
      .map((s) => `- candidatura_id=${s.candidatura_id || "sem vaga"}, etapa=${s.etapa_atual}`)
      .join("\n");
    systemPromptDinamico += `\n\n## OUTRAS CONVERSAS ATIVAS DESTE CANDIDATO\n${lista}\n\nFoque na conversa em andamento. Se o candidato mencionar outra vaga, peça contexto antes de responder.`;
  }

  // 9. Carrega histórico DA SESSÃO (não do candidato inteiro)
  const history = await loadConversationHistoryBySessao(sessaoId);

  // 10. Chama Claude
  const response = await anthropic.messages.create({
    model: process.env.CLAUDE_MODEL || "claude-sonnet-4-5",
    max_tokens: 1024,
    system: systemPromptDinamico,
    messages: history,
  });

  const assistantMessage = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  // 11. Registra outbound e atualiza ultima_outbound_at
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

function consumeIdempotencyKey(req, res) {
  const key = req.headers["x-idempotency-key"];
  if (!key) return true;

  if (processedIdempotencyKeys.has(key)) {
    console.log("[webhook] duplicata ignorada (X-Idempotency-Key):", key);
    res.status(200).json({ ok: true, duplicate: true });
    return false;
  }

  processedIdempotencyKeys.add(key);
  if (processedIdempotencyKeys.size > IDEMPOTENCY_CACHE_MAX) {
    processedIdempotencyKeys.clear();
  }
  return true;
}

app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true });
});

app.post("/webhook", async (req, res) => {
  try {
    console.log("[webhook] payload recebido:", JSON.stringify(req.body, null, 2));
    if (!consumeIdempotencyKey(req, res)) return;
    const messageId = req.body?.message?.id;
    if (messageId) {
      if (processedIdempotencyKeys.has(messageId)) {
        console.log("[webhook] duplicata ignorada (message.id):", messageId);
        return res.status(200).json({ ok: true, duplicate: true });
      }
      processedIdempotencyKeys.add(messageId);
      if (processedIdempotencyKeys.size > IDEMPOTENCY_CACHE_MAX) {
        processedIdempotencyKeys.clear();
      }
    }

    const extracted = extractKapsoInbound(req);
    if (extracted.skip) {
      return res.status(200).json({ ok: true, skipped: extracted.reason });
    }

    const { conversationId, to, text, phoneNumberId, type, msg } = extracted;

    if (
      KAPSO_PHONE_NUMBER_ID &&
      phoneNumberId &&
      phoneNumberId !== KAPSO_PHONE_NUMBER_ID
    ) {
      console.log("[webhook] phone_number_id diferente do configurado, ignorando");
      return res.status(200).json({ ok: true, skipped: "phone_number_mismatch" });
    }

    if (!to) {
      return res.status(200).json({ ok: true, skipped: "invalid_to" });
    }

    console.log("[webhook] payload bruto:", JSON.stringify(req.body, null, 2));
    console.log(`[webhook] conversa ${conversationId} de ${to}: ${text}`);

    const candidatoId = await resolveCandidatoIdByPhone(to);
    let textoFinal = text;

    if (!textoFinal && (type === "audio" || type === "document" || type === "image")) {
      textoFinal = await processarMidia(msg, phoneNumberId, candidatoId);
      if (!textoFinal) {
        await sendKapsoMessage(to, "não consegui processar esse arquivo. pode mandar em texto ou tentar de novo?");
        return res.status(200).json({ ok: true });
      }
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
        console.error("[webhook] erro ao processar mensagem agregada:", err);
      }
    }, 3000);

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[webhook] ERRO NÃO CAPTURADO:", err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`[whatsapp-bot] rodando em http://localhost:${PORT}`);
  console.log("[whatsapp-bot] webhook em POST /webhook (Kapso v2)");
});
