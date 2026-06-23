/**
 * disparo-tapi.js
 *
 * Script de disparo outbound do template aprovado abordagem_candidatura_gege (pt_BR).
 * Corpo do template (variáveis {{nome}} e {{cargo}}):
 *   oiee {{nome}}, tudo bem?
 *   Eu sou a Ana, cuido de nossas oportunidades de emprego. Encontrei o seu currículo
 *   e gostei muito do seu perfil 😊.
 *   Queria conversar sobre uma oportunidade de {{cargo}}. Posso te contar mais?
 *
 * Uso (via Railway CLI pra pegar env vars do projeto):
 *   railway run node whatsapp-bot/disparo-tapi.js --vaga=<uuid> [opções]
 *
 * Piloto com candidatos reais (recomendado):
 *   1) --dry-run → vê quem entra (nome, telefone, id da candidatura)
 *   2) dispara 1 pessoa: --limit=1 OU --candidatura=<uuid> OU --candidato=<uuid>
 *
 * Flags:
 *   --dry-run       → lista candidatos que seriam disparados, sem enviar
 *   --limit=N       → no máximo N pessoas (ordem = resultado da query)
 *   --candidatura=  → só essa candidatura (precisa ser elegível)
 *   --candidato=    → só esse candidato_id (precisa ser elegível p/ essa vaga)
 *   --status=inscrito_aguardando_disparo|inscrito|novo|any  → padrão inscrito_aguardando_disparo; aliases inscrito/novo; use any para ignorar status
 *   --score-min=N      → nota mínima em score_ia (padrão 75)
 *   --fit=Alto|Médio|Baixo|any  → fit exigido (padrão Alto)
 *   --ignorar-disponivel → não exige candidato.disponivel=true
 *
 * Feedbacks de reprovação (templates v2): ver feedback-reprovacao.js
 *   reprovado_distancia / reprovado_desistencia / reprovado_horario → imediato (CRM /acoes reprovar)
 *   reprovado_score → agendado 48h após encerramento da entrevista (whatsapp_mensagens_agendadas)
 */

require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");
const axios = require("axios");

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
const CANDIDATURA_ID = args.candidatura || null;
const CANDIDATO_ID = args.candidato || null;
const STATUS_FILTER_DEFAULT = "inscrito_aguardando_disparo";
const LEGACY_STATUS_ALIASES = {
  novo: STATUS_FILTER_DEFAULT,
  inscrito: STATUS_FILTER_DEFAULT,
};
const STATUS_FILTER_RAW = (args.status || STATUS_FILTER_DEFAULT).toLowerCase();
const STATUS_FILTER = LEGACY_STATUS_ALIASES[STATUS_FILTER_RAW] ?? STATUS_FILTER_RAW;
const SCORE_MIN = args["score-min"] ? Number(args["score-min"]) : 75;
const FIT_FILTER_RAW = args.fit || "Alto";
const FIT_FILTER = String(FIT_FILTER_RAW).toLowerCase();
const IGNORAR_DISPONIVEL = !!args["ignorar-disponivel"];

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
  // URL exata: /meta/whatsapp/v24.0/{phoneNumberId}/messages
  const url = `https://api.kapso.ai/meta/whatsapp/v24.0/${KAPSO_PHONE_NUMBER_ID}/messages`;
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

  console.log("[kapso] POST:", url);
  console.log("[kapso] body:", JSON.stringify(body));

  try {
    const response = await axios.post(url, body, {
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": KAPSO_API_KEY,
      },
    });
    return response.data;
  } catch (err) {
    const status = err?.response?.status;
    const data = err?.response?.data;
    throw new Error(`Kapso erro ${status}: ${JSON.stringify(data)}`);
  }
}

async function main() {
  console.log(`🚀 Disparo vaga ${VAGA_ID} ${DRY_RUN ? "(DRY RUN)" : ""}`);

  const { data: vaga, error: vagaErr } = await supabase
    .from("vagas")
    .select("id, cargo, titulo_publicacao, status_vaga, cliente_id")
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
  const cargoTemplate = (vaga.titulo_publicacao || vaga.cargo || "vaga").trim();
  console.log(`✅ Vaga: ${cargoTemplate}`);

  const candidaturaSelect =
    `id, candidato_id, score_compatibilidade, status,
     candidato:candidatos(id, nome, telefone, disponivel,
       analise:candidatos_analise(score_ia, score_final, fit_food_service))`;

  let candidaturas = [];

  if (CANDIDATURA_ID) {
    const { data, error: candErr } = await supabase
      .from("candidaturas")
      .select(candidaturaSelect)
      .eq("id", CANDIDATURA_ID)
      .eq("vaga_id", VAGA_ID)
      .maybeSingle();
    if (candErr) {
      console.error("❌ Erro ao buscar candidatura:", candErr);
      process.exit(1);
    }
    candidaturas = data ? [data] : [];
  } else if (CANDIDATO_ID) {
    let q = supabase
      .from("candidaturas")
      .select(candidaturaSelect)
      .eq("vaga_id", VAGA_ID)
      .eq("candidato_id", CANDIDATO_ID);
    if (STATUS_FILTER !== "any") q = q.eq("status", STATUS_FILTER);
    const { data, error: candErr } = await q;
    if (candErr) {
      console.error("❌ Erro ao buscar candidatura:", candErr);
      process.exit(1);
    }
    candidaturas = data || [];
  } else {
    let page = 0;
    const pageSize = 1000;
    while (true) {
      let q = supabase
        .from("candidaturas")
        .select(candidaturaSelect)
        .eq("vaga_id", VAGA_ID)
        .range(page * pageSize, (page + 1) * pageSize - 1);
      if (STATUS_FILTER !== "any") q = q.eq("status", STATUS_FILTER);
      const { data, error: candErr } = await q;
      if (candErr) {
        console.error("❌ Erro ao buscar candidaturas:", candErr);
        process.exit(1);
      }
      if (!data?.length) break;
      candidaturas.push(...data);
      if (data.length < pageSize) break;
      page += 1;
    }
  }

  console.log(
    `📋 ${candidaturas.length} candidaturas (${STATUS_FILTER === "any" ? "todos os status" : `status=${STATUS_FILTER}`})`
  );

  const elegiveis = candidaturas.filter((c) => {
    const analiseRaw = c.candidato?.analise;
    const analise = Array.isArray(analiseRaw) ? analiseRaw[0] : analiseRaw;
    const telefone = c.candidato?.telefone;
    const notaConsiderada = Number(analise?.score_final ?? analise?.score_ia);
    const disponivel = c.candidato?.disponivel === true;
    return (
      (IGNORAR_DISPONIVEL || disponivel) &&
      telefone &&
      Number.isFinite(notaConsiderada) &&
      notaConsiderada >= SCORE_MIN &&
      (FIT_FILTER === "any" ||
        String(analise?.fit_food_service || "")
          .toLowerCase()
          .trim() === FIT_FILTER)
    );
  });
  console.log(
    `✅ ${elegiveis.length} elegíveis (nota>=${SCORE_MIN}${FIT_FILTER === "any" ? "" : `, fit=${FIT_FILTER_RAW}`}${IGNORAR_DISPONIVEL ? ", ignorando disponivel" : ""})`
  );

  const candidatoIds = elegiveis.map((c) => c.candidato_id);
  let comSessaoAtiva = new Set();
  if (candidatoIds.length > 0) {
    const idsToCheck = CANDIDATO_ID ? [CANDIDATO_ID] : candidatoIds;
    const CHUNK = 80;
    for (let i = 0; i < idsToCheck.length; i += CHUNK) {
      const chunk = idsToCheck.slice(i, i + CHUNK);
      const { data: sessoesAtivas, error: sessErr } = await supabase
        .from("whatsapp_sessoes")
        .select("candidato_id")
        .eq("status", "ativo")
        .in("candidato_id", chunk);

      if (sessErr) {
        console.error("❌ Erro ao checar sessões ativas:", sessErr);
        process.exit(1);
      }
      for (const s of sessoesAtivas || []) comSessaoAtiva.add(s.candidato_id);
    }
  }

  const paraDisparar = elegiveis.filter((c) => !comSessaoAtiva.has(c.candidato_id));
  const pulados = elegiveis.filter((c) => comSessaoAtiva.has(c.candidato_id));

  console.log(`✅ ${paraDisparar.length} para disparar`);
  console.log(`⏭️  ${pulados.length} pulados (já têm sessão ativa)`);

  let lista = paraDisparar;
  if (CANDIDATURA_ID) {
    lista = paraDisparar.filter((c) => c.id === CANDIDATURA_ID);
    console.log(`🎯 Filtrado por --candidatura=${CANDIDATURA_ID}: ${lista.length} resultado(s)`);
    if (lista.length === 0) {
      console.error("❌ Nenhuma candidatura bateu com o id (pode estar fora dos critérios de elegibilidade)");
      process.exit(1);
    }
  }
  if (CANDIDATO_ID) {
    lista = lista.filter((c) => c.candidato_id === CANDIDATO_ID);
    console.log(`🎯 Filtrado por --candidato=${CANDIDATO_ID}: ${lista.length} resultado(s)`);
    if (lista.length === 0) {
      console.error(
        "❌ Nenhum candidato elegível com esse id para esta vaga (filtros de status/score/fit/telefone/sessão ativa)"
      );
      process.exit(1);
    }
  }
  if (LIMIT) {
    lista = lista.slice(0, LIMIT);
    console.log(`🔢 Limit=${LIMIT}, disparando ${lista.length}`);
  }

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
        cargo: cargoTemplate,
      });

      console.log(`[kapso resp] ${nome}:`, JSON.stringify(resp).slice(0, 300));

      const kapsoMessageId =
        resp?.messages?.[0]?.id || resp?.message?.id || resp?.id || null;
      const kapsoSessionId =
        resp?.conversation?.id ||
        resp?.conversation_id ||
        resp?.session_id ||
        resp?.kapso?.conversation_id ||
        null;

      if (kapsoSessionId) {
        await supabase
          .from("whatsapp_sessoes")
          .update({ kapso_session_id: kapsoSessionId })
          .eq("id", sessao.id);
      } else {
        console.warn(
          `[disparo] ${nome}: resposta Kapso sem conversation.id — o vínculo será feito no primeiro inbound`
        );
      }

      await supabase.from("whatsapp_eventos").insert({
        sessao_id: sessao.id,
        candidato_id: c.candidato_id,
        direcao: "outbound",
        tipo_midia: "texto",
        tipo_mensagem: "template",
        etapa_roteiro: "disparo_template",
        conteudo: `[template:${TEMPLATE_NAME}] oiee ${primeiroNome}, tudo bem? ... oportunidade de ${cargoTemplate}. Posso te contar mais?`,
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
