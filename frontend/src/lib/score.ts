/**
 * Métricas no Gege (não misturar no mesmo número):
 * - candidatos_analise.score_ia — parecer da IA sobre o currículo (0–100).
 * - candidatos_analise.score_final — combinação IA + pós-entrevista quando existir
 *   pós (regra 0,5×IA + 0,5×pós em shared/score-final.js); sem entrevista, score_ia.
 * - candidaturas.score_compatibilidade — fit candidato×vaga (regras em score-calc / match).
 * - candidatos.score — legado / pós-entrevista no cadastro; não é o mesmo que score_ia.
 */

/**
 * Normaliza qualquer percentual 0–100 (número ou string vinda de numeric/JSON).
 */
export function normalizePercentScore(raw: number | string | null | undefined): number | null {
  if (raw == null) return null;
  const n = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** Score pós-entrevista para exibição: sem entrevista (null ou 0) → não mostrar na UI. */
export function displayScoreEntrevista(raw: number | string | null | undefined): number | null {
  const n = normalizePercentScore(raw);
  if (n == null || n <= 0) return null;
  return n;
}

/**
 * Score de compatibilidade candidato↔vaga: valor em candidaturas.score_compatibilidade.
 */
export function normalizeCompatScore(raw: number | null | undefined): number | null {
  return normalizePercentScore(raw ?? null);
}

export function isMatchCompatScore(raw: number | null | undefined): boolean {
  const n = normalizeCompatScore(raw);
  return n != null && n >= 90;
}
