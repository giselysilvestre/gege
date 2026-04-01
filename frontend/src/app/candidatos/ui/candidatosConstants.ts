/** Status de vaga considerados ativos no filtro de vagas. */
export const VAGA_STATUS_ATIVAS = ["aberta", "em_selecao"] as const;

/** Filtro de status da inscrição: valor do enum `status_candidatura`. */
export const STATUS_FILTRO_DB = {
  entrevista: "em_entrevista",
  teste: "em_teste",
  contratado: "contratado",
  reprovado: "reprovado",
} as const;

export type StatusFiltroKey = keyof typeof STATUS_FILTRO_DB;

export const STATUS_FILTRO_LABELS: Record<StatusFiltroKey, string> = {
  entrevista: "Entrevista",
  teste: "Teste",
  contratado: "Contratado",
  reprovado: "Reprovado",
};
