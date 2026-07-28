import type { MotivoReprovacao } from "@/lib/crm/types";

/** Modelos de mensagem do CRM (texto livre dentro da janela de 24h). */
export const MODELOS_MENSAGEM_ACAO = [
  { value: "reprovar_distancia", label: "Reprovar — distância" },
  { value: "reprovar_horario", label: "Reprovar — horário/escala" },
  { value: "reprovar_perfil", label: "Reprovar — score/perfil/eliminatório" },
  { value: "desistencia", label: "Desistência" },
  { value: "encaminhado", label: "Encaminhado — selecionado(a)" },
  { value: "mover_vaga", label: "Mover de vaga" },
] as const;

export type ModeloMensagemAcao = (typeof MODELOS_MENSAGEM_ACAO)[number]["value"];

/**
 * Nome sugerido para cadastro na Meta/Kapso (fora da janela de 24h).
 * Cadastre com "Use named parameters" e {{nome}}, {{cliente}}, {{vaga}} no corpo.
 */
export const META_TEMPLATE_POR_MODELO: Partial<
  Record<ModeloMensagemAcao, { kapsoName: string; vars: ("nome" | "cliente" | "vaga")[] }>
> = {
  reprovar_distancia: { kapsoName: "crm_reprovar_distancia", vars: ["nome"] },
  reprovar_horario: { kapsoName: "crm_reprovar_horario", vars: ["nome"] },
  reprovar_perfil: { kapsoName: "crm_reprovar_perfil", vars: ["nome", "cliente"] },
  desistencia: { kapsoName: "crm_desistencia", vars: ["nome"] },
  encaminhado: { kapsoName: "crm_encaminhado", vars: ["nome", "cliente"] },
  mover_vaga: { kapsoName: "crm_mover_vaga", vars: ["nome", "vaga"] },
};

const TEMPLATES: Record<ModeloMensagemAcao, string> = {
  reprovar_distancia:
    "oi {{nome}}! infelizmente essa vaga ficou distante pra você. mas seu perfil continua no nosso banco e, quando aparecer algo mais perto, a gente te avisa. obrigada por responder tudo e te desejo muito sucesso!",
  reprovar_horario:
    "oi {{nome}}! infelizmente a escala dessa vaga não bate com sua disponibilidade. vou te manter no banco pra quando aparecer algo no seu horário, combinado? Muito obrigada e te desejo muito sucesso.",
  reprovar_perfil:
    "oi {{nome}}! obrigada por participar da triagem. Dessa vez seu perfil não ficou como o mais indicado pra vaga da {{cliente}}, mas gostei muito de te conhecer. Você continua no nosso banco e, assim que aparecer algo compatível, eu entro em contato com você, tá bem? Muito obrigada e te desejo muito sucesso.",
  desistencia:
    "oi {{nome}}, tudo bem? Entendo que você não irá seguir com a gente dessa vez, sem problema! Se você conhecer alguém que queira indicar ou puder encaminhar essa oportunidade pra algum grupo e empregos eu te agradeço demais 😊",
  encaminhado:
    "oi {{nome}}! parabéns, você foi selecionado(a) pela equipe {{cliente}} 🎉\nO time de recrutamento vai entrar em contato com você em breve pra marcar a entrevista. fica de olho no whatsapp, ok?",
  mover_vaga:
    "{{nome}}, após avaliar o seu perfil eu identifiquei que você se encaixaria melhor em uma outra vaga nossa, a vaga de {{vaga}}. você quer saber mais?",
};

function primeiroNome(nome: string) {
  return nome.trim().split(/\s+/)[0] || "candidato";
}

export function modeloPorMotivoReprovacao(motivo: MotivoReprovacao): ModeloMensagemAcao {
  if (motivo === "distancia") return "reprovar_distancia";
  if (motivo === "horario") return "reprovar_horario";
  if (motivo === "desistiu") return "desistencia";
  return "reprovar_perfil";
}

export function preencherMensagemAcao(
  modelo: ModeloMensagemAcao,
  opts: { nome: string; cliente?: string; vaga?: string }
) {
  const tpl = TEMPLATES[modelo];
  return tpl
    .replace(/\{\{nome\}\}/g, primeiroNome(opts.nome))
    .replace(/\{\{cliente\}\}/g, opts.cliente?.trim() || "empresa")
    .replace(/\{\{vaga\}\}/g, opts.vaga?.trim() || "vaga");
}

export function previewMensagemAcao(
  modelo: ModeloMensagemAcao,
  opts: { nome?: string; cliente?: string; vaga?: string }
) {
  return preencherMensagemAcao(modelo, {
    nome: opts.nome ?? "Fulano",
    cliente: opts.cliente,
    vaga: opts.vaga,
  });
}
