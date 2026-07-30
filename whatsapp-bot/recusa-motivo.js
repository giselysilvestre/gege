/**
 * Detecção de recusa e motivo explícito (coleta de motivo de recusa).
 */

function normalizarTexto(s) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Etapas do BD onde o candidato pode recusar a vaga / fluxo */
const ETAPAS_PODE_RECUSAR = new Set([
  "apresentacao_vaga",
  "confirma_endereco",
  "abertura",
  "confirmacao_perfil",
  "mini_entrevista",
]);

const MSG_PEDIR_MOTIVO_RECUSA =
  "tudo bem! antes de ir, você consegue me dizer o motivo? vai me ajudar muito a melhorar 😊";
const MSG_OBRIGADA_FEEDBACK = "obrigada pelo feedback! boa sorte 🙂";
const MSG_ENCERRAR_SEM_MOTIVO = "tudo bem! boa sorte 🙂";
const MSG_ENCERRAMENTO_DISTANCIA =
  "entendi, essa vaga fica inviável pela distância. vou te manter no banco pra oportunidades mais próximas de você, combinado?";
const MSG_ENCERRAMENTO_HORARIO =
  "entendi, a escala dessa vaga não bate com o que você precisa. vou te manter no banco pra quando aparecer algo no seu horário, combinado?";
const MSG_ENCERRAMENTO_SEM_INTERESSE =
  "tudo bem! fico à disposição se surgir algo no futuro. boa sorte 🙂";

function detectaNaoInteresseVaga(texto) {
  const t = normalizarTexto(texto);
  if (!t) return false;
  if (/sei\b|talvez|duvid|pergunta|\?/.test(t)) return false;
  return (
    /^(não|nao)(\s*[,.]|$)|^n(\s*[,.]|$)|^não quero|^nao quero|^sem interesse|^não tenho interesse|^nao tenho interesse|^prefiro não|^prefiro nao|^passo$|^desisto|^obrigad[oa].*\bn(ão|ao)\b/.test(
      t
    )
  );
}

/** Recusa curta sem explicar motivo (ex.: só "não", "não quero") */
function recusaCurtaSemMotivo(texto) {
  const t = normalizarTexto(texto);
  if (!detectaNaoInteresseVaga(texto)) return false;
  return t.length <= 35 && !detectaMotivoExplicitoRecusa(texto);
}

/**
 * @returns {'distancia'|'horario'|'emprego'|null}
 */
function detectaMotivoExplicitoRecusa(texto) {
  const t = normalizarTexto(texto);
  if (!t) return null;

  if (
    /\b(longe|distancia|distante|km\b|inviavel|nao consigo ir|muito longe|fica longe|muito distante)\b/.test(
      t
    )
  ) {
    return "distancia";
  }
  if (
    /\b(horario|escala|turno|manha|tarde|noite|madrugada|fds|fim de semana)\b/.test(t) &&
    /\b(nao posso|nao da|nao consigo|incompativel|nao bate|conflito)\b/.test(t)
  ) {
    return "horario";
  }
  if (/\b(horario|escala)\b/.test(t) && /\b(nao serve|nao rola|impossivel)\b/.test(t)) {
    return "horario";
  }
  if (/\b(ja tenho emprego|ja trabalho|to empregad|estou empregad|trabalho fixo)\b/.test(t)) {
    return "emprego";
  }
  if (/\b(nao posso|nao consigo)\b/.test(t) && /\b(horario|escala)\b/.test(t)) {
    return "horario";
  }

  return null;
}

function detectaIgnorarOuNovaRecusa(texto) {
  const t = normalizarTexto(texto);
  if (!t) return true;
  if (detectaNaoInteresseVaga(texto)) return true;
  return /^(nao sei|não sei|sei la|seila|tanto faz|nao quero|não quero|passo|desisto)\b/.test(t);
}

/**
 * Processa turno de recusa / coleta de motivo.
 * @returns {null | { updates: object, resposta: string, feedbackTipo?: string, skipClaude: boolean }}
 */
function processarFluxoRecusa(etapaAtual, userMessage) {
  const etapa = etapaAtual || "";

  if (etapa === "aguardando_motivo_recusa") {
    if (detectaIgnorarOuNovaRecusa(userMessage)) {
      return {
        updates: { etapa_atual: "encerramento", status: "encerrado" },
        resposta: MSG_ENCERRAR_SEM_MOTIVO,
        skipClaude: true,
      };
    }
    return {
      updates: {
        etapa_atual: "encerramento",
        status: "encerrado",
        motivo_recusa: String(userMessage || "").trim().slice(0, 2000),
      },
      resposta: MSG_OBRIGADA_FEEDBACK,
      skipClaude: true,
    };
  }

  if (!ETAPAS_PODE_RECUSAR.has(etapa)) {
    return null;
  }

  const motivo = detectaMotivoExplicitoRecusa(userMessage);
  if (motivo === "distancia") {
    return {
      updates: { etapa_atual: "encerramento", status: "encerrado" },
      resposta: MSG_ENCERRAMENTO_SEM_INTERESSE,
      feedbackTipo: "reprovado_desistencia",
      skipClaude: true,
    };
  }
  if (motivo === "horario") {
    return {
      updates: { etapa_atual: "encerramento", status: "encerrado" },
      resposta: MSG_ENCERRAMENTO_HORARIO,
      feedbackTipo: "reprovado_horario",
      skipClaude: true,
    };
  }
  if (motivo === "emprego") {
    return {
      updates: { etapa_atual: "encerramento", status: "encerrado" },
      resposta: MSG_ENCERRAMENTO_SEM_INTERESSE,
      feedbackTipo: "reprovado_desistencia",
      skipClaude: true,
    };
  }

  if (!detectaNaoInteresseVaga(userMessage)) {
    return null;
  }

  if (recusaCurtaSemMotivo(userMessage)) {
    return {
      updates: { etapa_atual: "aguardando_motivo_recusa" },
      resposta: MSG_PEDIR_MOTIVO_RECUSA,
      skipClaude: true,
    };
  }

  return {
    updates: { etapa_atual: "encerramento", status: "encerrado" },
    resposta: MSG_ENCERRAMENTO_SEM_INTERESSE,
    feedbackTipo: "reprovado_desistencia",
    skipClaude: true,
  };
}

module.exports = {
  ETAPAS_PODE_RECUSAR,
  detectaNaoInteresseVaga,
  detectaMotivoExplicitoRecusa,
  recusaCurtaSemMotivo,
  processarFluxoRecusa,
  MSG_PEDIR_MOTIVO_RECUSA,
};
