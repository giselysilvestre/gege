export const ALLOWED_CANDIDATE_TAGS = [
  "crescimento",
  "food",
  "lideranca",
  "alerta_instabilidade",
  "primeiro_emprego",
] as const;

export type AllowedCandidateTag = typeof ALLOWED_CANDIDATE_TAGS[number];

const ALLOWED_SET = new Set<string>(ALLOWED_CANDIDATE_TAGS);

function normalizeTagToken(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, "_")
    .replace(/-/g, "_");
}

const TAG_ALIAS: Record<string, AllowedCandidateTag> = {
  crescimento: "crescimento",
  growth: "crescimento",
  food: "food",
  alimentos: "food",
  alimentacao: "food",
  lideranca: "lideranca",
  lider: "lideranca",
  alerta_instabilidade: "alerta_instabilidade",
  instabilidade: "alerta_instabilidade",
  alta_rotatividade: "alerta_instabilidade",
  primeiro_emprego: "primeiro_emprego",
};

export function normalizeAllowedCandidateTag(raw: string | null | undefined): AllowedCandidateTag | null {
  if (!raw) return null;
  const token = normalizeTagToken(String(raw));
  const mapped = TAG_ALIAS[token] ?? (ALLOWED_SET.has(token) ? (token as AllowedCandidateTag) : null);
  return mapped ?? null;
}

export function toAllowedCandidateTags(list: Array<string | null | undefined>): AllowedCandidateTag[] {
  const out = new Set<AllowedCandidateTag>();
  for (const item of list) {
    const t = normalizeAllowedCandidateTag(item);
    if (t) out.add(t);
  }
  return [...out];
}
