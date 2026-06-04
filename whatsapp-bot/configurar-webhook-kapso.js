/**
 * Registra/atualiza webhook Kapso v2 apontando para o Railway.
 *
 * Uso:
 *   node configurar-webhook-kapso.js
 *   node configurar-webhook-kapso.js --url https://gege-production.up.railway.app
 */
require("dotenv").config();
const axios = require("axios");

const args = process.argv.slice(2).reduce((acc, a) => {
  const [k, v] = a.replace(/^--/, "").split("=");
  acc[k] = v ?? true;
  return acc;
}, {});

const BASE_URL = (args.url || "https://gege-production.up.railway.app").replace(/\/$/, "");
const WEBHOOK_URL = `${BASE_URL}/webhook`;
const PHONE_ID = process.env.KAPSO_PHONE_NUMBER_ID;
const API_KEY = process.env.KAPSO_API_KEY;
async function main() {
  if (!API_KEY || !PHONE_ID) {
    console.error("❌ Defina KAPSO_API_KEY e KAPSO_PHONE_NUMBER_ID no .env");
    process.exit(1);
  }

  const platformUrl = `https://api.kapso.ai/platform/v1/whatsapp/phone_numbers/${PHONE_ID}/webhooks`;

  const body = {
    whatsapp_webhook: {
      kind: "kapso",
      url: WEBHOOK_URL,
      events: ["whatsapp.message.received"],
      active: true,
    },
  };

  console.log("POST", platformUrl);
  console.log("URL alvo:", WEBHOOK_URL);

  try {
    const resp = await axios.post(platformUrl, body, {
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": API_KEY,
      },
      timeout: 30000,
      validateStatus: () => true,
    });
    console.log("HTTP", resp.status);
    console.log(JSON.stringify(resp.data, null, 2));
    if (resp.status >= 400) {
      console.error("\n❌ Kapso rejeitou. Confira no painel: Integrate → WhatsApp webhooks.");
      process.exit(1);
    }
    console.log("\n✅ Webhook configurado. Rode: node verificar-integracao-kapso.js");
  } catch (e) {
    console.error("❌ Erro:", e.message);
    if (e.response?.data) console.error(JSON.stringify(e.response.data));
    console.error("\nConfigure manualmente no Kapso:");
    console.error("  URL:", WEBHOOK_URL);
    console.error("  Evento: whatsapp.message.received");
    process.exit(1);
  }
}

main();
