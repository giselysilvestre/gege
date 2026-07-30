/**
 * Detecção de interesse/recusa e viabilidade de deslocamento (confirma_endereco).
 */

const LIMITE_MINUTOS_DESLOCAMENTO = 120; // 2 horas

function normalizarTextoRespostaCurta(s) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Resposta afirmativa à pergunta "tem interesse pela vaga?" */
function detectaSimInteresseVaga(texto) {
  const t = normalizarTextoRespostaCurta(texto);
  if (!t) return false;
  if (detectaNaoInteresseVaga(texto)) return false;

  if (
    /\b(nao tenho interesse|não tenho interesse|sem interesse|nao quero|não quero|infelizmente nao|infelizmente não|nao me interess|não me interess)\b/.test(
      t
    )
  ) {
    return false;
  }

  // Padrões fortes em qualquer parte da mensagem
  if (
    /\b(tenho sim|tenho interesse|to interessad|estou interessad|tô interessad|quero sim|aceito|com certeza|manda ai|manda aí|me conta|pode contar|bora|fechado|topo|pode sim|claro que sim|com interesse)\b/.test(
      t
    )
  ) {
    return true;
  }

  // Afirmativas no início
  if (
    /^(sim|s|ok|pode|quero|show|beleza|uhum|claro|certo|isso|otimo|ótimo|blz|dale|vamos|manda)\b/.test(
      t
    )
  ) {
    return true;
  }

  // "sim" após cumprimento: "olá, sim", "boa noite tenho sim"
  if (
    /(?:^|(?:oi|ola|olá|oie|boa tarde|boa noite|bom dia|hey|e ai|e aí)[,!.\s]*).*\bsim\b/.test(
      t
    )
  ) {
    return true;
  }

  if (/^\s*sim[\s,.\-!]/.test(t)) return true;

  // Pergunta sobre detalhes da vaga = interesse (não é recusa)
  if (
    /\b(salario|salário|horario|horário|beneficio|benefício|vale|escala|detalhe|onde fica|endereco|endereço|liquido|líquido|local|funcao|função)\b/.test(
      t
    ) &&
    !/\b(nao|não|sem interesse)\b/.test(t)
  ) {
    return true;
  }

  // Resposta curta positiva com emoji
  if (/^👍|^✅|^🙏/.test(t.trim())) return true;

  return false;
}

/** Resposta negativa explícita */
function detectaNaoInteresseVaga(texto) {
  const t = normalizarTextoRespostaCurta(texto);
  if (!t) return false;

  if (
    /\b(nao tenho interesse|não tenho interesse|sem interesse|nao quero|não quero|nao me interess|não me interess|infelizmente nao|infelizmente não|passo$|desisto|nao obrigad|não obrigad|agradeco mas|agradeço mas)\b/.test(
      t
    )
  ) {
    return true;
  }

  return (
    /^(não|nao)(\s*[,.]|$)|^n(\s*[,.]|$)|^prefiro não|^prefiro nao|^obrigad[oa].*\bn(ão|ao)\b/.test(
      t
    )
  );
}

/** Extrai tempo de deslocamento em minutos a partir do texto do candidato. null = não informado. */
function extrairMinutosDeslocamento(texto) {
  const t = normalizarTextoRespostaCurta(texto);
  if (!t) return null;

  const hmSlash = t.match(/(\d+)\s*h\s*(\d{1,2})(?:\s*\/\s*\d+\s*h\s*\d{1,2})?/);
  if (hmSlash) {
    return parseInt(hmSlash[1], 10) * 60 + parseInt(hmSlash[2] || "0", 10);
  }

  const hm = t.match(/(\d+)\s*h(?:oras?)?\s*(\d{1,2})?\b/);
  if (hm) {
    return parseInt(hm[1], 10) * 60 + parseInt(hm[2] || "0", 10);
  }

  const horasEMeia = t.match(/(\d+)\s*horas?\s*(?:e\s*)?(?:meia|30\s*min)/);
  if (horasEMeia) {
    return parseInt(horasEMeia[1], 10) * 60 + 30;
  }

  const soHoras = t.match(/(\d+)\s*horas?\b/);
  if (soHoras) {
    return parseInt(soHoras[1], 10) * 60;
  }

  const min = t.match(/(\d+)\s*min(?:utos?)?\b/);
  if (min) {
    return parseInt(min[1], 10);
  }

  // "1:30", "1.30" como hora:minuto
  const colon = t.match(/\b(\d{1,2})[:.](\d{2})\b/);
  if (colon) {
    return parseInt(colon[1], 10) * 60 + parseInt(colon[2], 10);
  }

  return null;
}

function deslocamentoViavel(minutos) {
  if (minutos == null) return null;
  return minutos <= LIMITE_MINUTOS_DESLOCAMENTO;
}

/** Ana NUNCA reprova candidato por distância no discurso — detecta texto proibido. */
function respostaReprovaPorDistancia(assistantMessage) {
  const msg = normalizarTextoRespostaCurta(assistantMessage);
  return /inviavel|fica distante|nao encaixa|manter no banco|oportunidades mais proxim|nao seria viavel|vaga fica longe|muito longe|pela distancia|nao daria pra chegar|nao consigo ir ate|fica inviavel|longe demais|distancia nao|distância não|essa vaga fica inviavel/.test(
    msg
  );
}

/** @deprecated use respostaReprovaPorDistancia — mantido p/ testes legados */
function respostaRejeitaDistanciaIndevida(_userMessage, assistantMessage) {
  return respostaReprovaPorDistancia(assistantMessage);
}

/** Candidato respondeu endereço/tempo na etapa confirma_endereco (sem depender do parse de minutos). */
function candidatoRespondeuEndereco(texto) {
  const t = normalizarTextoRespostaCurta(texto);
  if (!t || t.length < 8) return false;
  return /\b(moro|moradia|bairro|cidade|regiao|minutos|minuto|chegar|deslocamento|de casa|daqui|leva|demora|transporte|onibus|metro|linha|km\b|quilometr)\b/.test(
    t
  );
}

/** Após confirma_endereco, segue entrevista — distância nunca barra no funil. */
function deveAvancarParaMiniEntrevista(userMessage) {
  const min = extrairMinutosDeslocamento(userMessage);
  if (min != null) return true;
  return candidatoRespondeuEndereco(userMessage);
}

const MENSAGEM_INICIO_MINI_ENTREVISTA =
  "show! então vou te fazer algumas perguntas rápidas, pode ser por áudio ou texto. pode ser?";

module.exports = {
  LIMITE_MINUTOS_DESLOCAMENTO,
  normalizarTextoRespostaCurta,
  detectaSimInteresseVaga,
  detectaNaoInteresseVaga,
  extrairMinutosDeslocamento,
  deslocamentoViavel,
  respostaReprovaPorDistancia,
  respostaRejeitaDistanciaIndevida,
  candidatoRespondeuEndereco,
  deveAvancarParaMiniEntrevista,
  MENSAGEM_INICIO_MINI_ENTREVISTA,
};
