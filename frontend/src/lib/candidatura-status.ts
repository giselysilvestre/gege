/** Status de candidaturas — label na UI = mesmo nome do enum no banco. */

export const CANDIDATURA_STATUSES = [
  "inscrito",
  "abordado",
  "qualificado",
  "encaminhado",
  "contratado",
  "reprovado",
  "desistiu",
] as const;

export type CandidaturaStatus = (typeof CANDIDATURA_STATUSES)[number];

/** Valores legados → status atual do funil. */
const LEGACY_STATUS_MAP: Record<string, CandidaturaStatus> = {
  novo: "inscrito",
  em_triagem: "abordado",
  em_entrevista: "qualificado",
  entrevista: "qualificado",
  entrevistado: "qualificado",
  em_teste: "encaminhado",
  teste: "encaminhado",
  aprovado: "encaminhado",
  aprovado_teste: "encaminhado",
};

export function normalizeCandidaturaStatus(raw: string | null | undefined): CandidaturaStatus | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  if ((CANDIDATURA_STATUSES as readonly string[]).includes(s)) return s as CandidaturaStatus;
  return LEGACY_STATUS_MAP[s] ?? null;
}

/** Label exibido = nome do status (primeira letra maiúscula). */
export function candidaturaStatusLabel(raw: string | null | undefined): string {
  const s = normalizeCandidaturaStatus(raw) ?? String(raw ?? "").trim();
  if (!s) return "—";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function candidaturaStatusPillClass(raw: string | null | undefined): string {
  const s = normalizeCandidaturaStatus(raw);
  switch (s) {
    case "inscrito":
      return "ep ep-inscrito";
    case "abordado":
      return "ep ep-abordado";
    case "qualificado":
      return "ep ep-qualificado";
    case "encaminhado":
      return "ep ep-encaminhado";
    case "contratado":
      return "ep ep-contratado";
    case "reprovado":
      return "ep ep-reprovado";
    case "desistiu":
      return "ep ep-desistiu";
    default:
      return "ep ep-inscrito";
  }
}

export function candidaturaStatusPill(raw: string | null | undefined): { className: string; label: string } {
  return {
    className: candidaturaStatusPillClass(raw),
    label: candidaturaStatusLabel(raw),
  };
}

export function isCandidaturaTerminal(raw: string | null | undefined): boolean {
  const s = normalizeCandidaturaStatus(raw);
  return s === "reprovado" || s === "desistiu" || s === "contratado";
}

export function isCandidaturaNoFunil(raw: string | null | undefined): boolean {
  const s = normalizeCandidaturaStatus(raw);
  return s !== "reprovado" && s !== "desistiu";
}

/** Ordem no funil (para sort e próxima etapa). */
export const CANDIDATURA_STATUS_RANK: Record<CandidaturaStatus, number> = {
  inscrito: 1,
  abordado: 2,
  qualificado: 3,
  encaminhado: 4,
  contratado: 5,
  reprovado: 0,
  desistiu: 0,
};

export function nextCandidaturaStatus(current: string | null | undefined): CandidaturaStatus | null {
  const s = normalizeCandidaturaStatus(current);
  if (!s) return null;
  if (s === "inscrito") return "abordado";
  if (s === "abordado") return "qualificado";
  if (s === "qualificado") return "encaminhado";
  if (s === "encaminhado") return "contratado";
  return null;
}

export type CandidaturaSummaryCounts = {
  todos: number;
  inscrito: number;
  abordado: number;
  qualificado: number;
  encaminhado: number;
  contratado: number;
  reprovado: number;
  desistiu: number;
};

export function emptySummaryCounts(): CandidaturaSummaryCounts {
  return {
    todos: 0,
    inscrito: 0,
    abordado: 0,
    qualificado: 0,
    encaminhado: 0,
    contratado: 0,
    reprovado: 0,
    desistiu: 0,
  };
}

export function summaryCountForStatus(raw: string | null | undefined): keyof Omit<CandidaturaSummaryCounts, "todos"> | null {
  const s = normalizeCandidaturaStatus(raw);
  if (!s) return null;
  return s;
}

export const CANDIDATURA_FUNIL_BOXES: Array<{ key: keyof CandidaturaSummaryCounts; label: string }> = [
  { key: "todos", label: "Todos" },
  { key: "inscrito", label: "Inscrito" },
  { key: "abordado", label: "Abordado" },
  { key: "qualificado", label: "Qualificado" },
  { key: "encaminhado", label: "Encaminhado" },
  { key: "contratado", label: "Contratado" },
  { key: "reprovado", label: "Reprovado" },
  { key: "desistiu", label: "Desistiu" },
];
