/**
 * Espelho de shared/score-final.js — manter fórmula idêntica.
 * Fonte canônica: ../../shared/score-final.js
 */

import { normalizePercentScore } from "@/lib/score";

/** Combina score_ia + score_pos_entrevista (0.5/0.5 quando ambos existem). */
export function computeScoreFinal(
  scoreIa: number | string | null | undefined,
  scorePos: number | string | null | undefined
): number | null {
  const ia = normalizePercentScore(scoreIa);
  const pos = normalizePercentScore(scorePos);
  if (ia == null && pos == null) return null;
  if (pos == null) return ia;
  if (ia == null) return pos;
  return Math.round(0.5 * ia + 0.5 * pos);
}
