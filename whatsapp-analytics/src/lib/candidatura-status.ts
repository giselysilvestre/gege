/**
 * Espelho de escrita — fonte canônica: frontend/src/lib/candidatura-status.ts
 * Manter sync manual até extrair shared/candidatura-status.ts (Bloco futuro).
 * Escopo: apenas helpers usados por escritores (acoes/route.ts). Sem labels/UI/filtros.
 */

export const CANDIDATURA_ETAPAS = [
  "inscrito",
  "abordado",
  "qualificado",
  "encaminhado",
  "contratado",
] as const;

export type CandidaturaEtapa = (typeof CANDIDATURA_ETAPAS)[number];

export const CANDIDATURA_STATUSES = [
  "inscrito_aguardando_disparo",
  "inscrito_avancar",
  "inscrito_reprovado",
  "inscrito_falha",
  "abordado_em_conversa",
  "abordado_avancar",
  "abordado_sem_resposta",
  "abordado_reprovado_sem_resposta",
  "abordado_negativa",
  "qualificado_pendente_entrevista",
  "qualificado_avancar",
  "qualificado_reprovado_entrevista",
  "encaminhado_aguardando",
  "encaminhado_avancar",
  "encaminhado_reprovado",
  "contratado",
] as const;

export type CandidaturaStatus = (typeof CANDIDATURA_STATUSES)[number];

const CANDIDATURA_DEATH_TERMINAL_STATUSES = [
  "inscrito_reprovado",
  "inscrito_falha",
  "abordado_reprovado_sem_resposta",
  "abordado_negativa",
  "qualificado_reprovado_entrevista",
  "encaminhado_reprovado",
] as const satisfies readonly CandidaturaStatus[];

const LEGACY_STATUS_MAP: Record<string, CandidaturaStatus> = {
  inscrito: "inscrito_aguardando_disparo",
  novo: "inscrito_aguardando_disparo",
  em_triagem: "inscrito_aguardando_disparo",
  movido: "inscrito_aguardando_disparo",
  abordado: "abordado_em_conversa",
  respondeu: "abordado_em_conversa",
  interessado: "abordado_avancar",
  qualificado: "qualificado_avancar",
  em_entrevista: "qualificado_avancar",
  entrevista: "qualificado_avancar",
  entrevistado: "qualificado_avancar",
  encaminhado: "encaminhado_aguardando",
  em_teste: "encaminhado_aguardando",
  teste: "encaminhado_aguardando",
  aprovado: "encaminhado_avancar",
  aprovado_teste: "encaminhado_avancar",
  contratado: "contratado",
  reprovado: "inscrito_reprovado",
  desistiu: "abordado_negativa",
};

const REPROVADO_POR_ETAPA: Record<Exclude<CandidaturaEtapa, "contratado">, CandidaturaStatus> = {
  inscrito: "inscrito_reprovado",
  abordado: "abordado_negativa",
  qualificado: "qualificado_reprovado_entrevista",
  encaminhado: "encaminhado_reprovado",
};

export const CANDIDATURA_STATUS_INICIAL = "inscrito_aguardando_disparo" as const satisfies CandidaturaStatus;
export const CANDIDATURA_STATUS_DESISTENCIA = "abordado_negativa" as const satisfies CandidaturaStatus;
export const CANDIDATURA_STATUS_ENCAMINHADO_AGUARDANDO = "encaminhado_aguardando" as const satisfies CandidaturaStatus;

export function normalizeCandidaturaStatus(raw: string | null | undefined): CandidaturaStatus | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  if ((CANDIDATURA_STATUSES as readonly string[]).includes(s)) return s as CandidaturaStatus;
  return LEGACY_STATUS_MAP[s] ?? null;
}

export function etapaFromStatus(raw: string | null | undefined): CandidaturaEtapa | null {
  const s = normalizeCandidaturaStatus(raw) ?? String(raw ?? "").trim();
  if (!s) return null;
  const prefix = s.split("_", 1)[0];
  if ((CANDIDATURA_ETAPAS as readonly string[]).includes(prefix)) return prefix as CandidaturaEtapa;
  return null;
}

function isDeathTerminalStatus(s: CandidaturaStatus): boolean {
  return (CANDIDATURA_DEATH_TERMINAL_STATUSES as readonly string[]).includes(s);
}

export function isCandidaturaTerminal(raw: string | null | undefined): boolean {
  const s = normalizeCandidaturaStatus(raw);
  if (!s) return false;
  return isDeathTerminalStatus(s) || s === "contratado";
}

export function reprovadoStatusForEtapa(raw: string | null | undefined): CandidaturaStatus | null {
  const etapa = etapaFromStatus(raw);
  if (!etapa || etapa === "contratado") return null;
  return REPROVADO_POR_ETAPA[etapa];
}

export function nextCandidaturaStatus(current: string | null | undefined): CandidaturaStatus | null {
  const s = normalizeCandidaturaStatus(current);
  if (!s || isCandidaturaTerminal(s)) return null;
  const etapa = etapaFromStatus(s);
  switch (etapa) {
    case "inscrito":
      return "abordado_em_conversa";
    case "abordado":
      return "qualificado_pendente_entrevista";
    case "qualificado":
      return "encaminhado_aguardando";
    case "encaminhado":
      return "contratado";
    case "contratado":
    default:
      return null;
  }
}
