/** Contagem do funil e do card de vaga — alinhado a `candidatos/page.tsx` (stagePredicate). */

export function isReprovado(status: string) {
  return status === "reprovado" || status === "desistiu";
}

/** Candidaturas que entram no funil (exclui reprovados). */
export function isNoFunil(status: string) {
  return !isReprovado(status);
}

export function countTriagemExclusive(status: string): boolean {
  // Alinhado ao stage-box de Candidatos: "novo" também conta como Triagem.
  return status === "novo" || status === "em_triagem";
}

export function countEntrevistaExclusive(status: string): boolean {
  return status === "em_entrevista" || status === "entrevista" || status === "entrevistado";
}

export function countTesteExclusive(status: string): boolean {
  return status === "em_teste" || status === "teste" || status === "aprovado_teste" || status === "aprovado";
}

export function countContratadoExclusive(status: string): boolean {
  return status === "contratado";
}

export function countNovoExclusive(status: string): boolean {
  return status === "novo";
}

/** Linhas do funil: [label key, count, barClass]. Barra 1 = total; demais proporcionais a `total`. */
export function funnelRowsFromStatuses(statuses: string[]) {
  const active = statuses.filter(isNoFunil);
  const total = active.length;
  const triagem = active.filter(countTriagemExclusive).length;
  const entrevista = active.filter(countEntrevistaExclusive).length;
  const teste = active.filter(countTesteExclusive).length;
  const contratado = active.filter(countContratadoExclusive).length;
  return [
    { label: "Inscritos" as const, value: total, key: "total" as const },
    { label: "Triagem" as const, value: triagem, key: "triagem" as const },
    { label: "Entrevista" as const, value: entrevista, key: "entrevista" as const },
    { label: "Teste" as const, value: teste, key: "teste" as const },
    { label: "Contratados" as const, value: contratado, key: "contratado" as const },
  ];
}

/** Métricas do card de vaga: mesmas contagens exclusivas do funil. */
export function vagaPipelineCounts(rows: { status: string }[]) {
  const list = rows.filter((r) => !isReprovado(r.status));
  const inscritos = list.length;
  const triados = list.filter((r) => countTriagemExclusive(r.status)).length;
  const entrevistados = list.filter((r) => countEntrevistaExclusive(r.status)).length;
  const testados = list.filter((r) => countTesteExclusive(r.status)).length;
  return { inscritos, triados, entrevistados, testados };
}

export function pctBar(value: number, base: number): number {
  if (base <= 0) return value <= 0 ? 0 : 100;
  return Math.min(100, Math.round((value / base) * 1000) / 10);
}
