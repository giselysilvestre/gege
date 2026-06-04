/**
 * Normalização de webhooks Kapso v2 (single + batch).
 * @see https://docs.kapso.ai/docs/platform/webhooks/event-types
 */

const MESSAGE_RECEIVED = "whatsapp.message.received";

function normalizeE164Digits(phone) {
  return String(phone || "").replace(/\D/g, "");
}

function getWebhookEventType(headers, body) {
  const h = headers?.["x-webhook-event"];
  return h || body?.type || body?.event || null;
}

function isMessageReceivedEvent(eventType) {
  return eventType === MESSAGE_RECEIVED;
}

/**
 * Expande body em 1+ payloads processáveis (suporta batch do Kapso).
 */
function expandKapsoWebhookBodies(headers, body) {
  const eventType = getWebhookEventType(headers, body);
  if (!isMessageReceivedEvent(eventType)) {
    return { eventType, items: [], skipReason: "wrong_event" };
  }

  if (body?.batch === true && Array.isArray(body?.data)) {
    const items = body.data.filter((item) => item?.message);
    return { eventType, items, skipReason: items.length ? null : "empty_batch" };
  }

  if (body?.message) {
    return { eventType, items: [body], skipReason: null };
  }

  return { eventType, items: [], skipReason: "no_message" };
}

/**
 * Extrai um inbound de um payload Kapso v2 (não-batch).
 */
function extractKapsoInboundFromPayload(payload) {
  const msg = payload?.message;
  if (!msg) return { skip: true, reason: "no_message" };

  const direction = String(msg.kapso?.direction || msg.direction || "").toLowerCase();
  if (direction && direction !== "inbound") {
    return { skip: true, reason: "not_inbound" };
  }

  const status = String(msg.kapso?.status || msg.status || "").toLowerCase();
  if (status === "sent" || status === "delivered" || status === "read") {
    return { skip: true, reason: "outbound_status" };
  }

  const conversationId = payload?.conversation?.id || null;
  const phoneNumberId =
    payload?.phone_number_id ||
    payload?.conversation?.phone_number_id ||
    null;
  const from = msg.from || payload?.conversation?.phone_number;

  if (msg.type === "text" && msg.text?.body) {
    const text = String(msg.text.body).trim();
    const to = normalizeE164Digits(from);
    if (!to || !text) return { skip: true, reason: "missing_fields" };
    return {
      skip: false,
      conversationId,
      to,
      text,
      phoneNumberId,
      messageId: msg.id || null,
    };
  }

  const tiposSuportados = ["audio", "document", "image"];
  if (tiposSuportados.includes(msg.type) && msg.kapso?.has_media) {
    const to = normalizeE164Digits(from);
    if (!to) return { skip: true, reason: "missing_from" };
    return {
      skip: false,
      conversationId,
      to,
      text: null,
      type: msg.type,
      msg,
      phoneNumberId,
      messageId: msg.id || null,
    };
  }

  return { skip: true, reason: "not_supported", messageType: msg.type };
}

function phoneNumberIdMatchesConfigured(inboundId, configuredId) {
  if (!configuredId) return true;
  if (!inboundId) return true;
  return String(inboundId) === String(configuredId);
}

module.exports = {
  MESSAGE_RECEIVED,
  normalizeE164Digits,
  getWebhookEventType,
  expandKapsoWebhookBodies,
  extractKapsoInboundFromPayload,
  phoneNumberIdMatchesConfigured,
};
