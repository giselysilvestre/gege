/**
 * disparo-tapi.js
 *
 * Script de disparo outbound do template abordagem_candidatura_gege.
 *
 * Uso (via Railway CLI pra pegar env vars do projeto):
 *   railway run node whatsapp-bot/disparo-tapi.js --vaga=<uuid> [--dry-run] [--limit=N]
 *
 * Flags:
 *   --dry-run  → lista candidatos que seriam disparados, sem enviar
 *   --limit=N  → limita a N candidatos (útil pra teste)
 */

require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const KAPSO_API_KEY = process.env.KAPSO_API_KEY;
const KAPSO_PHONE_NUMBER_ID = process.env.KAPSO_PHONE_NUMBER_ID;
const TEMPLATE_NAME = "abordagem_candidatura_gege";
const TEMPLATE_LANGUAGE = "pt_BR";

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("❌ Faltam env vars NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
if (!KAPSO_API_KEY || !KAPSO_PHONE_NUMBER_ID) {
  console.error("❌ Faltam env vars KAPSO_API_KEY / KAPSO_PHONE_NUMBER_ID");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const args = process.argv.slice(2).reduce((acc, arg) => {
  const [k, v] = arg.replace(/^--/, "").split("=");
  acc[k] = v === undefined ? true : v;
  return acc;
}, {});

const VAGA_ID = args.vaga;
const DRY_RUN = !!args["dry-run"];
const LIMIT = args.limit ? parseInt(args.limit, 10) : null;

if (!VAGA_ID) {
  console.error("❌ Faltou --vaga=<uuid>");
  process.exit(1);
}

function normalizeE164Digits(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 11) return `55${digits}`;
  if (digits.length === 13 && digits.startsWith("55")) return digits;
  return digits;
}

async function sendKapsoTemplate({ to, nome, cargo }) {
  const url = `https://api.kapso.ai/meta/whatsapp/${KAPSO_PHONE_NUMBER_ID}/messages`;
  const body = {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: TEMPLATE_NAME,
      language: { code: TEMPLATE_LANGUAGE },
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: nome },
            { type: "text", text: cargo },
          ],
        },
      ],
    },
  };
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${KAPSO_API_KEY}`,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(`Kapso erro ${res.status}: ${JSON.stringify(json)}`);
  }
  return json;
}

async function main() {
  console.log(`🚀 Disparo vaga ${VAGA_ID} ${DRY_RUN ? "(DRY RUN)" : ""}`);

  const { data: vaga, error: vagaErr } = await supabase
    .from("vagas")
    .select("id, cargo, status_vaga, cliente_id")
    .eq("id", VAGA_ID)
    .maybeSingle();

  if (vagaErr || !vaga) {
    console.error("❌ Vaga não encontrada", vagaErr);
    process.exit(1);
  }
  if (vaga.status_vaga !== "aberta") {
    console.error(`❌ Vaga não está aberta (status=${vaga.status_vaga})`);
    process.exit(1);
  }
  console.log(`✅ Vaga: ${vaga.cargo}`);

  const { data: candidaturas, error: candErr } = await supabase
    .from("candidaturas")
    .select(
      `id, candidato_id, score_compatibilidade,
       candidato:candidatos(id, nome, telefone, disponivel,
         analise:candidatos_analise(score_ia, fit_food_service))`
    )
    .eq("vaga_id", VAGA_ID)
    .eq("status", "novo");

  if (candErr) {
    console.error("❌ Erro ao buscar candidaturas:", candErr);
    process.exit(1);
  }

  console.log(`📋 ${candidaturas.length} candidaturas em status=novo`);

  const elegiveis = candidaturas.filter((c) => {
    const analiseRaw = c.candidato?.analise;
    const analise = Array.isArray(analiseRaw) ? analiseRaw[0] : analiseRaw;
    const telefone = c.candidato?.telefone;
    return (
      c.candidato?.disponivel === true &&
      telefone &&
      analise?.score_ia >= 75 &&
      analise?.fit_food_service === "Alto"
    );
  });
  console.log(`✅ ${elegiveis.length} elegíveis`);

  const candidatoIds = elegiveis.map((c) => c.candidato_id);
  let comSessaoAtiva = new Set();
  if (candidatoIds.length > 0) {
    const { data: sessoesAtivas, error: sessErr } = await supabase
      .from("whatsapp_sessoes")
      .select("candidato_id")
      .eq("status", "ativo")
      .in("candidato_id", candidatoIds);

    if (sessErr) {
      console.error("❌ Erro ao checar sessões ativas:", sessErr);
      process.exit(1);
    }
    comSessaoAtiva = new Set(sessoesAtivas.map((s) => s.candidato_id));
  }

  const paraDisparar = elegiveis.filter((c) => !comSessaoAtiva.has(c.candidato_id));
  const pulados = elegiveis.filter((c) => comSessaoAtiva.has(c.candidato_id));

  console.log(`✅ ${paraDisparar.length} para disparar`);
  console.log(`⏭️  ${pulados.length} pulados (já têm sessão ativa)`);

  const lista = LIMIT ? paraDisparar.slice(0, LIMIT) : paraDisparar;
  if (LIMIT) console.log(`🔢 Limit=${LIMIT}, disparando ${lista.length}`);

  if (DRY_RUN) {
    console.log("\n🔍 DRY RUN — lista que seria disparada:");
    lista.forEach((c) => {
      console.log(`   - ${c.candidato.nome} | ${c.candidato.telefone} | candidatura=${c.id}`);
    });
    process.exit(0);
  }

  const resultados = { ok: 0, erro: 0 };

  for (const c of lista) {
    const nome = c.candidato.nome;
    const telefoneE164 = normalizeE164Digits(c.candidato.telefone);
    if (!telefoneE164) {
      console.log(`⚠️  ${nome}: telefone inválido, pulando`);
      resultados.erro++;
      continue;
    }

    try {
      const nowIso = new Date().toISOString();
      const { data: sessao, error: sessaoErr } = await supabase
        .from("whatsapp_sessoes")
        .insert({
          candidato_id: c.candidato_id,
          candidatura_id: c.id,
          status: "ativo",
          tipo_fluxo: "candidatura",
          etapa_atual: "disparo_template",
          etapas_concluidas: [],
          primeiro_contato_at: nowIso,
          ultima_outbound_at: nowIso,
        })
        .select("id")
        .single();

      if (sessaoErr) throw sessaoErr;

      const primeiroNome = nome.split(" ")[0];
      const resp = await sendKapsoTemplate({
        to: telefoneE164,
        nome: primeiroNome,
        cargo: vaga.cargo,
      });

      console.log(`[kapso resp] ${nome}:`, JSON.stringify(resp).slice(0, 300));

      const kapsoMessageId =
        resp?.messages?.[0]?.id || resp?.message?.id || resp?.id || null;
      const kapsoSessionId =
        resp?.conversation?.id || resp?.session_id || resp?.conversation_id || null;

      if (kapsoSessionId) {
        await supabase
          .from("whatsapp_sessoes")
          .update({ kapso_session_id: kapsoSessionId })
          .eq("id", sessao.id);
      }

      await supabase.from("whatsapp_eventos").insert({
        sessao_id: sessao.id,
        candidato_id: c.candidato_id,
        direcao: "outbound",
        tipo_midia: "texto",
        tipo_mensagem: "template",
        etapa_roteiro: "disparo_template",
        conteudo: `[template:${TEMPLATE_NAME}] nome=${primeiroNome}, cargo=${vaga.cargo}`,
        processado_pela_ia: false,
        espera_resposta: true,
        kapso_message_id: kapsoMessageId,
        criado_em: nowIso,
      });

      resultados.ok++;
      console.log(`✅ ${nome} → ${telefoneE164}`);
    } catch (err) {
      resultados.erro++;
      console.error(`❌ ${nome}: ${err.message}`);
    }

    await new Promise((r) => setTimeout(r, 500));
  }

  console.log(`\n📊 Resumo: ${resultados.ok} ok, ${resultados.erro} erros`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Erro fatal:", err);
    process.exit(1);
  });
