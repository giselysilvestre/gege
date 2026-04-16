const express = require("express");
const axios = require("axios");
const dotenv = require("dotenv");
const { createClient } = require("@supabase/supabase-js");
const Anthropic = require("@anthropic-ai/sdk");
dotenv.config();

const PORT = Number(process.env.PORT || 3333);
const KAPSO_API_KEY = process.env.KAPSO_API_KEY || "";
const KAPSO_PHONE_NUMBER_ID = process.env.KAPSO_PHONE_NUMBER_ID || "";
const KAPSO_SEND_URL = `https://api.kapso.ai/platform/v1/whatsapp/phone_numbers/${KAPSO_PHONE_NUMBER_ID}/messages`;

const MAX_HISTORY_MESSAGES = 20;

const app = express();
app.use(express.json({ limit: "2mb" }));

/** Dedupe de retries do Kapso via header X-Idempotency-Key */
const processedIdempotencyKeys = new Set();
const IDEMPOTENCY_CACHE_MAX = 5000;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || "",
});

const SYSTEM_PROMPT = `Você é a Gê, recrutadora virtual da Gegê – plataforma de recrutamento para food service.

Seu trabalho é conduzir o processo de triagem de candidatos via WhatsApp de forma amigável, direta e acolhedora. Frases curtas. Tom humano, nunca robótico. Nunca diga que é uma IA.

FLUXO DA CONVERSA – siga rigorosamente esta sequência:

ETAPA 1 – BOAS-VINDAS
Quando o candidato mandar qualquer mensagem inicial, responda:
"Oi! Tudo bem? Sou a Gê 🙂 Estou aqui para te ajudar com sua candidatura. Antes de continuar, me confirma: você tem interesse em trabalhar na área de alimentação/food service?"

ETAPA 2 – COLETA DE DADOS (um dado por vez)
Se confirmou interesse, colete em ordem:
1. Nome completo
2. CPF (diga que é só para identificação e fica guardado com segurança)
3. CEP
4. Escolaridade (ofereça opções: Ensino Médio completo, Ensino Médio incompleto, Superior completo, Superior incompleto)

ETAPA 3 – CURRÍCULO
Peça o currículo: "Agora me manda seu currículo? Pode ser PDF, Word ou foto. Se não tiver, me conta seu último emprego e o que você fazia lá."

ETAPA 4 – SCREENING
Faça as perguntas uma a uma:
1. Situação atual: empregado, desempregado ou em período de experiência?
2. Quando poderia começar: imediatamente, em 1 semana, em 2 semanas ou mais?
3. Tem disponibilidade para trabalhar em escala 6x1?

ETAPA 5 – ENCERRAMENTO
Após coletar tudo, diga:
"Perfeito! Recebi tudo. Vou analisar seu perfil e, se houver uma vaga compatível, entro em contato em breve. Fique de olho aqui no WhatsApp! 🙂"

REGRAS IMPORTANTES:
- Nunca pule etapas
- Se o candidato mandar algo fora do contexto, reconheça brevemente e volte para a pergunta pendente
- Se o candidato não quiser continuar, agradeça e encerre com gentileza
- Máximo 2 parágrafos por mensagem
- Use emojis com moderação`;

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
    return { skip: true, reason: "not_text" };
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

async function loadConversationHistory(conversationId) {
  const { data, error } = await supabase
    .from("conversation_history")
    .select("messages")
    .eq("conversation_id", conversationId)
    .maybeSingle();

  if (error) {
    console.error("[supabase] erro ao carregar histórico:", error);
    return [];
  }

  const raw = data?.messages;
  if (!Array.isArray(raw)) return [];

  return raw.filter(
    (m) =>
      m &&
      (m.role === "user" || m.role === "assistant") &&
      typeof m.content === "string"
  );
}

async function saveConversationHistory(conversationId, messages) {
  const { error } = await supabase.from("conversation_history").upsert(
    {
      conversation_id: conversationId,
      messages,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "conversation_id" }
  );

  if (error) {
    console.error("[supabase] erro ao salvar histórico:", error);
    throw error;
  }
}

async function sendWhatsAppMessage(toDigits, message) {
  if (!KAPSO_API_KEY || !KAPSO_PHONE_NUMBER_ID) {
    console.error("[kapso] KAPSO_API_KEY ou KAPSO_PHONE_NUMBER_ID não configurados");
    return;
  }

  try {
    await axios.post(
      KAPSO_SEND_URL,
      {
        to: toDigits,
        type: "text",
        text: { body: message },
      },
      {
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": KAPSO_API_KEY,
        },
      }
    );
    console.log(`[kapso] mensagem enviada para ${toDigits}`);
  } catch (err) {
    console.error("[kapso] erro ao enviar:", JSON.stringify(err?.response?.data, null, 2) || err?.message);
  }
}

async function getGeResponse(conversationId, userMessage) {
  const history = await loadConversationHistory(conversationId);

  history.push({ role: "user", content: userMessage });

  const response = await anthropic.messages.create({
    model: process.env.CLAUDE_MODEL || "claude-3-5-sonnet-latest",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: history,
  });

  const assistantMessage = response.content[0].text;

  history.push({ role: "assistant", content: assistantMessage });

  if (history.length > MAX_HISTORY_MESSAGES) {
    history.splice(0, history.length - MAX_HISTORY_MESSAGES);
  }

  await saveConversationHistory(conversationId, history);

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
  console.log("[webhook] payload recebido:", JSON.stringify(req.body, null, 2));
  try {
    if (!consumeIdempotencyKey(req, res)) return;

    const extracted = extractKapsoInbound(req);
    if (extracted.skip) {
      return res.status(200).json({ ok: true, skipped: extracted.reason });
    }

    const { conversationId, to, text, phoneNumberId } = extracted;

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

    const resposta = await getGeResponse(conversationId, text);

    console.log(`[webhook] resposta da Gê: ${resposta}`);

    await sendWhatsAppMessage(to, resposta);

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("[webhook] erro:", error);
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
});

app.listen(PORT, () => {
  console.log(`[whatsapp-bot] rodando em http://localhost:${PORT}`);
  console.log("[whatsapp-bot] webhook em POST /webhook (Kapso v2)");
});
