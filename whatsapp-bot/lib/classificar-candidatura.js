/**
 * Espelho mínimo do motor do CRM: grava candidaturas.status + espelha etapa-mãe na sessão.
 * Eventos: disparo_enviado | disparo_falha | primeira_resposta | interesse_confirmado | recusa
 */

const STATUS_INICIAL = "inscrito_aguardando_disparo";

async function getCortes(supabase) {
  try {
    const { data } = await supabase
      .from("crm_funil_config")
      .select("score_cv_min,score_entrevista_min")
      .eq("id", 1)
      .maybeSingle();
    return {
      score_cv_min: Number(data?.score_cv_min ?? 0),
      score_entrevista_min: Number(data?.score_entrevista_min ?? 0),
    };
  } catch {
    return { score_cv_min: 0, score_entrevista_min: 0 };
  }
}

function scoreOk(score, corte) {
  if (corte <= 0) return true;
  if (score == null || Number.isNaN(Number(score))) return false;
  return Number(score) >= corte;
}

function etapaMae(status) {
  if (!status) return null;
  const p = String(status).split("_")[0];
  if (["inscrito", "abordado", "qualificado", "encaminhado", "contratado"].includes(p)) return p;
  return null;
}

async function classificarCandidatura(supabase, { candidaturaId, evento, scoreCv, scoreEntrevista }) {
  if (!candidaturaId) return null;

  const { data: cand } = await supabase
    .from("candidaturas")
    .select("id,status")
    .eq("id", candidaturaId)
    .maybeSingle();
  if (!cand) return null;

  const atual = String(cand.status || STATUS_INICIAL);
  if (
    ["encaminhado_aguardando", "encaminhado_avancar", "encaminhado_reprovado", "contratado"].includes(
      atual
    )
  ) {
    return atual;
  }

  const cortes = await getCortes(supabase);
  let proximo = atual;

  switch (evento) {
    case "disparo_enviado":
      proximo = "abordado_sem_resposta";
      break;
    case "disparo_falha":
      proximo = "inscrito_falha";
      break;
    case "primeira_resposta":
      proximo = "abordado_em_conversa";
      break;
    case "interesse_confirmado": {
      const cvOk = scoreOk(scoreCv, cortes.score_cv_min);
      const entOk = scoreOk(scoreEntrevista, cortes.score_entrevista_min);
      proximo = cvOk && entOk ? "qualificado_avancar" : "abordado_avancar";
      break;
    }
    case "recusa":
      proximo = "abordado_negativa";
      break;
    default:
      return atual;
  }

  if (proximo === atual) return atual;

  const now = new Date().toISOString();
  await supabase
    .from("candidaturas")
    .update({ status: proximo, atualizado_em: now })
    .eq("id", candidaturaId);

  const etapa = etapaMae(proximo);
  if (etapa) {
    await supabase
      .from("whatsapp_sessoes")
      .update({ etapa_funil: etapa, atualizado_em: now })
      .eq("candidatura_id", candidaturaId);
  }

  return proximo;
}

module.exports = { classificarCandidatura, etapaMae };
