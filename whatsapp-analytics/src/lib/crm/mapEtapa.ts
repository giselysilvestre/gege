import type { EtapaFunil } from "./types";
import { diasSemResposta } from "./format";

type SessaoLike = {
  etapa_funil: string | null;
  etapa_atual: string | null;
  status: string | null;
  ultima_inbound_at: string | null;
  ultima_outbound_at: string | null;
  primeira_resposta_at: string | null;
};

type CandidaturaLike = {
  status?: string | null;
  motivo_reprovacao?: string | null;
};

type AnaliseLike = {
  score_pos_entrevista?: number | null;
};

const ORDEM_AVANCO: EtapaFunil[] = [
  "abordado",
  "respondeu",
  "interessado",
  "qualificado",
  "encaminhado",
  "contratado",
];

export function inferirEtapaFunil(
  sessao: SessaoLike,
  candidatura: CandidaturaLike | null,
  analise: AnaliseLike | null
): EtapaFunil {
  if (sessao.etapa_funil && isEtapaFunil(sessao.etapa_funil)) {
    return sessao.etapa_funil;
  }

  if (candidatura?.motivo_reprovacao) return "reprovado";
  if (candidatura?.status === "contratado") return "contratado";
  if (sessao.status === "encerrado" && candidatura?.motivo_reprovacao) return "reprovado";

  const dias = diasSemResposta(sessao.ultima_inbound_at, sessao.ultima_outbound_at);
  const semInbound = !sessao.ultima_inbound_at && !sessao.primeira_resposta_at;

  if (semInbound && sessao.ultima_outbound_at && dias >= 3) return "inativo";
  if (semInbound) return "abordado";

  const etapa = sessao.etapa_atual ?? "";

  if (etapa === "agendamento_entrevista") return "encaminhado";
  if (etapa === "mini_entrevista") {
    if (analise?.score_pos_entrevista != null) return "qualificado";
    return "interessado";
  }
  if (etapa === "confirma_endereco") return "interessado";
  if (etapa === "apresentacao_vaga" || etapa === "disparo_template") {
    return sessao.ultima_inbound_at || sessao.primeira_resposta_at ? "respondeu" : "abordado";
  }
  if (etapa === "encerramento") {
    if (analise?.score_pos_entrevista != null && analise.score_pos_entrevista >= 55) {
      return "qualificado";
    }
    return "reprovado";
  }

  if (sessao.ultima_inbound_at) return "respondeu";
  return "abordado";
}

export function proximaEtapaFunil(atual: EtapaFunil): EtapaFunil | null {
  const i = ORDEM_AVANCO.indexOf(atual);
  if (i < 0 || i >= ORDEM_AVANCO.length - 1) return null;
  return ORDEM_AVANCO[i + 1];
}

export function statusDot(
  etapa: EtapaFunil,
  precisaResp: boolean,
  diasInativo: number
): "green" | "amber" | "red" | "gray" {
  if (etapa === "inativo" || diasInativo >= 3) return "red";
  if (etapa === "contratado" || etapa === "encaminhado") return "green";
  if (precisaResp || etapa === "respondeu" || etapa === "interessado") return "amber";
  if (etapa === "abordado") return "gray";
  return "green";
}

function isEtapaFunil(v: string): v is EtapaFunil {
  return [
    "abordado",
    "respondeu",
    "interessado",
    "qualificado",
    "encaminhado",
    "contratado",
    "reprovado",
    "desistiu",
    "inativo",
  ].includes(v);
}
