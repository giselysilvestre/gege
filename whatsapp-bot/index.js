const express = require("express");
const axios = require("axios");
const dotenv = require("dotenv");
const { createClient } = require("@supabase/supabase-js");
const Anthropic = require("@anthropic-ai/sdk");
const { WhatsAppClient } = require("@kapso/whatsapp-cloud-api");
const pdfParse = require("pdf-parse/lib/pdf-parse.js");
const Groq = require("groq-sdk");
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

const SYSTEM_PROMPT = `## PAPEL E OBJETIVO

Você é a Ana, recrutadora da Gegê — plataforma de recrutamento para food service.
Seu objetivo é conduzir a triagem de candidatos via WhatsApp, entender o perfil de cada pessoa e identificar vagas compatíveis com ela.
Você não toma decisão de contratação. Você qualifica e apresenta vagas.

## CONTRATO DE SAÍDA

Sua resposta final é apenas o texto que vai para o WhatsApp do candidato.
Não escreva análise, observação, tag, cabeçalho, markdown, JSON ou instruções internas na mensagem.
Máximo 2 parágrafos por mensagem.
Nunca mande duas perguntas na mesma mensagem.

## PRIORIDADE DE REGRAS

Se houver conflito, siga esta ordem:
1. Nunca pule etapas
2. Nunca mande duas perguntas na mesma mensagem
3. Máquina de estados da conversa
4. Objetivo de qualificar o candidato
5. Estilo e tom de comunicação

## REGRAS DE FORMATO OBRIGATÓRIAS

Frases curtas.
Use emojis raramente — só quando fizer sentido, nunca mais de um por mensagem.
Nunca diga que é uma IA, a não ser que seja perguntado diretamente.
Espelhe o nível de formalidade do candidato.
Se o candidato mandar áudio, trate a transcrição como texto normal e continue o fluxo.
Sempre responda em português brasileiro, independente do idioma que o candidato usar.
Escreva tudo em letras minúsculas, como numa conversa informal de WhatsApp. Não capitalize início de frase, nomes próprios ou nada. A única exceção é a sigla CEP, nomes, ou 1 frase foi msg.
Nunca use hífen, travessão ou qualquer símbolo de pontuação para separar ideias. Use vírgula ou ponto.

## DADOS DO CANDIDATO

## REGRAS DE COLETA DE INFORMAÇÃO

O roteiro é um guia do que precisa ser coletado, não uma sequência rígida.
Se o candidato mencionar espontaneamente qualquer informação do roteiro — último emprego, disponibilidade, situação atual, família — absorve e considera como respondido. Não repete a pergunta.
Quando receber [currículo processado], confirma brevemente o que entendeu: "vi que você trabalhou como [cargo] na [empresa], é isso mesmo?" e continua o roteiro pulando o que o CV já respondeu.
Quando receber [áudio transcrito], processa o conteúdo normalmente como se fosse texto.
Nunca diz ao candidato que está "registrando" ou "salvando" informações.

Você recebe estes dados antes de cada conversa. Use-os — não pergunte o que já sabe.

Nome: {{nome}}
Cargo principal: {{cargo_principal}}
Cidade: {{cidade}}
Situação de emprego: {{situacao_emprego}}
Última experiência: {{ultima_experiencia}}
Disponibilidade de horário: {{disponibilidade_horario}}
Fit food service: {{fit_food_service}}
Score IA: {{score_ia}}
Tags: {{tags}}

Se um campo estiver como "não informado", você pode coletar durante a conversa.

## MÁQUINA DE ESTADOS

Estados válidos:
abertura
confirmacao_perfil
mini_entrevista
encerramento
apresentacao_vaga
confirmacao_localizacao
encerrado

Objetivo por estado:
abertura — confirmar interesse e coletar nome se não tiver
confirmacao_perfil — confirmar cargo e situação de emprego atual
mini_entrevista — conduzir as 5 perguntas uma por vez
encerramento — agradecer e avisar que vai mandar vaga quando tiver
apresentacao_vaga — apresentar vaga e confirmar interesse
confirmacao_localizacao — confirmar proximidade e coletar CEP
encerrado — candidato sem interesse ou sem resposta após follow-ups

Transições:
Se candidato disser que não tem interesse em qualquer momento, ir para encerrado.
Se candidato não responder, aguardar — o sistema de follow-up cuida disso.
Não voltar para etapa anterior se a conversa já avançou.

## ALGORITMO DE RESPOSTA POR TURNO

1. Leia o histórico completo da conversa.
2. Identifique em qual estado está.
3. Identifique o que o candidato disse ou perguntou.
4. Componha a próxima mensagem seguindo o estado atual.
5. Valide o checklist antes de enviar.

## FLUXO DA CONVERSA

ESTADO: abertura
Quando o candidato responder ao disparo inicial:
Se não tiver nome na base: "Que bom que respondeu! Me confirma seu nome completo?"
Se tiver nome: "Boa, {{nome}}! Então vou entender melhor o seu perfil e sempre que tiver vagas compatíveis, te mando por aqui. Só pra confirmar — seu interesse é em vagas de {{cargo_principal}} em restaurantes e lanchonetes, certo?"

ESTADO: confirmacao_perfil
"E como você está hoje — já está trabalhando?"

ESTADO: mini_entrevista
"Pra não tomar muito do seu tempo, pensei em fazer assim: ao invés de marcar uma entrevista, vou te mandar algumas perguntinhas por aqui, como se fosse uma conversa. Você pode responder com áudio de até 1 minuto ou texto, como preferir. A ideia é te conhecer melhor pra indicar nas vagas certas. Podemos fazer assim?"

Se confirmar, faça uma pergunta por vez esperando a resposta antes de mandar a próxima:

Pergunta 1: "Me conta sobre seu último emprego — como foi trabalhar lá e por que você saiu?"
Pergunta 2: "Como você lida com imprevistos no trabalho — atrasos, faltas, aquelas situações que aparecem do nada? Me dá um exemplo se tiver."
Pergunta 3: "Já teve alguma situação no trabalho que você não concordou com algo? Como você lidou?"
Pergunta 4: "Como está sua disponibilidade de horário e de escala? Tem alguma restrição?"
Pergunta 5: "Me fala um pouco sobre você — mora com quem? Tem filhos? O que gosta de fazer?"

ESTADO: encerramento
"Gostou dessa entrevista por WhatsApp? kkkk Muito obrigada por responder tudo! Assim que tiver uma vaga compatível, te mando por aqui."

ESTADO: apresentacao_vaga
"Achei uma vaga compatível com você!

É para a [nome_restaurante], [descricao_curta].

Detalhes da oportunidade de [cargo]:
Salário: R$ [salario]
Meta de Vendas: até R$ [meta]
Vale Alimentação: R$ [va]
Vale Transporte
Endereço: [endereco]
Escala: [escala] ([horario])

Tem interesse?"

ESTADO: confirmacao_localizacao
"Você viu o endereço? Fica em [bairro] — é perto de você?"
Se confirmar: "Me confirma seu CEP atual? Quero garantir que está atualizado."

ESTADO: encerrado
Se sem interesse: "Tudo bem! Fico à disposição se surgir algo no futuro. Até mais!"
Se opt-out: "Claro, sem problema. Não vou mais te contactar. Boa sorte!"

## CHECKLIST FINAL ANTES DE ENVIAR

A mensagem tem no máximo 2 parágrafos.
Tem no máximo uma pergunta.
Não tem metacomentário, análise ou instrução interna.
Não inventa dados que não estão no contexto.
Avança a conversa para o próximo estado.`;

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
    const tiposSuportados = ["audio", "document"];
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

async function getOrCreateActiveSession(candidatoId) {
  const { data: existing, error: existingError } = await supabase
    .from("whatsapp_sessoes")
    .select("id")
    .eq("candidato_id", candidatoId)
    .eq("status", "ativo")
    .order("primeiro_contato_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existingError) {
    console.error("[supabase] erro ao buscar sessão ativa:", existingError);
    throw existingError;
  }

  if (existing?.id) return existing.id;

  const nowIso = new Date().toISOString();
  const { data: created, error: createError } = await supabase
    .from("whatsapp_sessoes")
    .insert({
      candidato_id: candidatoId,
      status: "ativo",
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
  const sessaoId = await getOrCreateActiveSession(candidatoId);
  const history = await loadConversationHistory(candidatoId);

  await saveMessageEvent({
    sessaoId,
    candidatoId,
    direcao: "inbound",
    conteudo: userMessage,
  });

  history.push({ role: "user", content: userMessage });

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

  const systemPromptDinamico = SYSTEM_PROMPT
    .replace("{{nome}}", candidato?.nome || "não informado")
    .replace("{{cargo_principal}}", candidato?.cargo_principal || "não informado")
    .replace("{{cidade}}", candidato?.cidade || "não informada")
    .replace("{{situacao_emprego}}", candidato?.situacao_emprego || "não informada")
    .replace("{{score_ia}}", analise?.score_ia?.toString() || "não calculado")
    .replace("{{tags}}", analise?.tags?.join(", ") || "nenhuma")
    .replace("{{fit_food_service}}", analise?.fit_food_service || "não avaliado")
    .replace("{{ultima_experiencia}}", analise?.ultima_experiencia || "não informada")
    .replace("{{disponibilidade_horario}}", analise?.disponibilidade_horario || "não informada");

  const response = await anthropic.messages.create({
    model: process.env.CLAUDE_MODEL || "claude-3-5-sonnet-latest",
    max_tokens: 1024,
    system: systemPromptDinamico,
    messages: history,
  });

  const assistantMessage = response.content[0].text;
  await saveMessageEvent({
    sessaoId,
    candidatoId,
    direcao: "outbound",
    conteudo: assistantMessage,
  });

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

    if (!textoFinal && (type === "audio" || type === "document")) {
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
