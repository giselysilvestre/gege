/**
 * Verifica integração Kapso + Railway (health + webhook de teste).
 *
 * Uso:
 *   node verificar-integracao-kapso.js
 *   node verificar-integracao-kapso.js --url https://gege-production.up.railway.app
 */
require("dotenv").config();
const axios = require("axios");
const {
  MESSAGE_RECEIVED,
  extractKapsoInboundFromPayload,
} = require("./webhook-kapso");

const args = process.argv.slice(2).reduce((acc, a) => {
  const [k, v] = a.replace(/^--/, "").split("=");
  acc[k] = v ?? true;
  return acc;
}, {});

const BASE_URL = (args.url || "https://gege-production.up.railway.app").replace(/\/$/, "");
const PHONE_ID = process.env.KAPSO_PHONE_NUMBER_ID || "1200118206508050";
const TEST_FROM = "5521970269716";

async function main() {
  console.log("=== Verificação Kapso + Railway ===\n");
  console.log("Base URL:", BASE_URL);

  const envOk =
    process.env.KAPSO_API_KEY &&
    process.env.KAPSO_PHONE_NUMBER_ID &&
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.SUPABASE_SERVICE_ROLE_KEY;
  console.log(envOk ? "✅ Variáveis locais (.env) OK" : "⚠️  .env local incompleto (Railway pode ter no painel)");

  try {
    const health = await axios.get(`${BASE_URL}/health`, { timeout: 20000 });
    console.log(`✅ GET /health → ${health.status}`, JSON.stringify(health.data));
  } catch (e) {
    console.error("❌ GET /health FALHOU:", e.message);
    console.error("   → Railway provavelmente parado ou URL errada. Corrija antes do disparo em massa.");
    process.exit(1);
  }

  const payload = {
    type: MESSAGE_RECEIVED,
    message: {
      id: `verify-${Date.now()}`,
      type: "text",
      from: TEST_FROM,
      text: { body: "ping-verificacao-integracao" },
      kapso: { direction: "inbound", has_media: false },
    },
    conversation: {
      id: `verify-conv-${Date.now()}`,
      phone_number_id: PHONE_ID,
    },
    phone_number_id: PHONE_ID,
  };

  const dry = extractKapsoInboundFromPayload(payload);
  if (dry.skip) {
    console.error("❌ Payload de teste inválido no parser:", dry.reason);
    process.exit(1);
  }
  console.log("✅ Parser webhook-kapso OK no payload de teste");

  try {
    const wh = await axios.post(`${BASE_URL}/webhook`, payload, {
      timeout: 25000,
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Event": MESSAGE_RECEIVED,
        "X-Webhook-Payload-Version": "v2",
        "X-Idempotency-Key": `verify-${Date.now()}`,
      },
      validateStatus: () => true,
    });
    console.log(`✅ POST /webhook → HTTP ${wh.status}`, JSON.stringify(wh.data));
    if (wh.status >= 500) {
      console.error("❌ Servidor retornou erro — veja logs no Railway.");
      process.exit(1);
    }
  } catch (e) {
    console.error("❌ POST /webhook FALHOU:", e.message);
    console.error("   → Kapso não consegue entregar se isso falhar. Ajuste URL no painel Kapso.");
    process.exit(1);
  }

  console.log("\n✅ Integração básica OK.");
  console.log("No Kapso: WhatsApp webhooks → URL deve ser", `${BASE_URL}/webhook`);
  console.log("Evento: Message received | Status: Active (sem 'failed')");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
