/**
 * Evita a Ana processar eco de mensagens enviadas pelo CRM ou pelo próprio bot.
 */
const { createClient } = require("@supabase/supabase-js");
const WebSocket = require("ws");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { transport: WebSocket },
  }
);

function normalizeText(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

/**
 * Kapso às vezes reenvia o ID da mensagem que nós mesmos mandamos.
 */
async function isKnownOutboundKapsoMessageId(messageId) {
  if (!messageId) return false;
  const { data, error } = await supabase
    .from("whatsapp_eventos")
    .select("id")
    .eq("kapso_message_id", String(messageId))
    .eq("direcao", "outbound")
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("[inbound-guards] erro kapso_message_id:", error.message);
    return false;
  }
  return Boolean(data);
}

/**
 * Texto igual a envio manual/agendado recente do CRM (mesmo número da Ana).
 */
async function isEchoOfRecentCrmOutbound(candidatoId, text) {
  if (!candidatoId || !text) return false;
  const since = new Date(Date.now() - 3 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("whatsapp_eventos")
    .select("conteudo,tipo_mensagem")
    .eq("candidato_id", candidatoId)
    .eq("direcao", "outbound")
    .gte("criado_em", since)
    .order("criado_em", { ascending: false })
    .limit(8);

  if (error) {
    console.error("[inbound-guards] erro echo CRM:", error.message);
    return false;
  }

  const norm = normalizeText(text);
  const tiposCrm = new Set(["manual_crm", "texto_agendado_crm", "texto_manual"]);

  for (const row of data ?? []) {
    const tipo = String(row.tipo_mensagem || "");
    if (!tiposCrm.has(tipo)) continue;
    if (normalizeText(row.conteudo) === norm) return true;
  }
  return false;
}

module.exports = {
  isKnownOutboundKapsoMessageId,
  isEchoOfRecentCrmOutbound,
};
