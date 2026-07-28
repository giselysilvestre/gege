import type { CrmCandidatoRow, CrmMetrics } from "./types";

/** Cálculo leve no browser (fallback quando a API não devolve métricas). */
export function buildMetricsFromRows(
  rows: CrmCandidatoRow[],
  todos = rows.length
): CrmMetrics {
  const abordados = rows.filter(
    (r) =>
      r.ultima_outbound_at ||
      [
        "abordado",
        "respondeu",
        "interessado",
        "qualificado",
        "encaminhado",
        "contratado",
        "inativo",
      ].includes(r.etapa_funil)
  ).length;
  const responderam = rows.filter((r) =>
    ["respondeu", "interessado", "qualificado", "encaminhado", "contratado"].includes(
      r.etapa_funil
    )
  ).length;
  const interessados = rows.filter((r) =>
    ["interessado", "qualificado", "encaminhado", "contratado"].includes(r.etapa_funil)
  ).length;
  const qualificados = rows.filter((r) =>
    ["qualificado", "encaminhado", "contratado"].includes(r.etapa_funil)
  ).length;
  const encaminhados = rows.filter((r) =>
    ["encaminhado", "contratado"].includes(r.etapa_funil)
  ).length;
  const reprovados = rows.filter((r) => r.etapa_funil === "reprovado").length;
  const pct = (n: number, base: number) => (base > 0 ? Math.round((n / base) * 100) : 0);

  return {
    todos,
    abordados,
    responderam,
    interessados,
    qualificados,
    encaminhados,
    reprovados,
    pct_responderam: pct(responderam, abordados),
    pct_interessados: pct(interessados, abordados),
    pct_qualificados: pct(qualificados, abordados),
    pct_encaminhados: pct(encaminhados, abordados),
  };
}
