/**
 * Filtros de saída da Ana — bloqueia meta-raciocínio da IA e respostas vazias em fechamento social.
 */

const {
  respostaReprovaPorDistancia,
  MENSAGEM_INICIO_MINI_ENTREVISTA,
} = require("./interesse-detect");

function normalizarTextoRespostaCurta(s) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

const PADROES_META_RACIOCINIO = [
  /\bi should not respond\b/i,
  /\bi should not\b/i,
  /\baccording to my instructions\b/i,
  /\bno further response\b/i,
  /\bthe conversation has naturally ended\b/i,
  /\bsocial pleasantries\b/i,
  /\bsocial closing\b/i,
  /\bi(?:'|')ll remain silent\b/i,
  /\bno response needed\b/i,
  /\bhowever, since the system requires\b/i,
  /\bignore agradecimentos e fechamentos sociais\b/i,
  /\bmy instructions\b/i,
  /\bi will not respond\b/i,
  /\bthere(?:'|')s no new substantive content\b/i,
  /\bas this is just an acknowledgment\b/i,
  /^```/m,
  /^##\s/m,
];

const ETAPAS_ENCERRADAS = new Set([
  "encerramento",
  "encerramento_sem_interesse",
  "encerramento_distancia",
  "encerramento_qualificado",
  "aguardando_motivo_recusa",
]);

function isMetaRaciocinioAna(texto) {
  const msg = String(texto || "").trim();
  if (!msg) return false;
  if (PADROES_META_RACIOCINIO.some((re) => re.test(msg))) return true;

  // Texto predominantemente em inglês (raciocínio interno do modelo).
  const palavras = msg.match(/[a-zA-ZÀ-ÿ']+/g) || [];
  if (palavras.length >= 6) {
    const semAcentoPt = palavras.filter((p) => !/[áàâãéêíóôõúçÁÀÂÃÉÊÍÓÔÕÚÇ]/.test(p)).length;
    const inglesComum =
      palavras.filter((p) =>
        /^(the|and|should|would|this|that|have|been|with|from|not|respond|conversation|instructions|however|since|system|requires|output|something|needed|just|after|already|closed|appropriately|acknowledgment|emoji|social|pleasantries|closing|naturally|ended|further|remain|silent)$/i.test(
          p
        )
      ).length >= 2;
    if (semAcentoPt / palavras.length >= 0.85 && inglesComum) return true;
  }

  return false;
}

function isFechamentoSocialCandidato(texto) {
  const bruto = String(texto || "").trim();
  if (!bruto) return false;

  const t = normalizarTextoRespostaCurta(bruto);
  const soEmoji = bruto.replace(/[\s\u200d\uFE0F]/g, "").replace(/\p{Extended_Pictographic}/gu, "") === "";
  if (soEmoji && /\p{Extended_Pictographic}/u.test(bruto)) return true;

  if (t.length <= 40 && /^(obrigad[oa]|obg|vlw|valeu|beijos|abs|tmj|ok+|blz|beleza|show|certo|entendi|perfeito|otimo|ótimo)[!. ]*$/.test(t)) {
    return true;
  }

  if (
    t.length <= 60 &&
    /^(obrigad[oa]|muito obrigad[oa]|agradeço|agradeco).*(oportunidade|atencao|atenção|feedback)?[!. ]*$/.test(t)
  ) {
    return true;
  }

  return false;
}

function isEtapaEncerrada(etapaAtual) {
  const etapa = normalizarTextoRespostaCurta(etapaAtual || "");
  if (ETAPAS_ENCERRADAS.has(etapa)) return true;
  return etapa.startsWith("encerramento");
}

/**
 * @returns {string|null} Texto para WhatsApp ou null quando não deve enviar nada.
 */
function filtrarSaidaAna({ etapaAtual, userMessage, assistantMessage }) {
  const msg = String(assistantMessage || "").trim();

  if (!msg) return null;

  if (isMetaRaciocinioAna(msg)) {
    console.warn("[ana] meta-raciocínio bloqueado:", msg.slice(0, 100));
    return null;
  }

  if (!isEtapaEncerrada(etapaAtual) && respostaReprovaPorDistancia(msg)) {
    console.warn("[ana] reprovação por distância bloqueada (filtro global)");
    return MENSAGEM_INICIO_MINI_ENTREVISTA;
  }

  if (isEtapaEncerrada(etapaAtual) && isFechamentoSocialCandidato(userMessage)) {
    console.log("[ana] fechamento social após encerramento — sem resposta");
    return null;
  }

  return msg;
}

module.exports = {
  normalizarTextoRespostaCurta,
  isMetaRaciocinioAna,
  isFechamentoSocialCandidato,
  isEtapaEncerrada,
  filtrarSaidaAna,
};
