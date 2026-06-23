/** Contagem do funil — alinhado a `candidatura-status.ts`. */

import {
  etapaFromStatus,
  isCandidaturaNoFunil,
  normalizeCandidaturaStatus,
} from "@/lib/candidatura-status";

/** Reprovação na triagem (legado `reprovado` → `inscrito_reprovado`). */
export function isReprovado(status: string) {
  return normalizeCandidaturaStatus(status) === "inscrito_reprovado";
}

/** Recusa ativa na abordagem (legado `desistiu` → `abordado_negativa`). */
export function isDesistiu(status: string) {
  return normalizeCandidaturaStatus(status) === "abordado_negativa";
}

/** Candidaturas que entram no funil (exclui terminais de morte). */
export function isNoFunil(status: string) {
  return isCandidaturaNoFunil(status);
}

export function countInscritoExclusive(status: string): boolean {
  return etapaFromStatus(status) === "inscrito";
}

export function countAbordadoExclusive(status: string): boolean {
  return etapaFromStatus(status) === "abordado";
}

export function countQualificadoExclusive(status: string): boolean {
  return etapaFromStatus(status) === "qualificado";
}

export function countEncaminhadoExclusive(status: string): boolean {
  return etapaFromStatus(status) === "encaminhado";
}

export function countContratadoExclusive(status: string): boolean {
  return etapaFromStatus(status) === "contratado";
}

/** @deprecated use countInscritoExclusive */
export function countTriagemExclusive(status: string): boolean {
  return countInscritoExclusive(status) || countAbordadoExclusive(status);
}

/** @deprecated use countQualificadoExclusive */
export function countEntrevistaExclusive(status: string): boolean {
  return countQualificadoExclusive(status);
}

/** @deprecated use countEncaminhadoExclusive */
export function countTesteExclusive(status: string): boolean {
  return countEncaminhadoExclusive(status);
}

/** @deprecated */
export function countNovoExclusive(status: string): boolean {
  return countInscritoExclusive(status);
}

/** Linhas do funil no dashboard. */
export function funnelRowsFromStatuses(statuses: string[]) {
  const active = statuses.filter(isNoFunil);
  const total = active.length;
  const inscrito = active.filter(countInscritoExclusive).length;
  const abordado = active.filter(countAbordadoExclusive).length;
  const qualificado = active.filter(countQualificadoExclusive).length;
  const encaminhado = active.filter(countEncaminhadoExclusive).length;
  const contratado = active.filter(countContratadoExclusive).length;
  return [
    { label: "Inscrito" as const, value: total, key: "total" as const },
    { label: "Abordado" as const, value: abordado, key: "abordado" as const },
    { label: "Qualificado" as const, value: qualificado, key: "qualificado" as const },
    { label: "Encaminhado" as const, value: encaminhado, key: "encaminhado" as const },
    { label: "Contratado" as const, value: contratado, key: "contratado" as const },
  ];
}

/** Métricas do card de vaga. */
export function vagaPipelineCounts(rows: { status: string }[]) {
  const list = rows.filter((r) => isNoFunil(r.status));
  const inscritos = list.length;
  const abordados = list.filter((r) => countAbordadoExclusive(r.status)).length;
  const qualificados = list.filter((r) => countQualificadoExclusive(r.status)).length;
  const encaminhados = list.filter((r) => countEncaminhadoExclusive(r.status)).length;
  return { inscritos, triados: abordados, entrevistados: qualificados, testados: encaminhados };
}

export function pctBar(value: number, base: number): number {
  if (base <= 0) return value <= 0 ? 0 : 100;
  return Math.min(100, Math.round((value / base) * 1000) / 10);
}
