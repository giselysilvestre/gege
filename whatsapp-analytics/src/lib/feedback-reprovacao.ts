/**
 * Templates v2 (espelho de whatsapp-bot/feedback-reprovacao.js) para disparo pelo CRM.
 */

export const FEEDBACK_TIMING_MS = {
  reprovado_distancia: 0,
  reprovado_desistencia: 0,
  reprovado_horario: 0,
  reprovado_score: 48 * 60 * 60 * 1000,
} as const;

export const MOTIVO_PARA_TEMPLATE: Record<string, keyof typeof FEEDBACK_TIMING_MS> = {
  distancia: "reprovado_distancia",
  desistiu: "reprovado_desistencia",
  horario: "reprovado_horario",
  score_entrevista: "reprovado_score",
  eliminatorio: "reprovado_score",
};

const TEMPLATES: Record<keyof typeof FEEDBACK_TIMING_MS, string> = {
  reprovado_distancia:
    "oi {{nome}}! infelizmente essa vaga ficou distante pra você. mas seu perfil continua no nosso banco e, quando aparecer algo mais perto, a gente te avisa. obrigada por responder tudo!",
  reprovado_desistencia:
    "oi {{nome}}, tudo bem? vi que você não seguiu com a gente dessa vez, sem problema! se mudar de ideia ou surgir outra vaga, é só mandar mensagem 😊",
  reprovado_horario:
    "oi {{nome}}! infelizmente a escala dessa vaga não bate com sua disponibilidade. vou te manter no banco pra quando aparecer algo no seu horário, combinado?",
  reprovado_score:
    "oi {{nome}}! obrigada por participar da triagem. dessa vez seu perfil não ficou como o mais indicado pra vaga da {{vaga.cliente_nome}}, mas você continua no nosso banco. assim que aparecer algo compatível, a gente te manda. valeu!",
};

function primeiroNome(nome: string) {
  return nome.trim().split(/\s+/)[0] || "candidato";
}

export function preencherFeedback(
  chave: keyof typeof FEEDBACK_TIMING_MS,
  opts: { nome: string; vagaClienteNome?: string }
) {
  const tpl = TEMPLATES[chave];
  return tpl
    .replace(/\{\{nome\}\}/g, primeiroNome(opts.nome))
    .replace(/\{\{vaga\.cliente_nome\}\}/g, opts.vagaClienteNome || "empresa");
}

export function resolverFeedback(motivo: string) {
  const chave = MOTIVO_PARA_TEMPLATE[motivo];
  if (!chave) return null;
  return { chave, delayMs: FEEDBACK_TIMING_MS[chave] };
}
