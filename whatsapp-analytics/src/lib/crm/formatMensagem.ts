import { primeiroNome } from "@/lib/crm";
import { preencherMensagemAcao, type ModeloMensagemAcao } from "@/lib/crm/mensagens-acao";

const TEMPLATE_TAG = /^\[template:([^\]]+)\]\s*([\s\S]*)$/;

/** Corpo aprovado na Meta/Kapso — espelho do que o candidato recebe no WhatsApp. */
const TEMPLATE_BODIES: Record<string, string> = {
  gege_recebida:
    "Olá {{nome}},\n\nRecebemos sua candidatura para {{vaga}}. Enviaremos uma atualização de status assim que tivermos um retorno seu.\n\nMuito obrigada!",
  gege_abordagem_vaga:
    "oiee {{nome}}, tudo bem? Eu sou a Ana, da Gegê Recrutamento. Vi seu perfil e tenho uma vaga de {{vaga}}. Posso te passar os detalhes?",
  abordagem_candidatura_gege:
    "oiee {{nome}}, tudo bem? Eu sou a Ana, da Gegê Recrutamento. Vi uma oportunidade de {{vaga}} perfeita pro seu perfil. Posso te contar mais?",
  fup_mensagem: "oiii, não esquece de me responder?",
  gege_fup: "oiee {{nome}}, tudo bem? não esquece de me responder?",
  gege_utilidade: "oi {{nome}}, tudo bem? sou a Ana, da Gegê. como posso te ajudar?",
};

const CRM_TEMPLATE_MODELO: Record<string, ModeloMensagemAcao> = {
  crm_reprovar_distancia: "reprovar_distancia",
  crm_reprovar_horario: "reprovar_horario",
  crm_reprovar_perfil: "reprovar_perfil",
  crm_desistencia: "desistencia",
  crm_encaminhado: "encaminhado",
  crm_mover_vaga: "mover_vaga",
};

function preencherTemplate(
  body: string,
  params: { nome?: string; vaga?: string; cliente?: string }
) {
  const nome = params.nome ? primeiroNome(params.nome) : "candidato";
  return body
    .replace(/\{\{nome\}\}/g, nome)
    .replace(/\{\{vaga\}\}/g, params.vaga?.trim() || "vaga")
    .replace(/\{\{cliente\}\}/g, params.cliente?.trim() || "empresa");
}

function parseNomeVagaSuffix(rest: string): { nome: string; vaga: string } | null {
  const match = rest.match(/^([\s\S]+?)\s+[—–-]\s+([\s\S]+)$/);
  if (!match) return null;
  return { nome: match[1].trim(), vaga: match[2].trim() };
}

/** Texto já expandido no log (CRM, FUP com corpo, etc.). */
function pareceTextoCompleto(rest: string): boolean {
  const t = rest.trim();
  if (!t) return false;
  if (t.length > 90) return true;
  if (t.includes("\n")) return true;
  if (/^(oi|oiee|oiii|olá|ola|FUP)/i.test(t)) return true;
  if (/[.!?]/.test(t) && !/^[^—–-]+ [—–-] [^—–-]+$/.test(t)) return true;
  return false;
}

export function formatMensagemExibicao(conteudo: string | null | undefined): string {
  const raw = conteudo?.trim();
  if (!raw) return "[sem conteúdo]";

  const tagged = raw.match(TEMPLATE_TAG);
  if (!tagged) return raw;

  const templateName = tagged[1];
  const rest = tagged[2].trim();

  if (pareceTextoCompleto(rest)) return rest;

  const nomeVaga = parseNomeVagaSuffix(rest);
  const body = TEMPLATE_BODIES[templateName];
  if (body && nomeVaga) {
    return preencherTemplate(body, { nome: nomeVaga.nome, vaga: nomeVaga.vaga });
  }

  const crmModelo = CRM_TEMPLATE_MODELO[templateName];
  if (crmModelo && rest) {
    return rest;
  }
  if (crmModelo) {
    return preencherMensagemAcao(crmModelo, { nome: "candidato" });
  }

  if (body) {
    return preencherTemplate(body, {
      nome: nomeVaga?.nome,
      vaga: nomeVaga?.vaga,
    });
  }

  return rest || raw.replace(/^\[template:[^\]]+\]\s*/, "").trim() || raw;
}
