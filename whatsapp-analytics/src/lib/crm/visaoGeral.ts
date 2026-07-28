import type { CrmCandidatoRow, CrmDashboard, CrmMetrics, EtapaFunil } from "./types";
import { ETAPA_LABELS, FUNIL_PRINCIPAL } from "./types";
import { JANELA_WHATSAPP_MS } from "./format";

export type MetricasDia = {
  conversas_ativas: number;
  abordados_hoje: number;
  abordados_hoje_pct_resposta: number;
  qualificados: number;
  encaminhados_hoje: number;
  qualificados_de: number;
};

export type MetricasPeriodo = {
  abordados: number;
  respondidos: number;
  pct_respondidos: number;
  encaminhados: number;
  pct_encaminhados: number;
  contratados: number;
  pct_contratados: number;
  pct_conversao_total: number;
};

export type FunilProgressaoStep = {
  etapa: EtapaFunil;
  label: string;
  count: number;
  pct_para_proximo: number | null;
};

export type CandidatoProntoCliente = {
  sessao_id: string;
  nome: string;
  vaga_nome: string;
  etapa_funil: EtapaFunil;
  etapa_label: string;
  score_cv: number | null;
  score_entrevista: number | null;
  tags: string[];
};

export type VisaoGeralModel = {
  metricas_dia: MetricasDia;
  metricas_periodo: MetricasPeriodo;
  funil_progressao: FunilProgressaoStep[];
  prontos_cliente: CandidatoProntoCliente[];
};


const ETAPAS_FORA_PIPELINE = new Set<EtapaFunil>(["reprovado", "desistiu", "contratado", "inativo"]);

function pct(n: number, base: number) {
  return base > 0 ? Math.round((n / base) * 1000) / 10 : 0;
}

function isSameLocalDay(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

/** Sessão no funil com mensagem nos últimos 24h (entrada ou saída). */
function isConversaAtiva(row: CrmCandidatoRow, agora = Date.now()): boolean {
  if (row.status_sessao !== "ativo") return false;
  if (ETAPAS_FORA_PIPELINE.has(row.etapa_funil)) return false;
  if (!row.ultima_data) return false;
  const t = Date.parse(row.ultima_data);
  if (Number.isNaN(t)) return false;
  return agora - t < JANELA_WHATSAPP_MS;
}

function isAbordadoHoje(row: CrmCandidatoRow): boolean {
  return isSameLocalDay(row.sessao_criado_em) || isSameLocalDay(row.ultima_outbound_at);
}

/** Só encaminhamento explícito no CRM hoje — não inferido por etapa_atual. */
function isEncaminhadoHoje(row: CrmCandidatoRow): boolean {
  if (row.sessao_etapa_funil !== "encaminhado") return false;
  return (
    isSameLocalDay(row.sessao_atualizado_em) || isSameLocalDay(row.candidatura_atualizado_em)
  );
}

const ETAPAS_COM_RESPOSTA: EtapaFunil[] = [
  "respondeu",
  "interessado",
  "qualificado",
  "encaminhado",
  "contratado",
];
const ETAPAS_INTERESSADO: EtapaFunil[] = ["interessado", "qualificado", "encaminhado", "contratado"];
const ETAPAS_QUALIFICADO: EtapaFunil[] = ["qualificado", "encaminhado", "contratado"];
const ETAPAS_ENCAMINHADO: EtapaFunil[] = ["encaminhado", "contratado"];
const ETAPAS_ABORDADO_ETAPA: EtapaFunil[] = [
  "abordado",
  "respondeu",
  "interessado",
  "qualificado",
  "encaminhado",
  "contratado",
  "inativo",
];

function isAbordado(row: CrmCandidatoRow): boolean {
  return Boolean(row.ultima_outbound_at) || ETAPAS_ABORDADO_ETAPA.includes(row.etapa_funil);
}

function countComEtapa(rows: CrmCandidatoRow[], etapas: EtapaFunil[]): number {
  return rows.filter((r) => etapas.includes(r.etapa_funil)).length;
}

function countFunilEtapa(rows: CrmCandidatoRow[], etapa: EtapaFunil): number {
  switch (etapa) {
    case "abordado":
      return rows.filter(isAbordado).length;
    case "respondeu":
      return countComEtapa(rows, ETAPAS_COM_RESPOSTA);
    case "interessado":
      return countComEtapa(rows, ETAPAS_INTERESSADO);
    case "qualificado":
      return countComEtapa(rows, ETAPAS_QUALIFICADO);
    case "encaminhado":
      return countComEtapa(rows, ETAPAS_ENCAMINHADO);
    case "contratado":
      return countComEtapa(rows, ["contratado"]);
    default:
      return 0;
  }
}

export function buildVisaoGeralModel(
  rows: CrmCandidatoRow[],
  _metrics: CrmMetrics | null,
  _dashboard: CrmDashboard | null
): VisaoGeralModel {
  const ativas = rows.filter(isConversaAtiva);
  const abordadosHoje = rows.filter(isAbordadoHoje);
  const qualificadosDia = abordadosHoje.filter((r) =>
    ETAPAS_QUALIFICADO.includes(r.etapa_funil)
  ).length;
  const respondidosAbordadosHoje = abordadosHoje.filter((r) =>
    ETAPAS_COM_RESPOSTA.includes(r.etapa_funil)
  ).length;

  const abordadosPeriodo = rows.filter(isAbordado).length;
  const respondidosPeriodo = countComEtapa(rows, ETAPAS_COM_RESPOSTA);
  const encaminhadosPeriodo = countComEtapa(rows, ETAPAS_ENCAMINHADO);
  const contratadosPeriodo = countComEtapa(rows, ["contratado"]);

  const funilCounts = FUNIL_PRINCIPAL.map((etapa) => ({
    etapa,
    label: ETAPA_LABELS[etapa].toLowerCase(),
    count: countFunilEtapa(rows, etapa),
  }));

  const funil_progressao: FunilProgressaoStep[] = funilCounts.map((step, i) => {
    const next = funilCounts[i + 1];
    return {
      etapa: step.etapa,
      label: step.label,
      count: step.count,
      pct_para_proximo: next ? pct(next.count, step.count || 1) : null,
    };
  });

  const prontos_cliente: CandidatoProntoCliente[] = rows
    .filter(
      (r) =>
        r.status_sessao === "ativo" &&
        (r.etapa_funil === "interessado" || r.etapa_funil === "qualificado")
    )
    .sort((a, b) => {
      const rank = (e: EtapaFunil) => (e === "qualificado" ? 0 : 1);
      const dr = rank(a.etapa_funil) - rank(b.etapa_funil);
      if (dr !== 0) return dr;
      return (b.score_cv ?? -1) - (a.score_cv ?? -1);
    })
    .slice(0, 12)
    .map((r) => ({
      sessao_id: r.sessao_id,
      nome: r.candidato_nome,
      vaga_nome: r.vaga_nome,
      etapa_funil: r.etapa_funil,
      etapa_label: ETAPA_LABELS[r.etapa_funil],
      score_cv: r.score_cv,
      score_entrevista: r.score_entrevista,
      tags: r.tags,
    }));

  return {
    metricas_dia: {
      conversas_ativas: ativas.length,
      abordados_hoje: abordadosHoje.length,
      abordados_hoje_pct_resposta: pct(respondidosAbordadosHoje, abordadosHoje.length),
      qualificados: qualificadosDia,
      encaminhados_hoje: rows.filter(isEncaminhadoHoje).length,
      qualificados_de: abordadosHoje.length,
    },
    metricas_periodo: {
      abordados: abordadosPeriodo,
      respondidos: respondidosPeriodo,
      pct_respondidos: pct(respondidosPeriodo, abordadosPeriodo),
      encaminhados: encaminhadosPeriodo,
      pct_encaminhados: pct(encaminhadosPeriodo, respondidosPeriodo),
      contratados: contratadosPeriodo,
      pct_contratados: pct(contratadosPeriodo, encaminhadosPeriodo || respondidosPeriodo),
      pct_conversao_total: pct(contratadosPeriodo, abordadosPeriodo),
    },
    funil_progressao,
    prontos_cliente,
  };
}
