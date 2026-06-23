/**
 * Vocabulário canônico de status de candidatura (16 valores `etapa_situacao`).
 * Fatia de preparação: normalização e labels no front; o banco ainda usa o enum legado
 * (ver POSTGRES_STATUS_ENUM — trocado na migration futura).
 *
 * Significado de negócio de cada status:
 *
 * - inscrito_aguardando_disparo — na vaga, ainda não abordado (fila de disparo)
 * - inscrito_avancar — disparo enviado com sucesso, vira abordado
 * - inscrito_reprovado — score CV < 50 (triagem)
 * - inscrito_falha — sem telefone / número inválido / indisponível
 * - abordado_em_conversa — respondeu, conversa em andamento
 * - abordado_avancar — confirmou interesse na vaga + proximidade, pronto p/ qualificar
 * - abordado_sem_resposta — disparou, sem resposta, dentro da janela de fup (VIVO)
 * - abordado_reprovado_sem_resposta — esgotou fup (1 abordagem + 1 fup, 3 dias), morto por silêncio
 * - abordado_negativa — recusou ativamente (detecção por intenção da Ana)
 * - qualificado_pendente_entrevista — entrou na mini-entrevista, não concluiu
 * - qualificado_avancar — score entrevista >= 50, pronto p/ encaminhar
 * - qualificado_reprovado_entrevista — score < 50 OU eliminatório (sem disponib. no horário
 *   da vaga, mora longe, sem documentação, má vontade/superficialidade)
 * - encaminhado_aguardando — dossiê enviado ao cliente, aguardando decisão (só humano move p/ cá)
 * - encaminhado_avancar — cliente confirmou, vira contratado
 * - encaminhado_reprovado — cliente recusou
 * - contratado — fim (terminal positivo, NÃO libera candidato p/ nova vaga)
 */

/** Etapas-mãe do funil (prefixo antes do primeiro "_"). */
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

/** Labels legíveis na UI (português). */
export const CANDIDATURA_STATUS_LABELS: Record<CandidaturaStatus, string> = {
  inscrito_aguardando_disparo: "aguardando disparo",
  inscrito_avancar: "avançar (triagem)",
  inscrito_reprovado: "reprovado (triagem)",
  inscrito_falha: "falha no disparo",
  abordado_em_conversa: "em conversa",
  abordado_avancar: "avançar (abordado)",
  abordado_sem_resposta: "sem resposta (fup)",
  abordado_reprovado_sem_resposta: "reprovado (sem resposta)",
  abordado_negativa: "reprovado (recusou)",
  qualificado_pendente_entrevista: "entrevista pendente",
  qualificado_avancar: "avançar (qualificado)",
  qualificado_reprovado_entrevista: "reprovado (entrevista)",
  encaminhado_aguardando: "encaminhado (aguardando cliente)",
  encaminhado_avancar: "avançar (contratação)",
  encaminhado_reprovado: "reprovado (cliente)",
  contratado: "contratado",
};

/** Status de reprovação conforme a etapa-mãe atual (MECE — único ponto para escritores). */
const REPROVADO_POR_ETAPA: Record<Exclude<CandidaturaEtapa, "contratado">, CandidaturaStatus> = {
  inscrito: "inscrito_reprovado",
  abordado: "abordado_negativa",
  qualificado: "qualificado_reprovado_entrevista",
  encaminhado: "encaminhado_reprovado",
};

export function reprovadoStatusForEtapa(raw: string | null | undefined): CandidaturaStatus | null {
  const etapa = etapaFromStatus(raw);
  if (!etapa || etapa === "contratado") return null;
  return REPROVADO_POR_ETAPA[etapa];
}

/** Status inicial de nova candidatura (match, mover vaga destino). */
export const CANDIDATURA_STATUS_INICIAL = "inscrito_aguardando_disparo" as const satisfies CandidaturaStatus;

/** Recusa ativa / desistência. */
export const CANDIDATURA_STATUS_DESISTENCIA = "abordado_negativa" as const satisfies CandidaturaStatus;

/** Pós-encaminhar manual (dossiê aguardando cliente). */
export const CANDIDATURA_STATUS_ENCAMINHADO_AGUARDANDO = "encaminhado_aguardando" as const satisfies CandidaturaStatus;

/** Terminais de morte — encerram a candidatura e liberam o candidato para nova vaga. */
export const CANDIDATURA_DEATH_TERMINAL_STATUSES = [
  "inscrito_reprovado",
  "inscrito_falha",
  "abordado_reprovado_sem_resposta",
  "abordado_negativa",
  "qualificado_reprovado_entrevista",
  "encaminhado_reprovado",
] as const satisfies readonly CandidaturaStatus[];

/** Valores legados (enum antigo + aliases) → status canônico. */
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

/** Etapa-mãe derivada do prefixo (espelha coluna gerada `etapa` no Postgres). */
export function etapaFromStatus(raw: string | null | undefined): CandidaturaEtapa | null {
  const s = normalizeCandidaturaStatus(raw) ?? String(raw ?? "").trim();
  if (!s) return null;
  const prefix = s.split("_", 1)[0];
  if ((CANDIDATURA_ETAPAS as readonly string[]).includes(prefix)) return prefix as CandidaturaEtapa;
  return null;
}

export function statusesForEtapa(etapa: CandidaturaEtapa): readonly CandidaturaStatus[] {
  return CANDIDATURA_STATUSES.filter((s) => s.startsWith(`${etapa}_`) || s === etapa);
}

export function statusMatchesEtapa(raw: string | null | undefined, etapa: CandidaturaEtapa): boolean {
  return etapaFromStatus(raw) === etapa;
}

export function normalizeCandidaturaStatus(raw: string | null | undefined): CandidaturaStatus | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  if ((CANDIDATURA_STATUSES as readonly string[]).includes(s)) return s as CandidaturaStatus;
  return LEGACY_STATUS_MAP[s] ?? null;
}

export function candidaturaStatusLabel(raw: string | null | undefined): string {
  const s = normalizeCandidaturaStatus(raw);
  if (s) return CANDIDATURA_STATUS_LABELS[s];
  const rawTrim = String(raw ?? "").trim();
  if (!rawTrim) return "—";
  return rawTrim.charAt(0).toUpperCase() + rawTrim.slice(1);
}

function isDeathTerminalStatus(s: CandidaturaStatus): boolean {
  return (CANDIDATURA_DEATH_TERMINAL_STATUSES as readonly string[]).includes(s);
}

function pillClassForEtapa(etapa: CandidaturaEtapa, morto: boolean): string {
  if (morto) {
    if (etapa === "abordado") return "ep ep-desistiu";
    return "ep ep-reprovado";
  }
  switch (etapa) {
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
    default:
      return "ep ep-inscrito";
  }
}

export function candidaturaStatusPillClass(raw: string | null | undefined): string {
  const s = normalizeCandidaturaStatus(raw);
  if (!s) return "ep ep-inscrito";
  const etapa = etapaFromStatus(s);
  if (!etapa) return "ep ep-inscrito";
  return pillClassForEtapa(etapa, isDeathTerminalStatus(s));
}

export function candidaturaStatusPill(raw: string | null | undefined): { className: string; label: string } {
  return {
    className: candidaturaStatusPillClass(raw),
    label: candidaturaStatusLabel(raw),
  };
}

/** Terminal = morte (libera candidato) ou contratado (fim positivo). */
export function isCandidaturaTerminal(raw: string | null | undefined): boolean {
  const s = normalizeCandidaturaStatus(raw);
  if (!s) return false;
  return isDeathTerminalStatus(s) || s === "contratado";
}

/** Morte da candidatura — libera o candidato para nova vaga. `abordado_sem_resposta` NÃO entra. */
export function isCandidaturaMorta(raw: string | null | undefined): boolean {
  const s = normalizeCandidaturaStatus(raw);
  if (!s) return false;
  return isDeathTerminalStatus(s);
}

/** Ainda no funil operacional (exclui só terminais de morte; contratado permanece). */
export function isCandidaturaNoFunil(raw: string | null | undefined): boolean {
  return !isCandidaturaMorta(raw);
}

/** Ordem no funil (16 status + desempate estável). */
export const CANDIDATURA_STATUS_RANK: Record<CandidaturaStatus, number> = {
  inscrito_aguardando_disparo: 10,
  inscrito_avancar: 11,
  inscrito_reprovado: 12,
  inscrito_falha: 13,
  abordado_em_conversa: 20,
  abordado_avancar: 21,
  abordado_sem_resposta: 22,
  abordado_reprovado_sem_resposta: 23,
  abordado_negativa: 24,
  qualificado_pendente_entrevista: 30,
  qualificado_avancar: 31,
  qualificado_reprovado_entrevista: 32,
  encaminhado_aguardando: 40,
  encaminhado_avancar: 41,
  encaminhado_reprovado: 42,
  contratado: 50,
};

/** Avançar manualmente: sempre para o estado de ENTRADA da próxima etapa. */
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

/** Contagens por etapa-mãe (Kanban). Terminais de morte entram na coluna da etapa. */
export type CandidaturaSummaryCounts = {
  todos: number;
  inscrito: number;
  abordado: number;
  qualificado: number;
  encaminhado: number;
  contratado: number;
};

export function emptySummaryCounts(): CandidaturaSummaryCounts {
  return {
    todos: 0,
    inscrito: 0,
    abordado: 0,
    qualificado: 0,
    encaminhado: 0,
    contratado: 0,
  };
}

export function summaryCountForStatus(
  raw: string | null | undefined
): keyof Omit<CandidaturaSummaryCounts, "todos"> | null {
  return etapaFromStatus(raw);
}

const LEGACY_BY_TARGET: Partial<Record<CandidaturaStatus, string[]>> = {};
for (const [legacy, target] of Object.entries(LEGACY_STATUS_MAP)) {
  (LEGACY_BY_TARGET[target] ??= []).push(legacy);
}

/**
 * Enum `status_candidatura` no Postgres — canônicos (16) + legados (Bloco 5 remove legados).
 * PostgREST rejeita valores fora desta lista.
 */
const POSTGRES_STATUS_ENUM = new Set<string>([
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
  "abordado",
  "aprovado",
  "desistiu",
  "em_entrevista",
  "em_teste",
  "em_triagem",
  "encaminhado",
  "inscrito",
  "interessado",
  "movido",
  "novo",
  "qualificado",
  "reprovado",
  "respondeu",
]);

/** Filtro DB: canônico direto + aliases legados (compat até Bloco 5). */
const CANONICAL_TO_DB_FILTER: Partial<Record<CandidaturaStatus, readonly string[]>> = {
  inscrito_aguardando_disparo: ["inscrito_aguardando_disparo", "inscrito", "novo", "em_triagem", "movido"],
  inscrito_avancar: ["inscrito_avancar"],
  inscrito_reprovado: ["inscrito_reprovado", "reprovado"],
  inscrito_falha: ["inscrito_falha"],
  abordado_em_conversa: ["abordado_em_conversa", "abordado", "respondeu"],
  abordado_avancar: ["abordado_avancar", "interessado"],
  abordado_sem_resposta: ["abordado_sem_resposta"],
  abordado_reprovado_sem_resposta: ["abordado_reprovado_sem_resposta"],
  abordado_negativa: ["abordado_negativa", "desistiu"],
  qualificado_pendente_entrevista: ["qualificado_pendente_entrevista"],
  qualificado_avancar: ["qualificado_avancar", "qualificado", "em_entrevista"],
  qualificado_reprovado_entrevista: ["qualificado_reprovado_entrevista"],
  encaminhado_aguardando: ["encaminhado_aguardando", "encaminhado", "em_teste"],
  encaminhado_avancar: ["encaminhado_avancar", "aprovado"],
  encaminhado_reprovado: ["encaminhado_reprovado"],
  contratado: ["contratado"],
};

/** Valores de `status` no banco para filtro da UI (só entradas válidas no enum legado). */
export function dbStatusValuesForFilter(keys: readonly CandidaturaStatus[]): string[] {
  const out = new Set<string>();
  for (const k of keys) {
    if (POSTGRES_STATUS_ENUM.has(k)) out.add(k);
    for (const legacy of CANONICAL_TO_DB_FILTER[k] ?? LEGACY_BY_TARGET[k] ?? []) {
      if (POSTGRES_STATUS_ENUM.has(legacy)) out.add(legacy);
    }
  }
  return [...out];
}

/** Valores no banco para filtrar por etapa-mãe (caixas do Kanban). */
export function dbStatusValuesForEtapaFilter(etapas: readonly CandidaturaEtapa[]): string[] {
  const statuses = etapas.flatMap((e) => [...statusesForEtapa(e)]);
  return dbStatusValuesForFilter(statuses);
}

/** Caixas do funil: 5 etapas-mãe + Todos. Mortos ficam dentro da coluna (`isCandidaturaMorta`). */
export const CANDIDATURA_FUNIL_BOXES: Array<{ key: keyof CandidaturaSummaryCounts; label: string }> = [
  { key: "todos", label: "Todos" },
  { key: "inscrito", label: "Inscrito" },
  { key: "abordado", label: "Abordado" },
  { key: "qualificado", label: "Qualificado" },
  { key: "encaminhado", label: "Encaminhado" },
  { key: "contratado", label: "Contratado" },
];
