/** Status de vaga considerados ativos no filtro de vagas. */
export const VAGA_STATUS_ATIVAS = ["aberta", "em_selecao"] as const;

export {
  CANDIDATURA_STATUSES,
  type CandidaturaStatus,
  candidaturaStatusLabel,
} from "@/lib/candidatura-status";

import { CANDIDATURA_STATUSES, type CandidaturaStatus } from "@/lib/candidatura-status";

/** Filtro de status da inscrição: valor = enum `status_candidatura` no banco. */
export const STATUS_FILTRO_DB = Object.fromEntries(
  CANDIDATURA_STATUSES.map((s) => [s, s])
) as Record<CandidaturaStatus, CandidaturaStatus>;

export type StatusFiltroKey = CandidaturaStatus;

export const STATUS_FILTRO_LABELS: Record<StatusFiltroKey, string> = Object.fromEntries(
  CANDIDATURA_STATUSES.map((s) => [s, s.charAt(0).toUpperCase() + s.slice(1)])
) as Record<StatusFiltroKey, string>;
